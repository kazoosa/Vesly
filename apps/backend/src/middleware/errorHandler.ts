import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/errors.js";
import { logger } from "../logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    let firstHumanMessage: string | null = null;
    for (const issue of err.issues) {
      const path = issue.path.join(".");
      const msg = humanizeZodIssue(issue);
      if (path && !fields[path]) fields[path] = msg;
      if (!firstHumanMessage) firstHumanMessage = path ? `${path}: ${msg}` : msg;
    }
    return res.status(400).json({
      error_type: "VALIDATION_ERROR",
      error_code: "INVALID_INPUT",
      error_message: firstHumanMessage ?? "Input validation failed",
      display_message: firstHumanMessage,
      fields,
      request_id: req.requestId,
      environment: process.env.ENVIRONMENT ?? "sandbox",
      details: err.issues,
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error_type: "API_ERROR",
      error_code: err.code,
      error_message: err.message,
      display_message: null,
      request_id: req.requestId,
      environment: process.env.ENVIRONMENT ?? "sandbox",
      details: err.details ?? null,
    });
  }
  logger.error({ err, path: req.path }, "unhandled error");
  return res.status(500).json({
    error_type: "API_ERROR",
    error_code: "INTERNAL_ERROR",
    error_message: "Internal server error",
    request_id: req.requestId,
    environment: process.env.ENVIRONMENT ?? "sandbox",
  });
};

function humanizeZodIssue(issue: import("zod").ZodIssue): string {
  switch (issue.code) {
    case "invalid_string":
      if (issue.validation === "email") return "Must be a valid email address";
      return issue.message;
    case "too_small":
      if (issue.type === "string") return `Must be at least ${issue.minimum} characters`;
      if (issue.type === "array") return `Must have at least ${issue.minimum} item${issue.minimum === 1 ? "" : "s"}`;
      return `Must be at least ${issue.minimum}`;
    case "too_big":
      if (issue.type === "string") return `Must be at most ${issue.maximum} characters`;
      return `Must be at most ${issue.maximum}`;
    case "invalid_type":
      return `Expected ${issue.expected}, got ${issue.received}`;
    default:
      return issue.message;
  }
}
