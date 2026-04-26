import z from "zod";

const envSchema = z.object({
  VITE_WEB_BASE_URL: z.url().default("http://localhost:5173"),
  VITE_SERVER_BASE_URL: z.url().default("http://localhost:4000"),
});

export const env = envSchema.parse(import.meta.env);
