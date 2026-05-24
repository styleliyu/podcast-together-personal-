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
}

export interface ResToFe {
  responseType: "CONNECTED" | "NEW_STATUS" | "HEARTBEAT"
  roomStatus?: RoomStatus
}

export interface ReqBase {
  operateType: "FIRST_SEND" | "SET_PLAYER" | "HEARTBEAT"
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
