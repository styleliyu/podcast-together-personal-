import axios from "axios"
import * as cheerio from "cheerio"
import crypto from "crypto"
import type { ContentData, RequestContext, RequestRes } from "./types"

type CheerioAPI = ReturnType<typeof cheerio.load>

const MAX_FETCH_MILLI = 4000
const WX_AUDIO_URL = "https://res.wx.qq.com/voice/getvoice?mediaid="
const XIMALAYA_API_ORIGIN = "https://api.ximalaya.com"

export async function handleParseText(ctx: RequestContext): Promise<RequestRes<ContentData>> {
  const err = checkEntry(ctx)
  if (err) return err

  const link = ctx.body.link as string
  if (judgeIsCdnLink(link)) {
    return {
      code: "0000",
      data: {
        infoType: "podcast",
        audioUrl: link
      }
    }
  }

  if (isXimalayaLink(link)) {
    const ximalayaRes = await resolveXimalayaLink(link, ctx.body["x-pt-local-id"])
    if (ximalayaRes) return { code: "0000", data: ximalayaRes }
    return {
      code: "E4004",
      showMsg: "喜马拉雅链接解析失败，请确认开放平台配置和该声音是否为可输出的免费内容"
    }
  }

  const html = await fetchLink(link)
  if (!html) return { code: "E4004" }
  return parseHtml(html, link)
}

function judgeIsCdnLink(link: string): boolean {
  const reg = /^https?:\/\/[\w.-]*\w{1,32}\.\w{2,6}\/\S+\.(mp3|m4a)(\?\S*)?$/i
  return reg.test(link)
}

function checkEntry(ctx: RequestContext): RequestRes<ContentData> | null {
  if (ctx.method !== "POST") return { code: "E4005" }
  const { link } = ctx.body || {}
  const clientId = ctx.body?.["x-pt-local-id"]
  if (!link || !clientId) return { code: "E4000" }
  if (typeof link !== "string" || !link.startsWith("http")) return { code: "E4000" }
  return null
}

async function fetchLink(link: string): Promise<string | undefined> {
  try {
    const res = await axios.get<string>(link, {
      timeout: MAX_FETCH_MILLI,
      responseType: "text",
      headers: {
        "User-Agent": "Mozilla/5.0 podcast-together"
      }
    })
    const html = res.data
    if (!html || typeof html !== "string") return undefined
    const lowerHtml = html.toLowerCase()
    if (!lowerHtml.includes("head") || !lowerHtml.includes("meta")) return undefined
    return html
  } catch (err) {
    console.error("fetch url failed", err)
    return undefined
  }
}

async function fetchLinkWithFinalUrl(link: string): Promise<{ html: string; finalUrl: string } | undefined> {
  try {
    const res = await axios.get<string>(link, {
      timeout: MAX_FETCH_MILLI,
      responseType: "text",
      maxRedirects: 8,
      headers: {
        "User-Agent": "Mozilla/5.0 podcast-together"
      }
    })
    const html = res.data
    if (!html || typeof html !== "string") return undefined
    const finalUrl = res.request?.res?.responseUrl || link
    return { html, finalUrl }
  } catch (err) {
    console.error("fetch url with redirect failed", err)
    return undefined
  }
}

function isXimalayaLink(link: string): boolean {
  try {
    const host = new URL(link).hostname.toLowerCase()
    return host === "xima.tv" || host.endsWith(".xima.tv") || host === "ximalaya.com" || host.endsWith(".ximalaya.com")
  } catch {
    return false
  }
}

async function resolveXimalayaLink(link: string, clientId?: string): Promise<ContentData | undefined> {
  const fetched = await fetchLinkWithFinalUrl(link)
  const finalUrl = fetched?.finalUrl || link
  const trackId = extractXimalayaTrackId(finalUrl) || extractXimalayaTrackId(link) || extractXimalayaTrackId(fetched?.html || "")
  if (!trackId) return undefined

  const [track, playInfo] = await Promise.all([
    requestXimalayaApi<XimalayaTrack>("/tracks/get_single", { track_id: trackId }, clientId),
    requestXimalayaApi<XimalayaPlayInfo[]>("/openapi_play_url/tracks/batch_get_play_info", { ids: trackId }, clientId)
  ])

  const audioUrl = pickXimalayaAudioUrl(playInfo?.[0])
  if (!audioUrl) return undefined

  const album = track?.subordinated_album
  return {
    infoType: "podcast",
    audioUrl,
    sourceType: "ximalaya",
    title: track?.track_title || `喜马拉雅声音 ${trackId}`,
    description: stripHtml(track?.track_intro || track?.track_rich_intro || ""),
    imageUrl: track?.cover_url_large || track?.cover_url_middle || track?.cover_url_small || album?.cover_url_large || album?.cover_url_middle || album?.cover_url_small || "",
    linkUrl: finalUrl,
    seriesName: album?.album_title || "",
    seriesUrl: album?.id ? `https://www.ximalaya.com/album/${album.id}` : ""
  }
}

function extractXimalayaTrackId(text: string): string {
  try {
    const url = new URL(text)
    if (url.hostname.includes("ximalaya.com")) {
      const lastNumericSegment = url.pathname.split("/").filter(Boolean).reverse().find(segment => /^\d+$/.test(segment))
      if (lastNumericSegment) return lastNumericSegment
      const srcId = url.searchParams.get("srcId") || url.searchParams.get("trackId") || url.searchParams.get("track_id")
      if (srcId && /^\d+$/.test(srcId)) return srcId
    }
  } catch {}

  const patterns = [
    /\/selfshare\/sound\/(\d+)/i,
    /\/sound\/(\d+)/i,
    /[?&](?:trackId|track_id|srcId)=([0-9]+)/i,
    /(["']trackId["']\s*:\s*|["']track_id["']\s*:\s*|["']srcId["']\s*:\s*["']?)(\d+)/i
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    return match[2] || match[1] || ""
  }

  return ""
}

interface XimalayaAlbum {
  id?: number
  album_title?: string
  cover_url_small?: string
  cover_url_middle?: string
  cover_url_large?: string
}

interface XimalayaTrack {
  id?: number
  track_title?: string
  track_intro?: string
  track_rich_intro?: string
  cover_url_small?: string
  cover_url_middle?: string
  cover_url_large?: string
  subordinated_album?: XimalayaAlbum
}

interface XimalayaPlayInfo {
  play_url_64?: string
  play_url_64_m4a?: string
  play_url_24_m4a?: string
  play_url_32?: string
}

async function requestXimalayaApi<T>(
  path: string,
  businessParams: Record<string, string>,
  clientId?: string
): Promise<T | undefined> {
  const appKey = process.env.XIMALAYA_APP_KEY
  const appSecret = process.env.XIMALAYA_APP_SECRET
  if (!appKey || !appSecret) {
    console.warn("XIMALAYA_APP_KEY or XIMALAYA_APP_SECRET is not configured")
    return undefined
  }

  const params: Record<string, string> = {
    ...businessParams,
    app_key: appKey,
    client_os_type: process.env.XIMALAYA_CLIENT_OS_TYPE || "4",
    nonce: crypto.randomBytes(16).toString("hex"),
    timestamp: String(Date.now()),
    server_api_version: process.env.XIMALAYA_SERVER_API_VERSION || "1.0.0",
    device_id: process.env.XIMALAYA_DEVICE_ID || clientId || "podcast-together",
  }

  if (process.env.XIMALAYA_DEVICE_ID_TYPE) {
    params.device_id_type = process.env.XIMALAYA_DEVICE_ID_TYPE
  }

  params.sig = createXimalayaSig(params, appSecret)

  try {
    const res = await axios.get<T>(`${XIMALAYA_API_ORIGIN}${path}`, {
      timeout: MAX_FETCH_MILLI,
      params,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Use-V2-Error-Code": "true"
      }
    })
    return res.data
  } catch (err) {
    console.error(`ximalaya api failed: ${path}`, err)
    return undefined
  }
}

function createXimalayaSig(params: Record<string, string>, appSecret: string): string {
  const plain = Object.keys(params)
    .filter(key => key !== "sig")
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("&")

  if (process.env.XIMALAYA_SIG_MODE === "hmac_sha1_md5") {
    const hmac = crypto.createHmac("sha1", appSecret).update(plain, "utf8").digest()
    return crypto.createHash("md5").update(hmac).digest("hex")
  }

  return crypto.createHash("md5").update(`${appSecret}${plain}${appSecret}`, "utf8").digest("hex")
}

function pickXimalayaAudioUrl(playInfo?: XimalayaPlayInfo): string {
  if (!playInfo) return ""
  return playInfo.play_url_64_m4a || playInfo.play_url_64 || playInfo.play_url_24_m4a || playInfo.play_url_32 || ""
}

function stripHtml(input: string): string {
  if (!input) return ""
  return cheerio.load(input).text().replace(/\s+/g, " ").trim()
}

function parseHtml(html: string, originLink: string): RequestRes<ContentData> {
  const $ = cheerio.load(html)

  let appName = ""
  let sourceType = ""
  let title = ""
  let audioUrl = ""
  let description = ""
  let imageUrl = ""
  let twitterImage = ""
  let linkUrl = ""
  let seriesName = ""
  let seriesUrl = ""
  const isMp = originLink.includes("mp.weixin.qq.com")

  $("head meta").each((_, el) => {
    const meta = $(el)
    const metaProperty = meta.attr("property")
    const metaName = meta.attr("name")
    const metaContent = meta.attr("content")

    if (metaProperty === "og:title") title = metaContent || ""
    else if (metaProperty === "og:description" || metaProperty === "description") description = metaContent || ""
    else if (metaProperty === "og:image") imageUrl = metaContent || ""
    else if (metaProperty === "og:audio") audioUrl = metaContent || ""
    else if (metaName === "application-name") appName = metaContent || ""
    else if (metaProperty === "twitter:image") twitterImage = metaContent || ""
    else if (metaProperty === "og:url") linkUrl = metaContent || ""
    else if (metaProperty === "og:site_name" && !appName) appName = metaContent || ""
  })

  if (!audioUrl) {
    audioUrl = getAudioUrl(html, { isMp })
    if (!audioUrl) return { code: "E4004" }
  }

  if (!imageUrl && twitterImage) imageUrl = twitterImage
  if (!title) title = $("head title").text().trim() || ""

  $("head script").each((_, el) => {
    const script = $(el)
    const scriptName = script.attr("name")
    if (scriptName === "schema:podcast-show") {
      const scriptJson = parseJson(script.text())
      const epUrl = scriptJson?.url || ""
      if (epUrl) linkUrl = epUrl
      const partOfSeries = scriptJson?.partOfSeries || {}
      seriesName = partOfSeries.name || seriesName
      seriesUrl = partOfSeries.url || seriesUrl
      if (scriptJson?.description) description = scriptJson.description
    } else if (scriptName === "schema:podcast-episode") {
      const scriptJson = parseJson(script.text())
      if (scriptJson?.name) title = scriptJson.name
      if (scriptJson?.description) description = scriptJson.description
      if (scriptJson?.isPartOf) seriesName = scriptJson.isPartOf
    }
  })

  if (originLink.includes("pod.link")) {
    const forPodLink = handleForPodLink($, html)
    if (forPodLink.title) title = forPodLink.title
    if (forPodLink.description) description = forPodLink.description
    if (forPodLink.seriesName) seriesName = forPodLink.seriesName
    if (forPodLink.seriesUrl) seriesUrl = forPodLink.seriesUrl
    if (forPodLink.audioUrl) audioUrl = forPodLink.audioUrl
  }

  const isYzyx = originLink.includes("youzhiyouxing.cn")
  if (isYzyx) {
    const forYzyx = handleForYouZhiYouXing($)
    if (!imageUrl && forYzyx.imageUrl) imageUrl = forYzyx.imageUrl
    if (!seriesName && forYzyx.seriesName) seriesName = forYzyx.seriesName
  }

  if (isMp) {
    sourceType = "weixin_mp"
    imageUrl = ""
    const reg4Mp = /(?<=class="profile_nickname">)\S+(?=<\/strong>)/g
    const matches4Mp = html.matchAll(reg4Mp)
    for (const match of matches4Mp) seriesName = match[0]
  }

  if (!linkUrl) linkUrl = originLink

  if (appName === "小宇宙") sourceType = "xiaoyuzhou"
  else if (appName === "一派·Podcast") {
    sourceType = "sspai"
    if (!seriesName) seriesName = "一派·Podcast"
    if (!seriesUrl) seriesUrl = "https://sspai.typlog.io/"
  } else if (isYzyx) sourceType = "youzhiyouxing"
  else if (linkUrl.includes("podcasts.apple.com")) sourceType = "apple_podcast"
  else if (appName && !seriesName) seriesName = appName

  return {
    code: "0000",
    data: {
      infoType: "podcast",
      title,
      audioUrl,
      description,
      imageUrl,
      linkUrl,
      sourceType,
      seriesName,
      seriesUrl
    }
  }
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function handleForPodLink($: CheerioAPI, html: string) {
  let title = ""
  let description = ""
  let seriesName = ""
  let seriesUrl = ""
  let audioUrl = ""

  $(".aj.ff.gp .am.dq .am.ao").each((i, el) => {
    const elText = $(el).text()
    if (elText) {
      if (i < 1) title = elText
      else seriesName = elText
    }
  })

  $(".cx .ef.eg").each((_, el) => {
    const elText = $(el).text()
    if (elText) description = elText.trim()
  })

  if (title) {
    let newHtml = html
    const idx = newHtml.indexOf("window.__STATE__")
    if (idx > 0) {
      newHtml = newHtml.substring(idx)
      const idx2 = newHtml.indexOf(title)
      if (idx2 > 0) {
        newHtml = newHtml.substring(idx2)
        audioUrl = getAudioUrl(newHtml, { isMp: false })
      }
    }
  }

  return { title, description, seriesName, seriesUrl, audioUrl }
}

function handleForYouZhiYouXing($: CheerioAPI) {
  let imageUrl = ""
  let seriesName = ""
  $(".lazy-image-container img").each((_, el) => {
    const src = $(el).attr("data-src")
    if (src) imageUrl = src
  })
  $("body .tw-text-14.tw-leading-none").each((_, el) => {
    const elText = $(el).text()
    if (elText) seriesName = elText.trim()
  })
  return { imageUrl, seriesName }
}

function getAudioUrl(html: string, opt: { isMp: boolean }): string {
  const reg0 = /https?:\/\/[^\s/"']{2,80}\/[^\s"']{2,300}\.(mp3|m4a)\?[^\s/"']{3,300}/g
  let matches = html.matchAll(reg0)
  for (const match of matches) return match[0]

  const reg = /https?:\/\/[^\s/"']{2,80}\/[^\s"']{2,300}\.(mp3|m4a)/g
  matches = html.matchAll(reg)
  for (const match of matches) return match[0]

  if (!opt.isMp) return ""

  const reg2 = /(?<="voice_id":")\w{10,50}(?=")/g
  matches = html.matchAll(reg2)
  for (const match of matches) return WX_AUDIO_URL + match[0]

  const reg3 = /(?<='voice_id':')\w{10,50}(?=')/g
  matches = html.matchAll(reg3)
  for (const match of matches) return WX_AUDIO_URL + match[0]

  return ""
}
