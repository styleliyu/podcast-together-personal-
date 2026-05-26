import axios from "axios"
import crypto from "crypto"
import fs from "fs"
import path from "path"
import type { ContentData, QueueItem, RequestRes, RoomQueue } from "../types"
import { parseMusicResourceWithAdapters } from "./adapters"
import type { MusicPlatform, MusicResource, MusicResourceKind } from "./adapters"

export type { MusicPlatform, MusicResourceKind }

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
const DEFAULT_QQ_COOKIE_FILE = "./data/qq-music-cookie.txt"
const PLAY_URL_CACHE_MS = 30 * 60 * 1000
const PLAY_URL_FAIL_COOLDOWN_MS = 30 * 1000

const playUrlCache = new Map<string, { expiresAt: number; content?: ContentData; failed?: boolean }>()

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
    if (resource.kind === "playlist") return parsePlaylist(resource)
    return {
      code: "E4004",
      showMsg: "当前暂不支持专辑链接直接创建房间。"
    }
  }

  try {
    const data = await resolveTrackWithCache(resource)
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

export async function resolveQueueItemContent(item: QueueItem): Promise<ContentData | null> {
  if (item.audioUrl) {
    return {
      infoType: "podcast",
      audioUrl: item.audioUrl,
      sourceType: item.sourceType,
      title: item.title,
      imageUrl: item.imageUrl || "",
      linkUrl: item.linkUrl || "",
      seriesName: item.artist || sourceNameFromString(item.sourceType)
    }
  }

  if (!isMusicPlatform(item.sourceType) || !item.resourceId) return null
  const data = await resolveTrackWithCache({
    platform: item.sourceType,
    kind: "track",
    id: item.resourceId,
    linkUrl: item.linkUrl || ""
  })
  return data
}

export async function getPlaylistImportData(link: string): Promise<RequestRes<{ link: string; items: QueueItem[] }> | null> {
  const resource = parseMusicResource(link)
  if (!resource || resource.kind !== "playlist") return null

  try {
    const items = await resolvePlaylistItems(resource)
    if (!items.length) return { code: "E4004", showMsg: "歌单为空或平台暂时没有返回曲目列表。" }
    return { code: "0000", data: { link, items } }
  } catch (err: any) {
    console.error("playlist metadata parse failed", err?.code || err?.message || err)
    return { code: "E4004", showMsg: "歌单解析失败，请更换链接或稍后再试。" }
  }
}

async function parsePlaylist(resource: MusicResource): Promise<RequestRes<ContentData>> {
  try {
    const items = await resolvePlaylistItems(resource)
    if (!items.length) {
      return { code: "E4004", showMsg: "歌单为空或平台暂时没有返回曲目列表。" }
    }

    const playable = await resolveInitialPlayableQueueItems(items, 3)
    if (!playable.length) return { code: "E4004", showMsg: "歌单中没有可播放的歌曲，请更换歌单或平台。" }

    const first = playable[0]
    const content = await resolveQueueItemContent(first)
    if (!content?.audioUrl) return { code: "E4004", showMsg: "歌单中没有可播放的歌曲，请更换歌单或平台。" }

    const queue: RoomQueue = { items: playable, currentIndex: 0, playMode: "sequence" }
    return {
      code: "0000",
      data: {
        ...content,
        queue,
        pendingPlaylistImport: {
          link: resource.linkUrl,
          items,
          importedItemIds: playable.map(item => item.id)
        }
      }
    }
  } catch (err: any) {
    console.error("playlist parse failed", err?.code || err?.message || err)
    return { code: "E4004", showMsg: "歌单解析失败，请更换链接或稍后再试。" }
  }
}

async function resolveInitialPlayableQueueItems(items: QueueItem[], maxCount: number): Promise<QueueItem[]> {
  const playable: QueueItem[] = []
  const candidates = items.slice(0, Math.max(maxCount, 10))
  for (const item of candidates) {
    if (playable.length >= maxCount) break
    try {
      const content = await resolveQueueItemContent(item)
      if (content?.audioUrl) playable.push(toPlayableQueueItem(item, content))
    } catch {}
  }
  return playable
}

async function resolvePlaylistItems(resource: MusicResource): Promise<QueueItem[]> {
  if (resource.platform === "netease") return getNeteasePlaylistItems(resource.id)
  if (resource.platform === "tencent") return getTencentPlaylistItems(resource.id)
  if (resource.platform === "kugou") return getKugouPlaylistItems(resource.id)
  if (resource.platform === "kuwo") return getKuwoPlaylistItems(resource.id)
  if (resource.platform === "baidu") return getBaiduPlaylistItems(resource.id)
  return []
}

function parseMusicResource(link: string): MusicResource | null {
  return parseMusicResourceWithAdapters(link)
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
  const playlistId = pickParamAnywhere(url, text, ["pid", "playlistid"]) || pickMatch(text, [
    /\/playlist(?:\/index)?\/?(\d+)/i,
    /\/playlist_detail\/(\d+)/i
  ])
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

async function resolveTrackWithCache(resource: MusicResource): Promise<ContentData | null> {
  const key = trackCacheKey(resource)
  const cached = playUrlCache.get(key)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.failed ? null : cached.content || null
  if (cached) playUrlCache.delete(key)

  const content = await resolveTrack(resource)
  if (content?.audioUrl) {
    playUrlCache.set(key, { expiresAt: now + PLAY_URL_CACHE_MS, content })
    return content
  }

  playUrlCache.set(key, { expiresAt: now + PLAY_URL_FAIL_COOLDOWN_MS, failed: true })
  return null
}

function trackCacheKey(resource: MusicResource): string {
  return `${resource.platform}:${resource.id || resource.linkUrl}`
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

async function getNeteasePlaylistItems(playlistId: string): Promise<QueueItem[]> {
  const res = await http.get("https://music.163.com/api/v6/playlist/detail", {
    params: { id: playlistId },
    headers: getNeteaseHeaders()
  })
  const tracks = parseMaybeJson(res.data)?.playlist?.tracks
  if (!Array.isArray(tracks)) return []
  return tracks.map((song: any) => ({
    id: `netease:${song.id}`,
    sourceType: "netease",
    resourceId: String(song.id),
    title: cleanMetaText(song.name) || "网易云音乐",
    artist: Array.isArray(song.ar || song.artists) ? (song.ar || song.artists).map((v: any) => v.name).filter(Boolean).join(" / ") : "",
    imageUrl: song.al?.picUrl || song.album?.picUrl || "",
    linkUrl: `https://music.163.com/#/song?id=${song.id}`
  }))
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
    headers: getTencentHeaders()
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
  try {
    const res = await http.get("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      params: {
        format: "json",
        platform: "yqq.json",
        needNewCode: 0,
        data: JSON.stringify(payload)
      },
      headers: getTencentHeaders()
    })
    const data = parseMaybeJson(res.data)
    const sip = data?.req_0?.data?.sip?.[0] || "https://dl.stream.qqmusic.qq.com/"
    const item = data?.req_0?.data?.midurlinfo?.find((v: any) => v?.purl)
    if (item?.purl) return { url: `${sip}${item.purl}`, br: item?.songmid ? 128 : -1 }
  } catch {}

  return getTencentPlayUrlByCopws(songMid, mediaMid)
}

async function getTencentPlayUrlByCopws(songMid: string, mediaMid: string): Promise<PlayUrl> {
  const qualities = [
    { quality: 320, prefix: "M800", suffix: "mp3" },
    { quality: 128, prefix: "M500", suffix: "mp3" },
    { quality: 96, prefix: "C400", suffix: "m4a" }
  ]
  const fileMids = Array.from(new Set([mediaMid, songMid].filter(Boolean)))

  for (const fileMid of fileMids) {
    for (const quality of qualities) {
      const payload = {
        req_1: {
          module: "vkey.GetVkeyServer",
          method: "CgiGetVkey",
          param: {
            filename: [`${quality.prefix}${fileMid}${fileMid}.${quality.suffix}`],
            guid: "10000",
            songmid: [songMid],
            songtype: [0],
            uin: "0",
            loginflag: 1,
            platform: "20"
          }
        },
        loginUin: "0",
        comm: {
          uin: "0",
          format: "json",
          ct: 24,
          cv: 0
        }
      }

      try {
        const res = await http.post("https://u.y.qq.com/cgi-bin/musicu.fcg", payload, {
          headers: getTencentHeaders({
            Accept: "application/json, text/plain, */*",
            "Content-Type": "application/json;charset=UTF-8"
          })
        })
        const data = parseMaybeJson(res.data)
        const sip = data?.req_1?.data?.sip?.[0] || "https://dl.stream.qqmusic.qq.com/"
        const purl = data?.req_1?.data?.midurlinfo?.[0]?.purl
        if (purl) return { url: `${sip}${purl}`, br: quality.quality }
      } catch {}
    }
  }

  return { url: "", br: -1 }
}

async function getTencentPlaylistItems(disstid: string): Promise<QueueItem[]> {
  let tracks = await requestTencentPlaylist("https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg", disstid)
  if (!Array.isArray(tracks) || !tracks.length) {
    tracks = await requestTencentPlaylist("https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg", disstid)
  }
  if (!Array.isArray(tracks)) return []
  return tracks.map((song: any) => {
    const mid = song.songmid || song.mid
    return {
      id: `tencent:${mid || song.songid}`,
      sourceType: "tencent",
      resourceId: String(mid || song.songid || ""),
      title: cleanMetaText(song.songname || song.name) || "QQ音乐",
      artist: Array.isArray(song.singer) ? song.singer.map((v: any) => v.name).filter(Boolean).join(" / ") : "",
      imageUrl: song.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.albummid}.jpg?max_age=2592000` : "",
      linkUrl: mid ? `https://y.qq.com/n/ryqq/songDetail/${mid}` : ""
    }
  }).filter((item: QueueItem) => item.resourceId)
}

async function requestTencentPlaylist(endpoint: string, disstid: string): Promise<any[]> {
  try {
    const res = await http.get(endpoint, {
      params: {
        type: 1,
        json: 1,
        utf8: 1,
        onlysong: 0,
        nosign: 1,
        disstid,
        g_tk: 5381,
        loginUin: 0,
        hostUin: 0,
        format: "json",
        inCharset: "GB2312",
        outCharset: "utf-8",
        notice: 0,
        platform: "yqq",
        needNewCode: 0
      },
      headers: getTencentHeaders()
    })
    const tracks = parseMaybeJson(res.data)?.cdlist?.[0]?.songlist
    return Array.isArray(tracks) ? tracks : []
  } catch {
    return []
  }
}

function getTencentHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    Referer: "https://y.qq.com/",
    Origin: "https://y.qq.com",
    "User-Agent": "Mozilla/5.0 podcast-together music resolver",
    ...extra
  }
  const cookie = getTencentCookie()
  if (cookie) headers.Cookie = cookie
  return headers
}

function getTencentCookie(): string {
  const fileCookie = readTencentCookieFile()
  if (fileCookie) return fileCookie
  return (process.env.QQ_MUSIC_COOKIE || "").trim()
}

function readTencentCookieFile(): string {
  const configuredPath = process.env.QQ_MUSIC_COOKIE_FILE || DEFAULT_QQ_COOKIE_FILE
  const cookiePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath)

  try {
    const raw = fs.readFileSync(cookiePath, "utf8").trim()
    if (!raw) return ""
    const envStyle = raw.match(/^QQ_MUSIC_COOKIE\s*=\s*([\s\S]*)$/)
    return (envStyle?.[1] || raw).trim().replace(/^["']|["']$/g, "")
  } catch (err: any) {
    if (err?.code !== "ENOENT") console.warn("failed to read QQ music cookie file", err?.message || err)
    return ""
  }
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

async function getKugouPlaylistItems(specialId: string): Promise<QueueItem[]> {
  const res = await http.get("http://mobilecdn.kugou.com/api/v3/special/song", {
    params: {
      specialid: specialId,
      page: 1,
      pagesize: 100000,
      format: "json"
    },
    headers: { Referer: "https://www.kugou.com/" }
  })
  const list = parseMaybeJson(res.data)?.data?.info
  if (!Array.isArray(list)) return []
  return list.map((song: any) => {
    const hash = song.hash || song.Hash
    return {
      id: `kugou:${hash || song.audio_id}`,
      sourceType: "kugou",
      resourceId: String(hash || ""),
      title: cleanMetaText(song.songname || song.filename || song.name) || "酷狗音乐",
      artist: song.singername || song.singer || "",
      imageUrl: typeof song.imgurl === "string" ? song.imgurl.replace("{size}", "400") : "",
      linkUrl: hash ? `https://www.kugou.com/song/#hash=${hash}` : ""
    }
  }).filter((item: QueueItem) => item.resourceId)
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

async function getKuwoPlaylistItems(pid: string): Promise<QueueItem[]> {
  const pageSize = 100
  const all: any[] = []
  let total = Number.POSITIVE_INFINITY
  for (let page = 0; all.length < total; page++) {
    const res = await http.get("http://nplserver.kuwo.cn/pl.svc", {
      params: {
        op: "getlistinfo",
        pid,
        pn: page,
        rn: pageSize,
        encode: "utf-8",
        keyset: "pl2012",
        identity: "kuwo"
      },
      headers: {
        Referer: "https://www.kuwo.cn/"
      }
    })
    const data = parseMaybeJson(res.data)
    const list = data?.musiclist
    if (!Array.isArray(list) || !list.length) break
    all.push(...list)
    total = Number(data?.total || all.length)
    if (list.length < pageSize) break
  }
  return all.map((song: any) => {
    const id = song.id || song.ID || song.musicrid?.replace(/^MUSIC_/, "") || song.MUSICRID?.replace(/^MUSIC_/, "")
    return {
      id: `kuwo:${id}`,
      sourceType: "kuwo",
      resourceId: String(id || ""),
      title: cleanMetaText(song.name || song.NAME) || "酷我音乐",
      artist: song.artist || song.ARTIST || song.FARTIST || "",
      imageUrl: song.pic || song.PIC || "",
      linkUrl: id ? `https://www.kuwo.cn/play_detail/${id}` : ""
    }
  }).filter((item: QueueItem) => item.resourceId)
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

async function getBaiduPlaylistItems(listId: string): Promise<QueueItem[]> {
  const data = await requestQianqianApi("tracklist/info", { id: listId }).catch(() => null)
  const list = data?.data?.trackList || data?.data?.tracks || data?.data?.songList || []
  if (!Array.isArray(list)) return []
  return list.map((song: any) => {
    const id = song.TSID || song.tsid || song.songId || song.songid
    return {
      id: `baidu:${id}`,
      sourceType: "baidu",
      resourceId: String(id || ""),
      title: cleanMetaText(song.title || song.songName || song.name) || "百度音乐",
      artist: song.artistName || song.author || song.artist || "",
      imageUrl: song.pic || song.picRadio || "",
      linkUrl: id ? `https://music.91q.com/song/${id}` : ""
    }
  }).filter((item: QueueItem) => item.resourceId)
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

export function toPlayableQueueItem(item: QueueItem, content: ContentData): QueueItem {
  return {
    ...item,
    audioUrl: content.audioUrl,
    title: item.title || content.title || sourceNameFromString(item.sourceType),
    artist: item.artist || content.seriesName || "",
    imageUrl: item.imageUrl || content.imageUrl || "",
    linkUrl: item.linkUrl || content.linkUrl || ""
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

function sourceNameFromString(sourceType: string): string {
  if (isMusicPlatform(sourceType)) return sourceName(sourceType)
  if (sourceType === "local_upload") return "本地歌曲"
  return sourceType || "音频"
}

function isMusicPlatform(sourceType: string): sourceType is MusicPlatform {
  return ["netease", "tencent", "kugou", "kuwo", "baidu"].includes(sourceType)
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
