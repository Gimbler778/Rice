import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.url(),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  ATLASSIAN_CLIENT_ID: z.string().min(1),
  ATLASSIAN_CLIENT_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z
    .string()
    .min(1)
    .describe('Sender, e.g. "App Name <noreply@yourdomain.com>"'),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  BITBUCKET_CLIENT_ID: z.string().min(1),
  BITBUCKET_CLIENT_SECRET: z.string().min(1),
  BITBUCKET_OAUTH_REDIRECT_URI: z.url().optional(),
});

export const env = envSchema.parse(process.env);
