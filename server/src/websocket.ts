import type { Server as HttpServer } from "http"
import WebSocket, { WebSocketServer } from "ws"
import { roomRepo } from "./db"
import { resolveQueueItemContent } from "./music/musicAdapter"
import type {
  ContentData,
  PlayMode,
  PtWebSocket,
  ReqAdvanceQueue,
  ReqBase,
  ReqOperatePlayer,
  ReqSetPlayMode,
  ReqSetQueueIndex,
  ResToFe,
  Room,
  RoomConfig,
  RoomQueue,
  RoomStatus,
  SpeedRate
} from "./types"

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
  else if (req.operateType === "SET_QUEUE_INDEX") await handleSetQueueIndex(socket, req as ReqSetQueueIndex)
  else if (req.operateType === "ADVANCE_QUEUE") await handleAdvanceQueue(socket, req as ReqAdvanceQueue)
  else if (req.operateType === "SET_PLAY_MODE") await handleSetPlayMode(socket, req as ReqSetPlayMode)
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
      content: room.content,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      operator: room.operator,
      contentStamp: room.contentStamp,
      operateStamp: room.operateStamp,
      everyoneCanOperatePlayer: roomCfg.everyoneCanOperatePlayer,
      queue: room.queue,
      currentIndex: room.queue?.currentIndex,
      playMode: room.queue?.playMode
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

async function handleSetQueueIndex(socket: PtWebSocket, req: ReqSetQueueIndex): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room?.queue || !canOperateQueue(room, req["x-pt-local-id"])) return
  await switchQueueIndex(req.roomId, room, req.index, req["x-pt-stamp"], req["x-pt-local-id"], "PLAYING")
}

async function handleAdvanceQueue(socket: PtWebSocket, req: ReqAdvanceQueue): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room?.queue || !canOperateQueue(room, req["x-pt-local-id"])) return
  if (req.fromIndex !== room.queue.currentIndex) return

  const nextIndex = getNextQueueIndex(room.queue, req.direction)
  if (nextIndex < 0) {
    await pauseQueueAtEnd(req.roomId, room, req)
    return
  }

  await switchQueueIndex(req.roomId, room, nextIndex, req["x-pt-stamp"], req["x-pt-local-id"], req.direction === "auto" ? "PLAYING" : room.playStatus)
}

async function handleSetPlayMode(socket: PtWebSocket, req: ReqSetPlayMode): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room?.queue || !canOperateQueue(room, req["x-pt-local-id"])) return
  const guestId = getOperatorGuestId(req["x-pt-local-id"], room)
  if (!guestId || !isPlayMode(req.playMode)) return

  const queue: RoomQueue = { ...room.queue, playMode: req.playMode }
  roomRepo.update(req.roomId, { queue, operator: guestId, operateStamp: req["x-pt-stamp"] })
  broadcastToRoom(req.roomId, {
    responseType: "NEW_STATUS",
    roomStatus: {
      roomId: req.roomId,
      content: room.content,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      contentStamp: room.contentStamp,
      operateStamp: req["x-pt-stamp"],
      operator: guestId,
      queue,
      currentIndex: queue.currentIndex,
      playMode: queue.playMode
    }
  })
}

async function pauseQueueAtEnd(roomId: string, room: Room, req: ReqAdvanceQueue): Promise<void> {
  const guestId = getOperatorGuestId(req["x-pt-local-id"], room)
  if (!guestId) return
  roomRepo.update(roomId, {
    playStatus: "PAUSED",
    contentStamp: 0,
    operateStamp: req["x-pt-stamp"],
    operator: guestId
  })
  broadcastToRoom(roomId, {
    responseType: "NEW_STATUS",
    roomStatus: {
      roomId,
      playStatus: "PAUSED",
      speedRate: room.speedRate,
      contentStamp: 0,
      operateStamp: req["x-pt-stamp"],
      operator: guestId,
      queue: room.queue,
      currentIndex: room.queue?.currentIndex,
      playMode: room.queue?.playMode
    }
  })
}

async function switchQueueIndex(
  roomId: string,
  room: Room,
  index: number,
  stamp: number,
  clientId: string,
  nextPlayStatus: "PLAYING" | "PAUSED"
): Promise<void> {
  if (!room.queue || index < 0 || index >= room.queue.items.length) return
  const guestId = getOperatorGuestId(clientId, room)
  if (!guestId) return

  const content = await resolveQueueItemContent(room.queue.items[index])
  if (!content?.audioUrl) return
  const queue: RoomQueue = {
    ...room.queue,
    currentIndex: index,
    items: room.queue.items.map((item, idx) => idx === index ? { ...item, audioUrl: content.audioUrl } : item)
  }
  const cleanContent: ContentData = { ...content }
  delete cleanContent.queue

  roomRepo.update(roomId, {
    content: cleanContent,
    queue,
    playStatus: nextPlayStatus,
    contentStamp: 0,
    operateStamp: stamp,
    operator: guestId
  })
  broadcastToRoom(roomId, {
    responseType: "NEW_STATUS",
    roomStatus: {
      roomId,
      content: cleanContent,
      playStatus: nextPlayStatus,
      speedRate: room.speedRate,
      contentStamp: 0,
      operateStamp: stamp,
      operator: guestId,
      queue,
      currentIndex: queue.currentIndex,
      playMode: queue.playMode
    }
  })
}

function canOperateQueue(room: Room, clientId: string): boolean {
  const roomCfg = room.config || defaultRoomCfg
  const isOwner = room.owner === clientId
  return isOwner || roomCfg.everyoneCanOperatePlayer !== "N"
}

function getNextQueueIndex(queue: RoomQueue, direction: "next" | "prev" | "auto"): number {
  if (queue.items.length < 1) return -1
  if (queue.playMode === "single" && direction === "auto") return queue.currentIndex
  if (queue.playMode === "shuffle" && direction !== "prev") {
    if (queue.items.length === 1) return queue.currentIndex
    let next = queue.currentIndex
    for (let i = 0; i < 8 && next === queue.currentIndex; i++) next = Math.floor(Math.random() * queue.items.length)
    return next === queue.currentIndex ? (queue.currentIndex + 1) % queue.items.length : next
  }
  if (direction === "prev") return queue.currentIndex > 0 ? queue.currentIndex - 1 : 0
  const next = queue.currentIndex + 1
  if (next >= queue.items.length) return direction === "auto" ? -1 : queue.currentIndex
  return next
}

function broadcastToRoom(roomId: string, data: ResToFe): void {
  for (const socket of sockets) {
    if (socket.roomId === roomId && socket.readyState === WebSocket.OPEN) send(socket, data)
  }
}

function send(socket: PtWebSocket, data: ResToFe): void {
  socket.send(JSON.stringify(data))
}

function checkReqObject(data: ReqBase | ReqOperatePlayer | ReqSetQueueIndex | ReqAdvanceQueue | ReqSetPlayMode): boolean {
  if (!data) return false
  if (!data.operateType || !data.roomId || !data["x-pt-local-id"] || !data["x-pt-stamp"]) return false
  if (!["FIRST_SEND", "SET_PLAYER", "HEARTBEAT", "SET_QUEUE_INDEX", "ADVANCE_QUEUE", "SET_PLAY_MODE"].includes(data.operateType)) return false

  if (data.operateType === "SET_PLAYER") {
    const req = data as ReqOperatePlayer
    if (!req.playStatus || !req.speedRate) return false
    if (!["PLAYING", "PAUSED"].includes(req.playStatus)) return false
    if (!isSpeedRate(req.speedRate)) return false
    if (typeof req.contentStamp !== "number") return false
  }

  if (data.operateType === "SET_QUEUE_INDEX") {
    const req = data as ReqSetQueueIndex
    if (!Number.isInteger(req.index)) return false
  }

  if (data.operateType === "ADVANCE_QUEUE") {
    const req = data as ReqAdvanceQueue
    if (!["next", "prev", "auto"].includes(req.direction)) return false
    if (!Number.isInteger(req.fromIndex)) return false
  }

  if (data.operateType === "SET_PLAY_MODE") {
    const req = data as ReqSetPlayMode
    if (!isPlayMode(req.playMode)) return false
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

function isPlayMode(value: string): value is PlayMode {
  return ["sequence", "shuffle", "single"].includes(value)
}
