import rq from "../../request"
import { RequestRes, RoRes, ContentData, LocalUploadMetadata, UploadAudioData } from "../../type"
import api from "../../request/api"
import ptUtil from "../../utils/pt-util"

export const request_parse = async (link: string): Promise<RequestRes<ContentData>> => {
  const url = api.PARSE_TEXT
  const res = await rq.request<ContentData>(url, { link })
  return res
}

export const request_create = async (roomData: ContentData, isPersistent: boolean = false, roomName: string = ""): Promise<RequestRes<RoRes>> => {
  const url = api.ROOM_OPERATE
  let userData = ptUtil.getUserData()
  const param = {
    operateType: "CREATE",
    roomData,
    nickName: userData.nickName,
    isPersistent,
    roomName,
  }
  const res = await rq.request<RoRes>(url, param)
  return res
}

export const request_upload_audio = async (files: File[], metadata: LocalUploadMetadata[] = []): Promise<RequestRes<UploadAudioData>> => {
  const formData = new FormData()
  for (const file of files) formData.append("files", file)
  formData.append("metadata", JSON.stringify(metadata))
  const response = await fetch(api.UPLOAD_AUDIO, {
    method: "POST",
    body: formData
  })
  return await response.json() as RequestRes<UploadAudioData>
}
