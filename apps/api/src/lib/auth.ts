import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";

import { db } from "@/db/client";
import { env } from "@/lib/env";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/mail";
import * as schema from "@/db/schema/index";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: schema,
  }),
  user: {
    additionalFields: {
      role: {
        type: ["developer", "manager", "admin", "auditor"],
        required: false,
        defaultValue: "developer",
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      void sendPasswordResetEmail(user.email, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendVerificationEmail(user.email, url, user.name);
    },
  },
  socialProviders: {
    atlassian: {
      clientId: env.ATLASSIAN_CLIENT_ID,
      clientSecret: env.ATLASSIAN_CLIENT_SECRET,
      disableSignUp: true,
      scope: [
        "read:me",
        "read:account",
        "read:jira-work",
        "read:jira-user",
        "offline_access",
        "repository",
        "pullrequest",
        "account",
      ],
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["atlassian", "bitbucket", "email-password"],
    },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "bitbucket",
          clientId: env.BITBUCKET_CLIENT_ID,
          clientSecret: env.BITBUCKET_CLIENT_SECRET,
          authorizationUrl: "https://bitbucket.org/site/oauth2/authorize",
          tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
          userInfoUrl: "https://api.bitbucket.org/2.0/user",
          redirectURI: env.BITBUCKET_OAUTH_REDIRECT_URI,
          authentication: "basic",
          scopes: [
            "account",
            "email",
            "repository",
            "pullrequest",
          ],
          disableSignUp: true,
          getUserInfo: async (tokens) => {
            const profileResponse = await fetch(
              "https://api.bitbucket.org/2.0/user",
              {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              },
            );

            if (!profileResponse.ok) {
              throw new Error("Unable to fetch Bitbucket profile");
            }

            const profile = (await profileResponse.json()) as {
              account_id?: string;
              uuid?: string;
              display_name?: string;
              nickname?: string;
              links?: {
                avatar?: {
                  href?: string;
                };
              };
            };

            const emailResponse = await fetch(
              "https://api.bitbucket.org/2.0/user/emails",
              {
                headers: {
                  Authorization: `Bearer ${tokens.accessToken}`,
                },
              },
            );

            let primaryEmail: string | undefined;

            if (emailResponse.ok) {
              const emails = (await emailResponse.json()) as {
                values?: Array<{ email?: string; is_primary?: boolean }>;
              };

              primaryEmail = emails.values?.find(
                (entry) => entry.is_primary,
              )?.email;
            }

            return {
              id: profile.account_id ?? profile.uuid ?? "",
              name:
                profile.display_name ?? profile.nickname ?? "Bitbucket User",
              email: primaryEmail,
              image: profile.links?.avatar?.href,
              emailVerified: false,
            };
          },
        },
      ],
    }),
  ],
  trustedOrigins: [env.CORS_ORIGIN],
});
