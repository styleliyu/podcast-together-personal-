import type { MusicLinkAdapter, MusicResource } from "./types"

export const localAudioAdapter: MusicLinkAdapter = {
  platform: "localAudio",
  canHandle(): boolean {
    return false
  },
  parse(): MusicResource | null {
    return null
  }
}
