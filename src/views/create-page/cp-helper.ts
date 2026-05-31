import { PtRouter, VueRoute } from "../../routes/pt-router"
import time from "../../utils/time"
import { ContentData, LocalImportFailure, RoRes } from "../../type"
import cui from "../../components/custom-ui"
import { request_create, request_parse, request_upload_audio } from "./cp-request"
import util from "../../utils/util"
import { prepareLocalMusicFilesForUpload, releaseDecryptedMusicFile } from "../../utils/decryptMusicFile"

let lastIntoFinishInput: number = 0

const _showErr = () => {
  cui.hideLoading()
  cui.showModal({ 
    title: "解析失败", 
    content: "请稍后重新尝试或更换链接", 
    showCancel: false 
  })
}

const _showQueryErr = async (router: PtRouter) => {
  await cui.showModal({
    title: "创建房间失败",
    content: "不妨手动黏贴单集链接以创建房间",
    showCancel: false,
  })
  router.replace({ name: "create" })
}

const _showLocalImportErr = (content: string) => {
  cui.hideLoading()
  cui.showModal({
    title: "本地文件导入失败",
    content,
    showCancel: false,
  })
}

const _showPartialLocalImportErr = async (failures: LocalImportFailure[]) => {
  if(!failures.length) return
  const content = formatImportFailures(failures)
  await cui.showModal({
    title: "部分文件未导入",
    content,
    showCancel: false,
  })
}

const _createRoom = async (
  roomData: ContentData, 
  router: PtRouter, 
  route: VueRoute,
  fromQuery: boolean = false,
  isPersistent: boolean = false,
  roomName: string = "",
): Promise<void> => {
  const res = await request_create(roomData, isPersistent, roomName)
  cui.hideLoading()

  if(res?.code !== "0000") {
    if(fromQuery) _showQueryErr(router)
    else _showErr()
    return
  }

  const roRes = res.data as RoRes
  const roomId = roRes.roomId
  if(!roomId) {
    if(fromQuery) _showQueryErr(router)
    else _showErr()
    return
  }

  router.replace({ name: "room", params: { roomId } })
}

const finishInput = async (link: string, router: PtRouter, route: VueRoute, isPersistent: boolean = false, roomName: string = ""): Promise<void> => {
  const now = time.getTime()
  if(lastIntoFinishInput + 500 > now) return
  lastIntoFinishInput = now

  cui.showLoading({ title: "解析中.." })
  const res = await request_parse(link)
  if(res?.code !== "0000") {
    _showErr()
    return
  }

  let contentData = res.data as ContentData
  _createRoom(contentData, router, route, false, isPersistent, roomName)
}

const finishUpload = async (files: File[], router: PtRouter, route: VueRoute, isPersistent: boolean = false, roomName: string = ""): Promise<void> => {
  if(!files.length) return
  const prepared = {
    files,
    decrypted: [] as Awaited<ReturnType<typeof prepareLocalMusicFilesForUpload>>["decrypted"],
    metadata: [] as Awaited<ReturnType<typeof prepareLocalMusicFilesForUpload>>["metadata"],
    failures: [] as Awaited<ReturnType<typeof prepareLocalMusicFilesForUpload>>["failures"],
  }

  try {
    cui.showLoading({ title: "解析本地文件.." })
    const nextPrepared = await prepareLocalMusicFilesForUpload(files)
    prepared.files = nextPrepared.files
    prepared.decrypted = nextPrepared.decrypted
    prepared.metadata = nextPrepared.metadata
    prepared.failures = nextPrepared.failures

    if(!prepared.files.length) {
      _showLocalImportErr(formatImportFailures(prepared.failures) || "没有可导入的本地音频文件。")
      return
    }

    cui.showLoading({ title: "上传中.." })
    const res = await request_upload_audio(prepared.files, prepared.metadata)
    const uploadFailures = res.data?.failures || []
    const failures = [...prepared.failures, ...uploadFailures]
    if(res?.code !== "0000") {
      _showLocalImportErr(res.showMsg || formatImportFailures(failures) || "本地音频上传失败，请确认文件格式后重试。")
      return
    }

    const contentData = res.data?.content
    if(!contentData?.audioUrl) {
      _showLocalImportErr(formatImportFailures(failures) || "没有可导入的本地音频文件。")
      return
    }

    if(failures.length) {
      cui.hideLoading()
      await _showPartialLocalImportErr(failures)
      cui.showLoading({ title: "创建房间.." })
    }
    _createRoom(contentData, router, route, false, isPersistent, roomName)
  }
  catch(err) {
    cui.hideLoading()
    const message = err instanceof Error ? err.message : "请确认文件格式后重试"
    cui.showModal({
      title: "本地文件解析失败",
      content: message,
      showCancel: false,
    })
  }
  finally {
    prepared.decrypted.forEach(releaseDecryptedMusicFile)
  }
}

function formatImportFailures(failures: LocalImportFailure[]): string {
  if(!failures.length) return ""
  const visible = failures.slice(0, 5).map(item => `${item.filename}：${item.reason}`).join("\n")
  const hidden = failures.length > 5 ? `\n还有 ${failures.length - 5} 个文件未导入。` : ""
  return `${visible}${hidden}`
}
const getTargetLink = (route: VueRoute): string => {
  let list: string[] = []

  let link = ""
  const keys = ["link", "text", "title"]
  for(let k of keys) {
    // 已完成解码
    let target = route.query[k]
    if(typeof target !== "string") continue

    list = util.getUrls(target)
    if(list.length > 0) {
      link = list[0]
      break
    }
  }

  return link
}

const useLinkFromQuery = async (router: PtRouter, route: VueRoute) => {
  const link = getTargetLink(route)
  if(!link) {
    _showQueryErr(router)
    return
  }
  const res = await request_parse(link)
  if(res?.code !== "0000") {
    _showQueryErr(router)
    return
  }

  let contentData = res.data as ContentData
  _createRoom(contentData, router, route, true)
}

export default {
  finishInput,
  finishUpload,
  useLinkFromQuery,
}
