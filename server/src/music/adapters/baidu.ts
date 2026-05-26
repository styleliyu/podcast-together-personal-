import type { MusicLinkAdapter, MusicResource } from "./types"
import { linkText, pickMatch, pickParamAnywhere } from "./shared"

export const baiduAdapter: MusicLinkAdapter = {
  platform: "baidu",
  canHandle(host: string): boolean {
    return host === "taihe.com" || host.endsWith(".taihe.com") || host === "qianqian.com" || host.endsWith(".qianqian.com") || host === "91q.com" || host.endsWith(".91q.com") || host === "music.baidu.com"
  },
  parse(url: URL, linkUrl: string): MusicResource | null {
    const text = linkText(url)
    const songId = pickMatch(text, [/song\/([A-Za-z0-9]+)/i]) || pickParamAnywhere(url, text, ["songid", "songId", "id"])
    if (songId && /song/i.test(text)) return { platform: "baidu", kind: "track", id: songId, linkUrl }

    const playlistId = pickMatch(text, [/playlist\/([A-Za-z0-9]+)/i, /songlist\/([A-Za-z0-9]+)/i]) || pickParamAnywhere(url, text, ["listid", "playlistId"])
    if (playlistId) return { platform: "baidu", kind: "playlist", id: playlistId, linkUrl }

    return null
  }
}
