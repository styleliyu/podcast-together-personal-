export type MusicPlatform = "netease" | "tencent" | "kugou" | "kuwo" | "baidu"
export type MusicResourceKind = "track" | "playlist" | "album"

export interface MusicResource {
  platform: MusicPlatform
  kind: MusicResourceKind
  id: string
  linkUrl: string
}

export interface MusicLinkAdapter {
  platform: MusicPlatform | "directAudio" | "localAudio"
  canHandle(host: string): boolean
  parse(url: URL, linkUrl: string): MusicResource | null
}
