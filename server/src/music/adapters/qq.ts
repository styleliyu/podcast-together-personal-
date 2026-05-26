import type { MusicLinkAdapter, MusicResource } from "./types"
import { linkText, pickMatch, pickParamAnywhere } from "./shared"

export const qqAdapter: MusicLinkAdapter = {
  platform: "tencent",
  canHandle(host: string): boolean {
    return host === "qq.com" || host.endsWith(".qq.com")
  },
  parse(url: URL, linkUrl: string): MusicResource | null {
    const text = linkText(url)
    const songMid = pickMatch(text, [/songDetail\/([A-Za-z0-9]+)/i, /song\/([A-Za-z0-9]+)/i]) || pickParamAnywhere(url, text, ["songmid", "songMid"])
    if (songMid) return { platform: "tencent", kind: "track", id: songMid, linkUrl }

    const disstid = pickMatch(text, [/playlist\/([0-9]+)/i, /playsquare\/([0-9]+)/i]) || pickParamAnywhere(url, text, ["disstid", "id"])
    if (disstid) return { platform: "tencent", kind: "playlist", id: disstid, linkUrl }

    return null
  }
}
