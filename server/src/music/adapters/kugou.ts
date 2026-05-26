import type { MusicLinkAdapter, MusicResource } from "./types"
import { linkText, pickMatch, pickParamAnywhere } from "./shared"

const KUGOU_HASH_RE = /^[A-Fa-f0-9]{16,64}$/

export const kugouAdapter: MusicLinkAdapter = {
  platform: "kugou",
  canHandle(host: string): boolean {
    return host === "kugou.com" || host.endsWith(".kugou.com")
  },
  parse(url: URL, linkUrl: string): MusicResource | null {
    const text = linkText(url)
    const specialId = pickMatch(text, [/special\/single\/([0-9]+)/i, /playlist\/([0-9]+)/i]) || pickParamAnywhere(url, text, ["specialid", "global_collection_id", "id"])
    if (specialId && /special|playlist|global_collection_id/i.test(text)) {
      return { platform: "kugou", kind: "playlist", id: specialId, linkUrl }
    }

    const hash = pickParamAnywhere(url, text, ["hash"]) || pickMatch(text, [/hash=([A-Fa-f0-9]{16,64})/i, /song\/#?([A-Fa-f0-9]{16,64})/i])
    if (hash && KUGOU_HASH_RE.test(hash)) return { platform: "kugou", kind: "track", id: hash, linkUrl }

    const mixSongId = pickMatch(text, [/mixsong\/([^/?#]+)\.html/i, /song\/([^/?#]+)\.html/i])
    if (mixSongId) return { platform: "kugou", kind: "track", id: mixSongId, linkUrl }

    return null
  }
}
