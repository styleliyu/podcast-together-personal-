import type { IncomingHttpHeaders } from "http"
import type { WebSocket } from "ws"

export interface RequestParam {
  "x-pt-version": string
  "x-pt-client": string
  "x-pt-stamp": number
  "x-pt-language": string
  "x-pt-local-id": string
  [otherParam: string]: unknown
}

export interface RequestRes<T = Record<string, unknown>> {
  code: string
  errMsg?: string
  showMsg?: string
  data?: T
}

export interface ContentData {
  infoType: "podcast"
  audioUrl: string
  sourceType?: string
  title?: string
  description?: string
  imageUrl?: string
  linkUrl?: string
  seriesName?: string
  seriesUrl?: string
  queue?: RoomQueue
}

export interface Participant {
  nickName: string
  enterStamp: number
  heartbeatStamp: number
  userAgent?: string
  guestId: string
  nonce: string
}

export interface ParticipantClient {
  nickName: string
  guestId: string
  heartbeatStamp: number
  enterStamp: number
}

export type SpeedRate = "0.8" | "1" | "1.2" | "1.5" | "1.7"
export type PlayStatus = "PLAYING" | "PAUSED"
export type PlayMode = "sequence" | "shuffle" | "single"

export interface QueueItem {
  id: string
  sourceType: string
  title: string
  artist?: string
  imageUrl?: string
  linkUrl?: string
  resourceId?: string
  audioUrl?: string
}

export interface RoomQueue {
  items: QueueItem[]
  currentIndex: number
  playMode: PlayMode
}

export interface RoomConfig {
  everyoneCanOperatePlayer: "Y" | "N"
}

export interface Room {
  _id: string
  title?: string
  content: ContentData
  oState: "OK" | "EXPIRED" | "DELETED"
  playStatus: PlayStatus
  speedRate: SpeedRate
  contentStamp: number
  operateStamp: number
  operator: string
  createStamp: number
  owner: string
  participants: Participant[]
  config?: RoomConfig
  queue?: RoomQueue
  isPersistent?: boolean
}

export interface RoRes {
  roomId: string
  content: ContentData
  playStatus: PlayStatus
  speedRate: SpeedRate
  operator: string
  contentStamp: number
  operateStamp: number
  participants: ParticipantClient[]
  guestId?: string
  iamOwner?: "Y" | "N"
  everyoneCanOperatePlayer?: "Y" | "N"
  queue?: RoomQueue
  currentIndex?: number
  playMode?: PlayMode
  isPersistent?: boolean
}

export interface Visitor {
  _id: string
  nickName: string
  enterRoomStamp: number
  enterNum: number
  createNum: number
  createRoomStamp: number
  createStamp: number
  userAgent?: string
  ip?: string | string[]
  nonce: string
}

export interface RoomStatus {
  roomId: string
  playStatus: PlayStatus
  speedRate: SpeedRate
  operator: string
  contentStamp: number
  operateStamp: number
  everyoneCanOperatePlayer?: "Y" | "N"
  content?: ContentData
  queue?: RoomQueue
  currentIndex?: number
  playMode?: PlayMode
}

export interface ResToFe {
  responseType: "CONNECTED" | "NEW_STATUS" | "HEARTBEAT"
  roomStatus?: RoomStatus
}

export interface ReqBase {
  operateType: "FIRST_SEND" | "SET_PLAYER" | "HEARTBEAT" | "SET_QUEUE_INDEX" | "ADVANCE_QUEUE" | "SET_PLAY_MODE" | "APPEND_QUEUE"
  roomId: string
  "x-pt-local-id": string
  "x-pt-stamp": number
}

export interface ReqOperatePlayer extends ReqBase {
  operateType: "SET_PLAYER"
  playStatus: PlayStatus
  speedRate: SpeedRate
  contentStamp: number
  everyoneCanOperatePlayer?: "Y" | "N"
}

export interface ReqSetQueueIndex extends ReqBase {
  operateType: "SET_QUEUE_INDEX"
  index: number
}

export interface ReqAdvanceQueue extends ReqBase {
  operateType: "ADVANCE_QUEUE"
  direction: "next" | "prev" | "auto"
  fromIndex: number
}

export interface ReqSetPlayMode extends ReqBase {
  operateType: "SET_PLAY_MODE"
  playMode: PlayMode
}

export interface ReqAppendQueue extends ReqBase {
  operateType: "APPEND_QUEUE"
  items: QueueItem[]
}

export interface RequestContext {
  body: Record<string, any>
  method: string
  headers: IncomingHttpHeaders
  ip?: string | string[]
}

export interface PtWebSocket extends WebSocket {
  roomId?: string
  createStamp?: number
}
