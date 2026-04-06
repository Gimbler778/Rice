import pino from "pino";
import { env } from "./env";
import { createRequire } from "node:module";

const isDevelopment = env.NODE_ENV === "development";

// Check if pino-pretty is available
let usePretty = false;
if (isDevelopment) {
  // This file runs in ESM (`type: module`), so we need `createRequire`
  // instead of relying on the CommonJS `require` global.
  const require = createRequire(import.meta.url);
  try {
    require.resolve("pino-pretty");
    usePretty = true;
  } catch {
    // pino-pretty not available, use default formatting
    usePretty = false;
  }
}

export default pino(
  usePretty
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
            singleLine: true,
          },
        },
      }
    : {
        level: isDevelopment ? "debug" : "info",
      },
);
