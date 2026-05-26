import type { MusicLinkAdapter, MusicResource } from "./types"

export const directAudioAdapter: MusicLinkAdapter = {
  platform: "directAudio",
  canHandle(): boolean {
    return false
  },
  parse(): MusicResource | null {
    return null
  }
}
