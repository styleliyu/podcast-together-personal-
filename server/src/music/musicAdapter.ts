import axios from "axios"
import crypto from "crypto"
import type { ContentData, RequestRes } from "../types"

export type MusicPlatform = "netease" | "tencent" | "kugou" | "kuwo" | "baidu"
export type MusicResourceKind = "track" | "playlist" | "album"

interface MusicResource {
  platform: MusicPlatform
  kind: MusicResourceKind
  id: string
  linkUrl: string
}

interface TrackMeta {
  title?: string
  artist?: string
  album?: string
  imageUrl?: string
}

interface PlayUrl {
  url: string
  br?: number
}

const MUSIC_TIMEOUT_MS = 8000
const KUGOU_HASH_RE = /^[A-Fa-f0-9]{16,64}$/

const http = axios.create({
  timeout: MUSIC_TIMEOUT_MS,
  maxRedirects: 5,
  headers: {
    "User-Agent": "Mozilla/5.0 podcast-together music resolver",
    Accept: "*/*"
  }
})

export async function parseMusicLink(link: string): Promise<RequestRes<ContentData> | null> {
  const resource = parseMusicResource(link)
  if (!resource) return null

  if (resource.kind !== "track") {
    return {
      code: "E4004",
      showMsg: "当前仅支持音乐单曲链接创建房间，歌单和专辑入口已预留。"
    }
  }

  try {
    const data = await resolveTrack(resource)
    if (!data?.audioUrl) {
      return {
        code: "E4004",
        showMsg: "音乐播放地址解析失败，请更换单曲链接或稍后再试。"
      }
    }
    return { code: "0000", data }
  } catch (err: any) {
    console.error("music link parse failed", err?.code || err?.message || err)
    return {
      code: "E4004",
      showMsg: "音乐链接解析失败，请更换单曲链接或稍后再试。"
    }
  }
}

function parseMusicResource(link: string): MusicResource | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (isBilibiliHost(host) || isXiamiHost(host)) return null

  if (isNeteaseHost(host)) return parseNetease(url, link)
  if (isTencentHost(host)) return parseTencent(url, link)
  if (isKugouHost(host)) return parseKugou(url, link)
  if (isKuwoHost(host)) return parseKuwo(url, link)
  if (isBaiduHost(host)) return parseBaidu(url, link)

  return null
}

function isNeteaseHost(host: string): boolean {
  return host === "music.163.com" || host.endsWith(".music.163.com")
}

function isBilibiliHost(host: string): boolean {
  return host === "bilibili.com" || host.endsWith(".bilibili.com")
}

function isXiamiHost(host: string): boolean {
  return host === "xiami.com" || host.endsWith(".xiami.com")
}

function isTencentHost(host: string): boolean {
  return host === "qq.com" || host.endsWith(".qq.com")
}

function isKugouHost(host: string): boolean {
  return host === "kugou.com" || host.endsWith(".kugou.com")
}

function isKuwoHost(host: string): boolean {
  return host === "kuwo.cn" || host.endsWith(".kuwo.cn")
}

function isBaiduHost(host: string): boolean {
  return host === "taihe.com" || host.endsWith(".taihe.com") || host === "qianqian.com" || host.endsWith(".qianqian.com") || host === "91q.com" || host.endsWith(".91q.com") || host === "music.baidu.com"
}

function parseNetease(url: URL, linkUrl: string): MusicResource | null {
  const text = linkText(url)
  const id = pickParamAnywhere(url, text, ["id", "songId", "songid"])

  if (/#?\/song(?:\?|\/|$)/i.test(text) || /\/song\/media\/outer\/url/i.test(text)) {
    return id ? { platform: "netease", kind: "track", id, linkUrl } : null
  }

  if (/#?\/playlist(?:\?|\/|$)/i.test(text)) {
    return id ? { platform: "netease", kind: "playlist", id, linkUrl } : null
  }

  if (/#?\/album(?:\?|\/|$)/i.test(text)) {
    return id ? { platform: "netease", kind: "album", id, linkUrl } : null
  }

  return null
}

function parseTencent(url: URL, linkUrl: string): MusicResource | null {
  const text = linkText(url)
  const playlistId = pickParamAnywhere(url, text, ["playlist", "playlistid", "disstid", "id"]) || pickMatch(text, [
    /\/playlist\/([A-Za-z0-9]+)/i
  ])
  if (/\/playlist\//i.test(url.pathname) || /[?&#](disstid|playlistid)=/i.test(text)) {
    return playlistId ? { platform: "tencent", kind: "playlist", id: playlistId, linkUrl } : null
  }

  const albumId = pickParamAnywhere(url, text, ["albummid", "albumid"]) || pickMatch(text, [
    /\/album\/([A-Za-z0-9]+)/i
  ])
  if (/\/album\//i.test(url.pathname) || /[?&#](albummid|albumid)=/i.test(text)) {
    return albumId ? { platform: "tencent", kind: "album", id: albumId, linkUrl } : null
  }

  const id = pickParamAnywhere(url, text, ["songmid", "mid", "songid"]) || pickMatch(text, [
    /\/song\/([A-Za-z0-9]+)/i,
    /\/n\/yqq\/song\/([A-Za-z0-9]+)\.html/i,
    /\/songDetail\/([A-Za-z0-9]+)/i,
    /songmid=([A-Za-z0-9]+)/i,
    /[?&#]mid=([A-Za-z0-9]+)/i
  ])
  return id ? { platform: "tencent", kind: "track", id, linkUrl } : null
}

function parseKugou(url: URL, linkUrl: string): MusicResource | null {
  const text = linkText(url)
  const id = pickParamAnywhere(url, text, ["hash", "audio_id", "album_audio_id"]) || pickMatch(text, [
    /hash=([A-Fa-f0-9]{16,64})/i,
    /\/song\/#?hash=([A-Fa-f0-9]{16,64})/i,
    /\/mixsong\/([A-Za-z0-9]+)\.html/i,
    /\/song\/([A-Za-z0-9]+)\.html/i
  ])
  if (id) return { platform: "kugou", kind: "track", id, linkUrl }

  const playlistId = pickParamAnywhere(url, text, ["specialid", "playlistid", "listid"]) || pickMatch(text, [/\/special\/single\/(\d+)/i])
  if (/special|playlist|plist/i.test(text)) {
    return playlistId ? { platform: "kugou", kind: "playlist", id: playlistId, linkUrl } : null
  }

  const albumId = pickParamAnywhere(url, text, ["album_id", "albumid"]) || pickMatch(text, [/\/album\/(\d+)/i])
  if (/album/i.test(text) && !/[?&#]hash=/i.test(text)) {
    return albumId ? { platform: "kugou", kind: "album", id: albumId, linkUrl } : null
  }

  return null
}

function parseKuwo(url: URL, linkUrl: string): MusicResource | null {
  const text = linkText(url)
  const playlistId = pickParamAnywhere(url, text, ["pid", "playlistid"]) || pickMatch(text, [/\/playlist(?:\/index)?\/?(\d+)/i])
  if (/playlist|歌单/i.test(text)) {
    return playlistId ? { platform: "kuwo", kind: "playlist", id: playlistId, linkUrl } : null
  }

  const albumId = pickParamAnywhere(url, text, ["albumid", "albumId"]) || pickMatch(text, [/\/album\/(\d+)/i])
  if (/album/i.test(text)) {
    return albumId ? { platform: "kuwo", kind: "album", id: albumId, linkUrl } : null
  }

  const id = pickParamAnywhere(url, text, ["mid", "musicId", "rid"]) || pickMatch(text, [
    /\/play_detail\/(\d+)/i,
    /\/listen_detail\/(\d+)/i,
    /\/yinyue\/(\d+)/i,
    /MUSIC_(\d+)/i
  ])
  return id ? { platform: "kuwo", kind: "track", id, linkUrl } : null
}

function parseBaidu(url: URL, linkUrl: string): MusicResource | null {
  const text = linkText(url)
  const playlistId = pickParamAnywhere(url, text, ["listid", "playlistid"]) || pickMatch(text, [
    /\/playlist\/([A-Za-z0-9]+)/i
  ])
  if (/playlist|gedan|diy/i.test(text)) {
    return playlistId ? { platform: "baidu", kind: "playlist", id: playlistId, linkUrl } : null
  }

  const albumId = pickParamAnywhere(url, text, ["album_id", "albumid"]) || pickMatch(text, [
    /\/album\/([A-Za-z0-9]+)/i
  ])
  if (/album/i.test(text)) {
    return albumId ? { platform: "baidu", kind: "album", id: albumId, linkUrl } : null
  }

  const id = pickParamAnywhere(url, text, ["songid", "song_id", "id", "TSID"]) || pickMatch(text, [
    /\/song\/([A-Za-z0-9]+)/i,
    /\/play\/([A-Za-z0-9]+)/i
  ])
  return id ? { platform: "baidu", kind: "track", id, linkUrl } : null
}

async function resolveTrack(resource: MusicResource): Promise<ContentData | null> {
  if (resource.platform === "netease") return resolveNeteaseTrack(resource)
  if (resource.platform === "tencent") return resolveTencentTrack(resource)
  if (resource.platform === "kugou") return resolveKugouTrack(resource)
  if (resource.platform === "kuwo") return resolveKuwoTrack(resource)
  if (resource.platform === "baidu") return resolveBaiduTrack(resource)
  return null
}

async function resolveNeteaseTrack(resource: MusicResource): Promise<ContentData | null> {
  const [meta, playUrl] = await Promise.all([
    getNeteaseMeta(resource.id),
    getNeteasePlayUrl(resource.id)
  ])
  if (!playUrl.url) return null
  return toContent(resource, playUrl.url, meta)
}

async function getNeteaseMeta(songId: string): Promise<TrackMeta> {
  try {
    const res = await http.get("https://music.163.com/api/song/detail", {
      params: {
        ids: `[${songId}]`
      },
      headers: getNeteaseHeaders()
    })
    const song = parseMaybeJson(res.data)?.songs?.[0]
    return {
      title: song?.name,
      artist: Array.isArray(song?.artists) ? song.artists.map((v: any) => v.name).filter(Boolean).join(" / ") : "",
      album: song?.album?.name,
      imageUrl: song?.album?.picUrl || song?.album?.blurPicUrl
    }
  } catch {
    return {}
  }
}

async function getNeteasePlayUrl(songId: string): Promise<PlayUrl> {
  const res = await http.get("https://music.163.com/api/song/enhance/player/url", {
    params: {
      id: songId,
      ids: `[${songId}]`,
      br: 320000
    },
    headers: getNeteaseHeaders()
  })
  const item = parseMaybeJson(res.data)?.data?.[0]
  return { url: item?.url || "", br: item?.br ? item.br / 1000 : undefined }
}

function getNeteaseHeaders(): Record<string, string> {
  return {
    Referer: "https://music.163.com/",
    Host: "music.163.com",
    Cookie: "os=pc"
  }
}

async function resolveTencentTrack(resource: MusicResource): Promise<ContentData | null> {
  const detail = await getTencentDetail(resource.id)
  const song = detail?.data?.[0]
  const mediaMid = song?.file?.media_mid || song?.mid || resource.id
  const playUrl = await getTencentPlayUrl(song?.mid || resource.id, mediaMid, song?.type)
  if (!playUrl.url) return null

  return toContent(resource, playUrl.url, {
    title: song?.name,
    artist: Array.isArray(song?.singer) ? song.singer.map((v: any) => v.name).filter(Boolean).join(" / ") : "",
    album: song?.album?.title,
    imageUrl: song?.album?.mid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.album.mid}.jpg?max_age=2592000` : ""
  })
}

async function getTencentDetail(songMid: string): Promise<any> {
  const res = await http.get("https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg", {
    params: {
      songmid: songMid,
      platform: "yqq",
      format: "json"
    },
    headers: {
      Referer: "https://y.qq.com/"
    }
  })
  return parseMaybeJson(res.data)
}

async function getTencentPlayUrl(songMid: string, mediaMid: string, songType = 0): Promise<PlayUrl> {
  const guid = Math.floor(Math.random() * 10000000000).toString()
  const filenames = [
    `M800${mediaMid}.mp3`,
    `M500${mediaMid}.mp3`,
    `C400${mediaMid}.m4a`,
    `C200${mediaMid}.m4a`
  ]
  const payload = {
    req_0: {
      module: "vkey.GetVkeyServer",
      method: "CgiGetVkey",
      param: {
        guid,
        songmid: filenames.map(() => songMid),
        filename: filenames,
        songtype: filenames.map(() => songType),
        uin: "0",
        loginflag: 1,
        platform: "20"
      }
    },
    comm: {
      uin: 0,
      format: "json",
      ct: 20,
      cv: 0
    }
  }
  const res = await http.get("https://u.y.qq.com/cgi-bin/musicu.fcg", {
    params: {
      format: "json",
      platform: "yqq.json",
      needNewCode: 0,
      data: JSON.stringify(payload)
    },
    headers: {
      Referer: "https://y.qq.com/"
    }
  })
  const data = parseMaybeJson(res.data)
  const sip = data?.req_0?.data?.sip?.[0] || "https://dl.stream.qqmusic.qq.com/"
  const item = data?.req_0?.data?.midurlinfo?.find((v: any) => v?.purl)
  return { url: item?.purl ? `${sip}${item.purl}` : "", br: item?.songmid ? 128 : -1 }
}

async function resolveKugouTrack(resource: MusicResource): Promise<ContentData | null> {
  const canonical = await resolveKugouCanonical(resource)
  if (!canonical?.hash) return null

  const [apiMeta, playUrl] = await Promise.all([
    getKugouMeta(canonical.hash),
    getKugouPlayUrl(canonical.hash)
  ])
  if (!playUrl.url) return null
  return toContent(resource, playUrl.url, mergeTrackMeta(apiMeta, canonical.meta))
}

async function resolveKugouCanonical(resource: MusicResource): Promise<{ hash: string; meta: TrackMeta } | null> {
  if (KUGOU_HASH_RE.test(resource.id)) return { hash: resource.id, meta: {} }

  const pageSong = await getKugouPageSongInfo(resource.linkUrl)
  if (pageSong?.hash) return pageSong

  return null
}

async function getKugouPageSongInfo(linkUrl: string): Promise<{ hash: string; meta: TrackMeta } | null> {
  try {
    const res = await http.get<string>(linkUrl, {
      responseType: "text",
      headers: {
        Referer: "https://www.kugou.com/",
        "User-Agent": "Mozilla/5.0"
      }
    })
    const html = res.data
    const match = html.match(/dataFromSmarty\s*=\s*(\[[\s\S]*?\])\s*,\s*(?:\/\/|playType)/i) || html.match(/dataFromSmarty\s*=\s*(\[[\s\S]*?\])\s*[,;]/i)
    if (!match?.[1]) return null

    const list = JSON.parse(match[1])
    const item = Array.isArray(list) ? list[0] : null
    if (!item?.hash) return null

    return {
      hash: item.hash,
      meta: {
        title: item.song_name || item.audio_name,
        artist: item.author_name || item.singername,
        album: item.album_name,
        imageUrl: item.img || item.pic || item.image
      }
    }
  } catch {
    return null
  }
}

async function getKugouMeta(hash: string): Promise<TrackMeta> {
  try {
    const res = await http.get("http://m.kugou.com/app/i/getSongInfo.php", {
      params: {
        cmd: "playInfo",
        hash,
        from: "mkugou"
      }
    })
    const data = parseMaybeJson(res.data)
    return {
      title: data?.songName,
      artist: data?.singerName,
      album: data?.albumName,
      imageUrl: typeof data?.imgUrl === "string" ? data.imgUrl.replace("{size}", "400") : ""
    }
  } catch {
    return {}
  }
}

async function getKugouPlayUrl(hash: string): Promise<PlayUrl> {
  const privilegeUrl = await getKugouPrivilegePlayUrl(hash)
  if (privilegeUrl.url) return privilegeUrl
  const webUrl = await getKugouWebPlayUrl(hash)
  if (webUrl.url) return webUrl
  return getKugouMobilePlayUrl(hash)
}

async function getKugouPrivilegePlayUrl(hash: string): Promise<PlayUrl> {
  try {
    const privilegeRes = await http.post("http://media.store.kugou.com/v1/get_res_privilege", {
      relate: 1,
      userid: "0",
      vip: 0,
      appid: 1000,
      token: "",
      behavior: "download",
      area_code: "1",
      clientver: "8990",
      resource: [{ id: 0, type: "audio", hash }]
    })
    const privilege = parseMaybeJson(privilegeRes.data)
    const candidates = privilege?.data?.[0]?.relate_goods || []
    for (const item of candidates) {
      const candidateHash = item?.hash
      if (!candidateHash) continue
      const key = crypto.createHash("md5").update(`${candidateHash}kgcloudv2`).digest("hex")
      const res = await http.get("http://trackercdn.kugou.com/i/v2/", {
        params: {
          hash: candidateHash,
          key,
          pid: 3,
          behavior: "play",
          cmd: "25",
          version: 8990
        }
      })
      const data = parseMaybeJson(res.data)
      const url = Array.isArray(data?.url) ? data.url[0] : data?.url
      if (url) return { url, br: data?.bitRate ? data.bitRate / 1000 : undefined }
    }
  } catch {}
  return { url: "", br: -1 }
}

async function getKugouWebPlayUrl(hash: string): Promise<PlayUrl> {
  try {
    const res = await http.get("https://wwwapi.kugou.com/yy/index.php", {
      params: {
        r: "play/getdata",
        hash
      },
      headers: {
        Referer: "https://www.kugou.com/"
      }
    })
    const data = parseMaybeJson(res.data)?.data || {}
    const url = data.play_url || data.play_backup_url
    return { url: url || "", br: data.bitrate ? data.bitrate / 1000 : undefined }
  } catch {
    return { url: "", br: -1 }
  }
}

async function getKugouMobilePlayUrl(hash: string): Promise<PlayUrl> {
  try {
    const res = await http.get("http://m.kugou.com/app/i/getSongInfo.php", {
      params: {
        cmd: "playInfo",
        hash,
        from: "mkugou"
      }
    })
    const data = parseMaybeJson(res.data)
    const backupUrl = Array.isArray(data?.backup_url) ? data.backup_url[0] : ""
    return { url: data?.url || backupUrl || "", br: data?.bitRate ? data.bitRate / 1000 : undefined }
  } catch {
    return { url: "", br: -1 }
  }
}

async function resolveKuwoTrack(resource: MusicResource): Promise<ContentData | null> {
  const [meta, playUrl] = await Promise.all([
    getKuwoMeta(resource.id),
    getKuwoPlayUrl(resource.id)
  ])
  if (!playUrl.url) return null
  return toContent(resource, playUrl.url, meta)
}

async function getKuwoMeta(id: string): Promise<TrackMeta> {
  try {
    const res = await http.get("http://www.kuwo.cn/api/www/music/musicInfo", {
      params: {
        mid: id,
        httpsStatus: 1
      },
      headers: getKuwoHeaders()
    })
    const data = parseMaybeJson(res.data)?.data
    return {
      title: data?.name,
      artist: data?.artist,
      album: data?.album,
      imageUrl: data?.pic || data?.albumpic
    }
  } catch {
    return {}
  }
}

async function getKuwoPlayUrl(id: string): Promise<PlayUrl> {
  try {
    const res = await http.get("http://www.kuwo.cn/api/v1/www/music/playUrl", {
      params: {
        mid: id,
        type: "music",
        httpsStatus: 1
      },
      headers: getKuwoHeaders()
    })
    const data = parseMaybeJson(res.data)
    if (data?.code === 200 && data?.data?.url) return { url: data.data.url, br: 128 }
  } catch {}

  const res = await http.get("https://antiserver.kuwo.cn/anti.s", {
    params: {
      type: "convert_url",
      rid: `MUSIC_${id}`,
      format: "mp3",
      response: "url"
    },
    headers: {
      Referer: "https://www.kuwo.cn/"
    },
    responseType: "text"
  })
  const url = typeof res.data === "string" && /^https?:\/\//i.test(res.data.trim()) ? res.data.trim() : ""
  return { url, br: 128 }
}

function getKuwoHeaders(): Record<string, string> {
  return {
    Referer: "http://www.kuwo.cn/",
    Host: "www.kuwo.cn",
    csrf: "3E7JFQ7MRPL",
    Cookie: "kw_token=3E7JFQ7MRPL"
  }
}

async function resolveBaiduTrack(resource: MusicResource): Promise<ContentData | null> {
  const info = await getBaiduTrack(resource.id)
  const playUrl = info.playUrl
  if (!playUrl.url) return null

  return toContent(resource, playUrl.url, info.meta)
}

async function getBaiduTrack(id: string): Promise<{ meta: TrackMeta; playUrl: PlayUrl }> {
  const tsid = /^T\d+/i.test(id) ? id : await getQianqianTsid(id)
  if (!tsid) return { meta: {}, playUrl: { url: "", br: -1 } }

  const [info, trackLink] = await Promise.all([
    requestQianqianApi("song/info", { TSID: tsid }).catch(() => null),
    requestQianqianApi("song/tracklink", { TSID: tsid }).catch(() => null)
  ])
  const song = info?.data || {}
  const link = trackLink?.data || {}
  const playUrl = link.path || link.url || link.file_link || link.fileLink || link.songLink || ""

  return {
    meta: {
      title: song.title || song.songName || song.name,
      artist: song.artistName || song.author || song.artist,
      album: song.albumTitle || song.albumName || song.album,
      imageUrl: song.pic || song.picRadio || song.pic_radio || song.picBig || song.pic_big
    },
    playUrl: { url: playUrl, br: link.rate || link.bitrate }
  }
}

async function getQianqianTsid(songId: string): Promise<string> {
  const data = await requestQianqianApi("song/songid2tsid", { songid: songId })
  return data?.data?.[0]?.tsid || ""
}

async function requestQianqianApi(method: string, params: Record<string, string>): Promise<any> {
  const signedParams = createQianqianParams(params)
  const userAgent = "Mozilla/5.0 podcast-together"
  const res = await http.get(`https://api-qianqian.91q.com/v1/${method}`, {
    params: signedParams,
    headers: {
      from: "web",
      "User-Agent": userAgent,
      requestid: `${signedParams.timestamp}_${crypto.randomBytes(4).toString("hex")}`,
      "device-id": crypto.createHash("md5").update(userAgent).digest("hex")
    }
  })
  return parseMaybeJson(res.data)
}

function createQianqianParams(params: Record<string, string>): Record<string, string | number> {
  const secret = "0b50b02fd0d73a9c4c8c3a781c30845f"
  const signedParams: Record<string, string | number> = {
    ...params,
    appid: 16073360,
    timestamp: Math.floor(Date.now() / 1000)
  }
  const plain = Object.keys(signedParams)
    .sort()
    .map(key => `${key}=${signedParams[key]}`)
    .join("&")
  signedParams.sign = crypto.createHash("md5").update(`${plain}${secret}`).digest("hex")
  return signedParams
}

function toContent(resource: MusicResource, audioUrl: string, meta: TrackMeta): ContentData {
  const title = cleanMetaText(meta.title)
  const artist = cleanMetaText(meta.artist)
  const album = cleanMetaText(meta.album)
  return {
    infoType: "podcast",
    audioUrl,
    sourceType: resource.platform,
    title: title || sourceName(resource.platform),
    description: album ? `专辑：${album}` : "",
    imageUrl: meta.imageUrl || "",
    linkUrl: resource.linkUrl,
    seriesName: artist || sourceName(resource.platform)
  }
}

function sourceName(platform: MusicPlatform): string {
  const names: Record<MusicPlatform, string> = {
    netease: "网易云音乐",
    tencent: "QQ音乐",
    kugou: "酷狗音乐",
    kuwo: "酷我音乐",
    baidu: "百度音乐"
  }
  return names[platform]
}

function mergeTrackMeta(primary: TrackMeta, fallback: TrackMeta): TrackMeta {
  return {
    title: primary.title || fallback.title,
    artist: primary.artist || fallback.artist,
    album: primary.album || fallback.album,
    imageUrl: primary.imageUrl || fallback.imageUrl
  }
}

function cleanMetaText(value?: string): string {
  const text = String(value || "").trim()
  if (!text || /^[?\s]+$/.test(text)) return ""
  return text
}

function linkText(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`
}

function pickParamAnywhere(url: URL, text: string, keys: string[]): string {
  const direct = pickParam(url, keys)
  if (direct) return direct
  return pickParamFromText(text, keys)
}

function pickParam(url: URL, keys: string[]): string {
  for (const key of keys) {
    const value = url.searchParams.get(key)
    if (value) return value
  }
  return ""
}

function pickParamFromText(text: string, keys: string[]): string {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const match = text.match(new RegExp(`[?&#]${escaped}=([^&#/]+)`, "i"))
    if (match?.[1]) return decodeURIComponent(match[1])
  }
  return ""
}

function pickMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ""
}

function parseMaybeJson(input: any): any {
  if (typeof input !== "string") return input
  try {
    return JSON.parse(input)
  } catch {
    const start = input.indexOf("{")
    const end = input.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(input.slice(start, end + 1))
      } catch {}
    }
    return {}
  }
}
