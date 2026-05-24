import http from "http"
import "dotenv/config"
import express from "express"
import cors from "cors"
import { handleParseText } from "./parseText"
import { handleRoomOperate } from "./roomService"
import { startRoomClock } from "./clock"
import { setupWebSocket } from "./websocket"
import { dbPath } from "./db"

const app = express()
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || "127.0.0.1"
const corsOrigin = process.env.CORS_ORIGIN || "*"
const roomClockIntervalMs = Number(process.env.ROOM_CLOCK_INTERVAL_MS || 30000)

app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin }))
app.use(express.json({ limit: "1mb" }))

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
startRoomClock(roomClockIntervalMs)

server.listen(port, host, () => {
  console.log(`podcast-together API listening on http://${host}:${port}`)
  console.log(`SQLite database: ${dbPath}`)
})
