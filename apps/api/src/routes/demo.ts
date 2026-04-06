import { Router } from "express";
import { getDemoData, demoMutation } from "../service/demo";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";

const router = Router();

router.get("/demo", (_req, res) => {
  return sendSuccess(
    res,
    RESPONSE_CODE.OK,
    "Demo data fetched successfully",
    getDemoData(),
  );
});

router.post("/demo-mutate", (req, res) => {
  const { input } = req.body;
  if (typeof input !== "string" || !input.trim()) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid request",
      "Input is required",
    );
  }
  return sendSuccess(
    res,
    RESPONSE_CODE.OK,
    "Demo mutation completed successfully",
    demoMutation(input),
  );
});

export default router;
