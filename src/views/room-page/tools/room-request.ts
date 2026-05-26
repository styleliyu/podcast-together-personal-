import rq from "../../../request"
import { ContentData, RequestRes, RoRes } from "../../../type"
import api from "../../../request/api"

const url = api.ROOM_OPERATE

// 请求进入房间
export const request_enter = async(roomId: string, nickName: string): Promise<RequestRes<RoRes>> => {
  let param = { operateType: "ENTER", roomId, nickName }
  let res = await rq.request<RoRes>(url, param)
  return res
}

// 请求心跳
export const request_heartbeat = async(roomId: string, nickName: string): Promise<RequestRes<RoRes>> => {
  let param = { operateType: "HEARTBEAT", roomId, nickName }
  let res = await rq.request<RoRes>(url, param)
  return res
} 

// 请求离开
export const request_leave = async(roomId: string, nickName: string): Promise<RequestRes<RoRes>> => {
  let param = { operateType: "LEAVE", roomId, nickName }
  let res = await rq.request<RoRes>(url, param)
  return res
}

export const request_parse = async(link: string): Promise<RequestRes<ContentData>> => {
  let res = await rq.request<ContentData>(api.PARSE_TEXT, { link })
  return res
}

export const request_cancel_playlist_import = async(roomId: string): Promise<RequestRes> => {
  let res = await rq.request(api.PLAYLIST_IMPORT_CANCEL, { roomId })
  return res
}
