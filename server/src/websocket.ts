import type { Server as HttpServer } from "http"
import { WebSocketServer } from "ws"
import { roomRepo } from "./db"
import { resolveQueueItemContent } from "./music/musicAdapter"
import { getPlaylistImportProgress, importPlaylistByLink, setPlaylistImportBroadcaster } from "./playlistImport"
import { buildPlaybackUpdate, canOperatePlayer, shouldIgnoreRapidSameOperator } from "./playbackService"
import { buildQueueRoomStatus, canOperateQueue, contentToQueueItem, getNextQueueIndex, isPlayMode, sanitizeQueueItems } from "./queueService"
import { broadcaster } from "./websocket/broadcaster"
import type {
  ContentData,
  QueueItem,
  ReqAppendQueue,
  ReqImportPlaylist,
  PtWebSocket,
  ReqAdvanceQueue,
  ReqBase,
  ReqOperatePlayer,
  ReqSetPlayMode,
  ReqSetQueueIndex,
  Room,
  RoomConfig,
  RoomQueue,
  RoomStatus,
  SpeedRate
} from "./types"

const LAZY_RESOLVE_ROOM_INTERVAL_MS = 2000
const LAZY_RESOLVE_FAIL_COOLDOWN_MS = 30 * 1000
const defaultRoomCfg: RoomConfig = {
  everyoneCanOperatePlayer: "Y"
}

const lazyResolveRoomStamps = new Map<string, number>()
const lazyResolveFailCache = new Map<string, number>()

export function setupWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })
  setPlaylistImportBroadcaster(broadcaster.broadcastToRoom)

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
    broadcaster.add(socket)
    broadcaster.send(socket, { responseType: "CONNECTED" })

    socket.on("message", data => {
      void handleMessage(socket, data)
    })
    socket.on("close", () => {
      broadcaster.remove(socket)
    })
    socket.on("error", err => {
      console.error("WebSocket error", err)
      broadcaster.remove(socket)
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

  if (req.operateType !== "FIRST_SEND" && !isSocketInRoom(socket, req.roomId)) {
    socket.close()
    return
  }

  if (req.operateType === "FIRST_SEND") await handleFirstSend(socket, req)
  else if (req.operateType === "SET_PLAYER") await handleSetPlayer(socket, req as ReqOperatePlayer)
  else if (req.operateType === "SET_QUEUE_INDEX") await handleSetQueueIndex(socket, req as ReqSetQueueIndex)
  else if (req.operateType === "ADVANCE_QUEUE") await handleAdvanceQueue(socket, req as ReqAdvanceQueue)
  else if (req.operateType === "SET_PLAY_MODE") await handleSetPlayMode(socket, req as ReqSetPlayMode)
  else if (req.operateType === "APPEND_QUEUE") await handleAppendQueue(socket, req as ReqAppendQueue)
  else if (req.operateType === "IMPORT_PLAYLIST") await handleImportPlaylist(socket, req as ReqImportPlaylist)
  else if (req.operateType === "HEARTBEAT") handleHeartbeat(socket, req)
}

function isSocketInRoom(socket: PtWebSocket, roomId: string): boolean {
  return Boolean(socket.roomId && socket.roomId === roomId)
}

function handleHeartbeat(socket: PtWebSocket, req: ReqBase): void {
  if (!socket.roomId || socket.roomId !== req.roomId) {
    socket.close()
    return
  }
  broadcaster.send(socket, { responseType: "HEARTBEAT" })
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
  broadcaster.send(socket, {
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
  const progress = getPlaylistImportProgress(req.roomId)
  if (progress) {
    broadcaster.send(socket, {
      responseType: "PLAYLIST_IMPORT_PROGRESS",
      playlistImportProgress: progress
    })
  }
}

async function handleSetPlayer(socket: PtWebSocket, req: ReqOperatePlayer): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room) return

  const clientId = req["x-pt-local-id"]
  const isOwner = room.owner === clientId
  if (!canOperatePlayer(room, clientId, defaultRoomCfg)) return

  const guestId = getOperatorGuestId(clientId, room)
  if (!guestId) {
    socket.close()
    return
  }

  if (shouldIgnoreRapidSameOperator(room, guestId, req["x-pt-stamp"])) return

  const { patch, roomStatus } = buildPlaybackUpdate({ room, roomId: req.roomId, req, guestId, isOwner, defaultRoomCfg })
  roomRepo.update(req.roomId, patch)
  broadcaster.broadcastToRoom(req.roomId, {
    responseType: "NEW_STATUS",
    roomStatus
  })
}

async function handleSetQueueIndex(socket: PtWebSocket, req: ReqSetQueueIndex): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room?.queue || !canOperateQueue(room, req["x-pt-local-id"], defaultRoomCfg)) return
  await switchQueueIndex(req.roomId, room, req.index, req["x-pt-stamp"], req["x-pt-local-id"], "PLAYING")
}

async function handleAdvanceQueue(socket: PtWebSocket, req: ReqAdvanceQueue): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room?.queue || !canOperateQueue(room, req["x-pt-local-id"], defaultRoomCfg)) return
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
  if (!room?.queue || !canOperateQueue(room, req["x-pt-local-id"], defaultRoomCfg)) return
  const guestId = getOperatorGuestId(req["x-pt-local-id"], room)
  if (!guestId || !isPlayMode(req.playMode)) return

  const queue: RoomQueue = { ...room.queue, playMode: req.playMode }
  roomRepo.update(req.roomId, { queue, operator: guestId })
  broadcaster.broadcastToRoom(req.roomId, {
    responseType: "NEW_STATUS",
    roomStatus: buildQueueRoomStatus(req.roomId, room, queue, guestId)
  })
}

async function handleAppendQueue(socket: PtWebSocket, req: ReqAppendQueue): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room || !canOperateQueue(room, req["x-pt-local-id"], defaultRoomCfg)) return
  const guestId = getOperatorGuestId(req["x-pt-local-id"], room)
  if (!guestId) return

  const incoming = sanitizeQueueItems(req.items)
  if (!incoming.length) return

  const queue: RoomQueue = room.queue
    ? { ...room.queue, items: [...room.queue.items, ...incoming] }
    : { items: [contentToQueueItem(room.content), ...incoming], currentIndex: 0, playMode: "sequence" }

  roomRepo.update(req.roomId, { queue, operator: guestId })
  broadcaster.broadcastToRoom(req.roomId, {
    responseType: "NEW_STATUS",
    roomStatus: buildQueueRoomStatus(req.roomId, room, queue, guestId)
  })
}

async function handleImportPlaylist(socket: PtWebSocket, req: ReqImportPlaylist): Promise<void> {
  const room = roomRepo.get(req.roomId)
  if (!room || !canOperateQueue(room, req["x-pt-local-id"], defaultRoomCfg)) return
  if (!getOperatorGuestId(req["x-pt-local-id"], room)) return
  if (!/^https?:\/\//i.test(req.link || "")) return

  const progress = await importPlaylistByLink(req.roomId, req.link)
  broadcaster.send(socket, {
    responseType: "PLAYLIST_IMPORT_PROGRESS",
    playlistImportProgress: progress
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
  broadcaster.broadcastToRoom(roomId, {
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

  const targetItem = room.queue.items[index]
  if (!targetItem.audioUrl && !canLazyResolveQueueItem(roomId, targetItem)) return
  const content = await resolveQueueItemContent(targetItem)
  if (!content?.audioUrl) {
    rememberLazyResolveFailure(targetItem)
    return
  }
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
  broadcaster.broadcastToRoom(roomId, {
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

function canLazyResolveQueueItem(roomId: string, item: QueueItem): boolean {
  const now = Date.now()
  const itemKey = queueItemResolveKey(item)
  const failedAt = lazyResolveFailCache.get(itemKey)
  if (failedAt && now - failedAt < LAZY_RESOLVE_FAIL_COOLDOWN_MS) return false
  if (failedAt) lazyResolveFailCache.delete(itemKey)

  const lastRoomResolve = lazyResolveRoomStamps.get(roomId) || 0
  if (now - lastRoomResolve < LAZY_RESOLVE_ROOM_INTERVAL_MS) return false
  lazyResolveRoomStamps.set(roomId, now)
  return true
}

function rememberLazyResolveFailure(item: QueueItem): void {
  lazyResolveFailCache.set(queueItemResolveKey(item), Date.now())
}

function queueItemResolveKey(item: QueueItem): string {
  return `${item.sourceType}:${item.resourceId || item.linkUrl || item.id}`
}

function checkReqObject(data: ReqBase | ReqOperatePlayer | ReqSetQueueIndex | ReqAdvanceQueue | ReqSetPlayMode | ReqAppendQueue | ReqImportPlaylist): boolean {
  if (!data) return false
  if (!data.operateType || !data.roomId || !data["x-pt-local-id"] || !data["x-pt-stamp"]) return false
  if (!["FIRST_SEND", "SET_PLAYER", "HEARTBEAT", "SET_QUEUE_INDEX", "ADVANCE_QUEUE", "SET_PLAY_MODE", "APPEND_QUEUE", "IMPORT_PLAYLIST"].includes(data.operateType)) return false

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

  if (data.operateType === "APPEND_QUEUE") {
    const req = data as ReqAppendQueue
    if (!Array.isArray(req.items) || req.items.length < 1) return false
  }

  if (data.operateType === "IMPORT_PLAYLIST") {
    const req = data as ReqImportPlaylist
    if (typeof req.link !== "string" || !/^https?:\/\//i.test(req.link)) return false
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
