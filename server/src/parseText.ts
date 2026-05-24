import axios from "axios"
import * as cheerio from "cheerio"
import type { ContentData, RequestContext, RequestRes } from "./types"

type CheerioAPI = ReturnType<typeof cheerio.load>

const MAX_FETCH_MILLI = 4000
const WX_AUDIO_URL = "https://res.wx.qq.com/voice/getvoice?mediaid="

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
