import http from "http"
import "dotenv/config"
import express from "express"
import cors from "cors"
import { handleParseText } from "./parseText"
import { handleRoomOperate } from "./roomService"
import { startRoomClock } from "./clock"
import { setupWebSocket } from "./websocket"
import { dbPath } from "./db"
import { getUploadRoot, handleUploadAudio, handleUploadError, uploadMiddleware } from "./upload"
import { cancelPlaylistImport } from "./playlistImport"
import { env } from "./config/env"

const app = express()
const port = env.port
const host = env.host
const corsOrigin = env.corsOrigin

app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }))
app.use(express.json({ limit: "1mb" }))
app.use("/uploads", express.static(getUploadRoot(), {
  setHeaders(res) {
    res.setHeader("Accept-Ranges", "bytes")
  }
}))

app.get("/health", (_req, res) => {
  res.json({ code: "0000", data: { status: "ok" } })
})

app.post("/api/pt-service", (req, res) => {
  if (req.method !== "POST") {
    res.json({ code: "E4005" })
    return
  }
  res.json({ code: "0000", data: { stamp: Date.now() } })
})

app.post("/api/parse-text", async (req, res) => {
  const result = await handleParseText({
    body: req.body,
    method: req.method,
    headers: req.headers,
    ip: req.ip
  })
  res.json(result)
})

app.post("/api/upload-audio", uploadMiddleware, handleUploadAudio)
app.use(handleUploadError)

app.post("/api/playlist-import/cancel", (req, res) => {
  const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : ""
  if (!roomId) {
    res.json({ code: "E4000", message: "缺少 roomId" })
    return
  }

  const result = cancelPlaylistImport(roomId)
  res.json({
    code: result.code,
    message: result.showMsg || result.errMsg || "已取消导入任务",
    data: result.data
  })
})

app.post("/api/room-operate", async (req, res) => {
  const result = await handleRoomOperate({
    body: req.body,
    method: req.method,
    headers: req.headers,
    ip: req.ip
  })
  res.json(result)
})

app.use("/api", (_req, res) => {
  res.status(404).json({ code: "E4044" })
})

const server = http.createServer(app)
setupWebSocket(server)
startRoomClock(env.roomCleanupIntervalMs)

server.listen(port, host, () => {
  console.log(`podcast-together API listening on http://${host}:${port}`)
  console.log(`SQLite database: ${dbPath}`)
})
