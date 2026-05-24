import type {
  ContentData,
  Participant,
  ParticipantClient,
  RequestContext,
  RequestRes,
  RoRes,
  Room,
  RoomConfig,
  Visitor
} from "./types"
import { roomRepo, visitorRepo } from "./db"

const MAX_ROOM_NUM = 15
const defaultRoomCfg: RoomConfig = {
  everyoneCanOperatePlayer: "Y"
}

type OperateType = "CREATE" | "ENTER" | "HEARTBEAT" | "LEAVE"

interface CommonBody {
  operateType: "ENTER" | "HEARTBEAT" | "LEAVE"
  roomId: string
  nickName: string
  "x-pt-local-id": string
}

interface CreateBody {
  operateType: "CREATE"
  roomData: ContentData
  nickName?: string
  "x-pt-local-id": string
}

export async function handleRoomOperate(ctx: RequestContext): Promise<RequestRes<RoRes>> {
  const err = checkEntry(ctx)
  if (err) return err

  const operateType = ctx.body.operateType as OperateType
  const ua = ctx.headers["user-agent"]
  const ip = ctx.headers["x-real-ip"] || ctx.headers["x-forwarded-for"] || ctx.ip

  if (operateType === "CREATE") return handleCreate(ctx.body as CreateBody, ua, ip)
  if (operateType === "ENTER") return handleEnter(ctx.body as CommonBody, ua, ip)
  if (operateType === "HEARTBEAT") return handleHeartbeat(ctx.body as CommonBody)
  if (operateType === "LEAVE") return handleLeave(ctx.body as CommonBody)

  return { code: "E4044" }
}

async function handleLeave(body: CommonBody): Promise<RequestRes<RoRes>> {
  const clientId = body["x-pt-local-id"]
  const { roomId } = body
  let room = roomRepo.get(roomId)
  if (!room || !room._id) return { code: "E4004" }
  if (room.oState === "EXPIRED") return { code: "E4006" }
  if (room.oState === "DELETED") return { code: "E4004" }
  if (room.participants.length < 1) return { code: "0000" }

  const me = room.participants.find(v => v.nonce === clientId)
  if (!me) return { code: "E4003" }

  if (room.participants.length === 1) {
    room = pausePlayer(room)
    room.participants = []
    roomRepo.update(roomId, room)
    return { code: "0000" }
  }

  const participants = room.participants.filter(v => v.nonce !== clientId)
  roomRepo.update(roomId, { participants })
  return { code: "0000" }
}

async function handleHeartbeat(body: CommonBody): Promise<RequestRes<RoRes>> {
  const clientId = body["x-pt-local-id"]
  const { roomId, nickName } = body
  const room = roomRepo.get(roomId)
  if (!room || !room._id) return { code: "E4004" }
  if (room.oState === "EXPIRED") return { code: "E4006" }
  if (room.oState === "DELETED") return { code: "E4004" }

  const now = Date.now()
  let participants = room.participants || []
  const me = participants.find(v => v.nonce === clientId)
  if (!me) return { code: "E4003" }

  me.heartbeatStamp = now
  me.nickName = nickName
  participants = participants.map(v => (v.nonce === clientId ? me : v))
  participants = participants.filter(v => now - v.heartbeatStamp < 50 * 1000)

  roomRepo.update(roomId, { participants })
  return {
    code: "0000",
    data: toRoRes({ ...room, participants }, undefined, undefined)
  }
}

async function handleEnter(
  body: CommonBody,
  ua?: string,
  ip?: string | string[]
): Promise<RequestRes<RoRes>> {
  const clientId = body["x-pt-local-id"]
  const { roomId, nickName } = body
  const room = roomRepo.get(roomId)
  if (!room || !room._id) return { code: "E4004" }
  if (room.oState === "EXPIRED") return { code: "E4006" }
  if (room.oState === "DELETED") return { code: "E4004" }

  const now = Date.now()
  let participants = room.participants || []
  let guestId = ""
  let me = participants.find(v => v.nonce === clientId)

  if (me) {
    guestId = me.guestId
    me.nickName = nickName
    me.enterStamp = now
    me.heartbeatStamp = now
    if (ua) me.userAgent = ua
    participants = participants.map(v => (v.nonce === clientId ? me as Participant : v))
  } else {
    if (participants.length >= MAX_ROOM_NUM) return { code: "R0001" }
    guestId = generateGuestId(participants)
    me = {
      nickName,
      enterStamp: now,
      heartbeatStamp: now,
      userAgent: ua,
      guestId,
      nonce: clientId
    }
    participants.push(me)
  }

  participants = participants.filter(v => now - v.heartbeatStamp < 60 * 1000)
  await recordVisitor(body, ua, ip)
  roomRepo.update(roomId, { participants })

  return {
    code: "0000",
    data: toRoRes({ ...room, participants }, guestId, room.owner === clientId ? "Y" : "N")
  }
}

async function handleCreate(
  body: CreateBody,
  ua?: string,
  ip?: string | string[]
): Promise<RequestRes<RoRes>> {
  const clientId = body["x-pt-local-id"]
  await checkMyRoomAndDelete(clientId)
  await recordVisitor(body, ua, ip)

  const now = Date.now()
  const room: Omit<Room, "_id"> = {
    content: body.roomData,
    oState: "OK",
    playStatus: "PAUSED",
    speedRate: "1",
    contentStamp: 0,
    operateStamp: now,
    operator: "",
    createStamp: now,
    owner: clientId,
    participants: [],
    config: defaultRoomCfg
  }
  const roomId = roomRepo.add(room)
  return {
    code: "0000",
    data: {
      roomId,
      content: body.roomData,
      playStatus: "PAUSED",
      speedRate: "1",
      operator: "",
      contentStamp: 0,
      operateStamp: now,
      participants: [],
      everyoneCanOperatePlayer: defaultRoomCfg.everyoneCanOperatePlayer
    }
  }
}

async function checkMyRoomAndDelete(clientId: string): Promise<boolean> {
  let room = roomRepo.findActiveByOwner(clientId)
  if (room) {
    room = pausePlayer(room)
    room.oState = "DELETED"
    room.participants = []
    roomRepo.update(room._id, room)
  }
  return true
}

export function pausePlayer(room: Room, operator = ""): Room {
  if (room.playStatus === "PAUSED") return room

  const next = { ...room, participants: [...(room.participants || [])] }
  next.playStatus = "PAUSED"
  let speedRateNum = Number(next.speedRate)
  if (Number.isNaN(speedRateNum) || speedRateNum >= 1.71) speedRateNum = 1

  if (next.participants.length > 0) {
    let lastHeartbeat = next.operateStamp
    for (const person of next.participants) {
      if (person.heartbeatStamp > lastHeartbeat) lastHeartbeat = person.heartbeatStamp
    }
    const diffStamp = lastHeartbeat - next.operateStamp
    next.contentStamp = next.contentStamp + diffStamp * speedRateNum
    next.operateStamp = Date.now()
    next.operator = operator
  }

  return next
}

export function toRoRes(room: Room, guestId?: string, iamOwner?: "Y" | "N"): RoRes {
  const config = room.config || defaultRoomCfg
  const participants: ParticipantClient[] = (room.participants || []).map(v => ({
    nickName: v.nickName,
    guestId: v.guestId,
    heartbeatStamp: v.heartbeatStamp,
    enterStamp: v.enterStamp
  }))

  return {
    roomId: room._id,
    content: room.content,
    playStatus: room.playStatus,
    speedRate: room.speedRate,
    operator: room.operator,
    contentStamp: room.contentStamp,
    operateStamp: room.operateStamp,
    participants,
    guestId,
    iamOwner,
    everyoneCanOperatePlayer: config.everyoneCanOperatePlayer
  }
}

function generateGuestId(participants: Participant[]): string {
  const abc = "abcdefghijkmnopqrstuvwyz123456789"
  const ids = participants.map(v => v.guestId)

  for (let runTimes = 0; runTimes <= 15; runTimes++) {
    let id = ""
    for (let i = 0; i < 11; i++) {
      id += abc[Math.floor(Math.random() * abc.length)]
    }
    if (!ids.includes(id)) return id
  }

  return `${Date.now()}`
}

function checkEntry(ctx: RequestContext): RequestRes<RoRes> | null {
  const { body = {}, method } = ctx
  if (method !== "POST") return { code: "E4005" }
  if (!body["x-pt-local-id"]) return { code: "E4000" }

  const operateType = body.operateType as OperateType | undefined
  const oTypes: OperateType[] = ["CREATE", "ENTER", "HEARTBEAT", "LEAVE"]
  if (!operateType || !oTypes.includes(operateType)) return { code: "E4000" }
  if (!body.nickName && operateType !== "CREATE") return { code: "E4000" }

  const needsRoomId: OperateType[] = ["ENTER", "HEARTBEAT", "LEAVE"]
  if (!body.roomId && needsRoomId.includes(operateType)) return { code: "E4000" }

  if (operateType === "CREATE") {
    const roomData = body.roomData as ContentData | undefined
    if (!roomData) return { code: "E4000" }
    if (roomData.infoType !== "podcast") return { code: "E4000" }
    if (!roomData.audioUrl) return { code: "E4000", errMsg: "roomData.audioUrl is required" }
  }

  return null
}

async function recordVisitor(
  body: CommonBody | CreateBody,
  ua?: string,
  ip?: string | string[]
): Promise<boolean> {
  const operateType = body.operateType
  const nonce = body["x-pt-local-id"]
  const nickName = body.nickName || ""
  const now = Date.now()
  const existing = visitorRepo.getByNonce(nonce)

  if (existing) {
    const next: Visitor = {
      ...existing,
      nickName: nickName || existing.nickName,
      ip: ip || existing.ip
    }
    if (operateType === "CREATE") {
      next.createRoomStamp = now
      next.createNum += 1
    } else {
      next.enterRoomStamp = now
      next.enterNum += 1
    }
    visitorRepo.update(next._id, next)
    return true
  }

  visitorRepo.add({
    nickName,
    enterRoomStamp: operateType === "ENTER" ? now : -1,
    enterNum: operateType === "ENTER" ? 1 : 0,
    createNum: operateType === "CREATE" ? 1 : 0,
    createRoomStamp: operateType === "CREATE" ? now : -1,
    createStamp: now,
    userAgent: ua,
    ip,
    nonce
  })
  return true
}
