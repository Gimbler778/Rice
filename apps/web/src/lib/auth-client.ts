import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

import { env } from "@/lib/env";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_BASE_URL,
  plugins: [genericOAuthClient()],
  fetchOptions: {
    credentials: "include",
  },
});
