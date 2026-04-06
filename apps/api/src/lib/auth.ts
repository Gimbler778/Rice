import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db/client";
import { env } from "@/lib/env";
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
  socialProviders: {
    atlassian: {
      clientId: env.ATLASSIAN_CLIENT_ID,
      clientSecret: env.ATLASSIAN_CLIENT_SECRET,
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
  trustedOrigins: [env.CORS_ORIGIN],
});
