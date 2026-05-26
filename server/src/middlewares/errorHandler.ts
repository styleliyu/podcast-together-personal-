import type { ErrorRequestHandler, RequestHandler } from "express"
import { logger } from "../utils/logger"

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ code: "E4044" })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error("Unhandled request error", {
    message: err instanceof Error ? err.message : String(err)
  })
  res.status(500).json({
    code: "E5000",
    showMsg: "Server error"
  })
}
