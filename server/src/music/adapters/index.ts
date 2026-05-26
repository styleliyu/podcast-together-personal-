import { baiduAdapter } from "./baidu"
import { directAudioAdapter } from "./directAudio"
import { kugouAdapter } from "./kugou"
import { kuwoAdapter } from "./kuwo"
import { localAudioAdapter } from "./localAudio"
import { neteaseAdapter } from "./netease"
import { qqAdapter } from "./qq"
import type { MusicLinkAdapter, MusicResource } from "./types"

export type { MusicPlatform, MusicResource, MusicResourceKind } from "./types"

export const musicLinkAdapters: MusicLinkAdapter[] = [
  neteaseAdapter,
  qqAdapter,
  kugouAdapter,
  kuwoAdapter,
  baiduAdapter,
  directAudioAdapter,
  localAudioAdapter
]

export function parseMusicResourceWithAdapters(link: string): MusicResource | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase()
  if (isUnsupportedHost(host)) return null

  for (const adapter of musicLinkAdapters) {
    if (!adapter.canHandle(host)) continue
    const resource = adapter.parse(url, link)
    if (resource) return resource
  }

  return null
}

function isUnsupportedHost(host: string): boolean {
  return host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "xiami.com" || host.endsWith(".xiami.com")
}
