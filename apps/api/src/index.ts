import cors from "cors";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import logger from "@/lib/logger";
import { RESPONSE_CODE, sendSuccess } from "@/lib/response";

import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import integrationsRouter from "./routes/integrations";
import timesheetsRouter from "./routes/timesheets";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

app.all("/api/auth/{*any}", toNodeHandler(auth));

// Request/response logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  logger.info({ method: req.method, url: req.originalUrl }, "Request received");

  const cleanup = () => {
    res.removeListener("finish", cleanup);
    res.removeListener("close", cleanup);
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
    };
    if (res.statusCode >= 400) {
      logger.error(
        { ...logData, headers: req.headers, body: req.body },
        "Request error",
      );
    } else {
      logger.info(logData, "Response sent");
    }
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);
  next();
});
app.use(express.json());
app.use("/api", timesheetsRouter);
app.use("/api", integrationsRouter);

app.get("/health", (_req, res) => {
  return sendSuccess(res, RESPONSE_CODE.OK, "Health check passed", {
    status: "ok",
  });
});

app.listen(env.PORT, () => {
  logger.info(`API running on http://localhost:${env.PORT}`);
});
