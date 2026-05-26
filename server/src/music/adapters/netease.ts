import type { MusicLinkAdapter, MusicResource } from "./types"
import { linkText, pickMatch, pickParamAnywhere } from "./shared"

export const neteaseAdapter: MusicLinkAdapter = {
  platform: "netease",
  canHandle(host: string): boolean {
    return host === "music.163.com" || host.endsWith(".music.163.com")
  },
  parse(url: URL, linkUrl: string): MusicResource | null {
    const text = linkText(url)
    const id = pickParamAnywhere(url, text, ["id", "songId", "songid"])

    if (/#?\/song(?:\?|\/|$)/i.test(text) || /\/song\/media\/outer\/url/i.test(text)) {
      if (!id) return null
      return { platform: "netease", kind: "track", id, linkUrl }
    }

    if (/#?\/playlist(?:\?|\/|$)/i.test(text)) {
      if (!id) return null
      return { platform: "netease", kind: "playlist", id, linkUrl }
    }

    const playlistId = pickMatch(text, [/playlist\/([0-9]+)/i])
    if (playlistId) return { platform: "netease", kind: "playlist", id: playlistId, linkUrl }

    return null
  }
}
