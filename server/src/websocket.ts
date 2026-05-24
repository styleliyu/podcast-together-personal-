import type { Server as HttpServer } from "http"
import WebSocket, { WebSocketServer } from "ws"
import { roomRepo } from "./db"
import type { PtWebSocket, ReqBase, ReqOperatePlayer, ResToFe, Room, RoomConfig, RoomStatus, SpeedRate } from "./types"

const MIN_DURATION_FOR_A_PERSON = 250
const defaultRoomCfg: RoomConfig = {
  everyoneCanOperatePlayer: "Y"
}

const sockets = new Set<PtWebSocket>()

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`)
    if (url.pathname !== "/ws") return

    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit("connection", ws, request)
    })
  })

  wss.on("connection", ws => {
    const socket = ws as PtWebSocket
    socket.createStamp = Date.now()
    sockets.add(socket)
    send(socket, { responseType: "CONNECTED" })

    socket.on("message", data => {
      void handleMessage(socket, data)
    })
    socket.on("close", () => {
      sockets.delete(socket)
    })
    socket.on("error", err => {
      console.error("WebSocket error", err)
      sockets.delete(socket)
    })
  })

  return wss
}

async function handleMessage(socket: PtWebSocket, data: unknown): Promise<void> {
  const req = getReqObject(data)
  if (!req || !checkReqObject(req)) {
    socket.close()
    return
  }

  if (req.operateType === "FIRST_SEND") await handleFirstSend(socket, req)
  else if (req.operateType === "SET_PLAYER") await handleSetPlayer(socket, req as ReqOperatePlayer)
  else if (req.operateType === "HEARTBEAT") handleHeartbeat(socket, req)
}

function handleHeartbeat(socket: PtWebSocket, req: ReqBase): void {
  if (!socket.roomId || socket.roomId !== req.roomId) {
    socket.close()
    return
  }
  send(socket, { responseType: "HEARTBEAT" })
}

async function handleFirstSend(socket: PtWebSocket, req: ReqBase): Promise<void> {
  const room = roomRepo.get(req.roomId)
  const guestId = getOperatorGuestId(req["x-pt-local-id"], room)
  if (!room || !guestId) {
    socket.close()
    return
  }

  const roomCfg = room.config || defaultRoomCfg
  socket.roomId = req.roomId
  send(socket, {
    responseType: "NEW_STATUS",
    roomStatus: {
      roomId: req.roomId,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      operator: room.operator,
      contentStamp: room.contentStamp,
      operateStamp: room.operateStamp,
      everyoneCanOperatePlayer: roomCfg.everyoneCanOperatePlayer
    }
  })
}

async function handleSetPlayer(socket: PtWebSocket, req: ReqOperatePlayer): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room) return

  const clientId = req["x-pt-local-id"]
  const roomCfg = room.config || defaultRoomCfg
  const isOwner = room.owner === clientId
  if (!isOwner && roomCfg.everyoneCanOperatePlayer === "N") return

  const guestId = getOperatorGuestId(clientId, room)
  if (!guestId) {
    socket.close()
    return
  }

  if (guestId === room.operator && req["x-pt-stamp"] - room.operateStamp < MIN_DURATION_FOR_A_PERSON) return

  const newRoomCfg = { ...roomCfg }
  const patch: Partial<Room> = {
    playStatus: req.playStatus,
    speedRate: req.speedRate,
    contentStamp: req.contentStamp,
    operateStamp: req["x-pt-stamp"],
    operator: guestId
  }

  const roomStatus: RoomStatus = {
    roomId: req.roomId,
    playStatus: req.playStatus,
    speedRate: req.speedRate,
    contentStamp: req.contentStamp,
    operateStamp: req["x-pt-stamp"],
    operator: guestId
  }

  if (req.everyoneCanOperatePlayer && isOwner) {
    newRoomCfg.everyoneCanOperatePlayer = req.everyoneCanOperatePlayer
    patch.config = newRoomCfg
    roomStatus.everyoneCanOperatePlayer = req.everyoneCanOperatePlayer
  }

  roomRepo.update(req.roomId, patch)
  broadcastToRoom(req.roomId, {
    responseType: "NEW_STATUS",
    roomStatus
  })
}

function broadcastToRoom(roomId: string, data: ResToFe): void {
  for (const socket of sockets) {
    if (socket.roomId === roomId && socket.readyState === WebSocket.OPEN) send(socket, data)
  }
}

function send(socket: PtWebSocket, data: ResToFe): void {
  socket.send(JSON.stringify(data))
}

function checkReqObject(data: ReqBase | ReqOperatePlayer): boolean {
  if (!data) return false
  if (!data.operateType || !data.roomId || !data["x-pt-local-id"] || !data["x-pt-stamp"]) return false
  if (!["FIRST_SEND", "SET_PLAYER", "HEARTBEAT"].includes(data.operateType)) return false

  if (data.operateType === "SET_PLAYER") {
    const req = data as ReqOperatePlayer
    if (!req.playStatus || !req.speedRate) return false
    if (!["PLAYING", "PAUSED"].includes(req.playStatus)) return false
    if (!isSpeedRate(req.speedRate)) return false
    if (typeof req.contentStamp !== "number") return false
  }

  return true
}

function getReqObject(data: unknown): ReqBase | undefined {
  try {
    const tmpStr = Buffer.isBuffer(data) ? data.toString() : String(data || "")
    if (!tmpStr) return undefined
    return JSON.parse(tmpStr) as ReqBase
  } catch (err) {
    console.error("parse websocket message failed", err)
    return undefined
  }
}

function getOperatorGuestId(clientId: string, room?: Room): string | undefined {
  if (!room) return undefined
  if (room.oState === "EXPIRED" || room.oState === "DELETED") return undefined
  const me = room.participants.find(v => v.nonce === clientId)
  return me?.guestId
}

function isSpeedRate(value: string): value is SpeedRate {
  return ["0.8", "1", "1.2", "1.5", "1.7"].includes(value)
}
