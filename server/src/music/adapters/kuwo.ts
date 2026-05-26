import type { MusicLinkAdapter, MusicResource } from "./types"
import { linkText, pickMatch, pickParamAnywhere } from "./shared"

export const kuwoAdapter: MusicLinkAdapter = {
  platform: "kuwo",
  canHandle(host: string): boolean {
    return host === "kuwo.cn" || host.endsWith(".kuwo.cn")
  },
  parse(url: URL, linkUrl: string): MusicResource | null {
    const text = linkText(url)
    const trackId = pickMatch(text, [/play_detail\/([0-9]+)/i, /yinyue\/([0-9]+)/i]) || pickParamAnywhere(url, text, ["rid", "id"])
    if (trackId && /play_detail|yinyue|rid=/i.test(text)) return { platform: "kuwo", kind: "track", id: trackId, linkUrl }

    const playlistId = pickMatch(text, [/playlist_detail\/([0-9]+)/i, /playlist\/([0-9]+)/i]) || pickParamAnywhere(url, text, ["pid", "playlistId"])
    if (playlistId) return { platform: "kuwo", kind: "playlist", id: playlistId, linkUrl }

    return null
  }
}
