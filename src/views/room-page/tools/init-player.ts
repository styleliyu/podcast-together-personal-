import Shikwasa from "shikwasa2"
import { Ref } from "vue"
import playerTool from "./player-tool"

export interface PlayerCallbacks {
  durationchange?: (duration?: number) => void
  canplay?: (e: Event) => void
  loadeddata?: (e: Event) => void
  pause?: (e: Event) => void
  playing?: (e: Event) => void
  ratechange?: (e: Event) => void
  seeked?: (e: Event) => void
  ended?: (e: Event) => void
  prev?: () => void
  next?: () => void
}

export interface AudioData {
  src: string
  title?: string
  cover?: string
  artist?: string
  album?: string
}

export function initPlayer(
  playerEl: Ref, 
  audioData: AudioData, 
  callbacks: PlayerCallbacks,
  onBeforeClick: (target: string) => boolean,
): any {
  let player = new Shikwasa({
    container: () => playerEl.value,
    audio: audioData,
    themeColor: "var(--text-color)",
    speedOptions: playerTool.initSpeedOptions(),
    onBeforeClick,
  })

  player.on("audioupdate", (e: Event) => {})

  player.on("audioparse", (e: Event) => {})

  patchSeekButtons(playerEl.value, callbacks)
  patchProgressDrag(playerEl.value, player, onBeforeClick)

  // 去监听 播放器的各个事件回调
  player.on("abort", (e: Event) => {
    console.log("player abort.............")
    console.log(e)
    console.log(" ")
  })

  player.on("complete", (e: Event) => {})

  player.on("durationchange", (e: any) => {
    let myAudio = e?.path?.[0]
    if(!myAudio) {
      myAudio = e?.srcElement
    }
    let duration = myAudio?.duration

    console.log("看一下音频总时长: ", duration)
    console.log(" ")
    callbacks.durationchange && callbacks.durationchange(duration)
  })

  player.on("emptied", (e: Event) => {
    console.log("player emptied.............")
    console.log(e)
    console.log(" ")
  })

  player.on("ended", (e: Event) => {
    callbacks.ended && callbacks.ended(e)
  })

  player.on("error", (e: Event) => {
    console.log("player error.............")
    console.log(e)
    console.log(" ")
  })

  player.on("canplay", (e: Event) => {
    if(!playerTool.checkThrottle("canplay")) return
    callbacks.canplay && callbacks.canplay(e)
  })

  player.on("loadeddata", (e: Event) => {
    console.log("player loadeddata.........")
    console.log(e)
    console.log(" ")
    
    callbacks.loadeddata && callbacks.loadeddata(e)
  })

  player.on("pause", (e: Event) => {
    if(!playerTool.checkThrottle("pause")) return
    callbacks.pause && callbacks.pause(e)
  })

  player.on("playing", (e: Event) => {
    if(!playerTool.checkThrottle("play")) return
    callbacks.playing && callbacks.playing(e)
  })

  player.on("ratechange", (e: Event) => {
    if(!playerTool.checkThrottle("speed")) return
    callbacks.ratechange && callbacks.ratechange(e)
  })

  player.on("seeking", (e: Event) => {
    // console.log("seeking..................")
    // console.log(e)
    // console.log(" ")
  })

  player.on("seeked", (e: Event) => {
    if(!playerTool.checkThrottle("seek")) return
    callbacks.seeked && callbacks.seeked(e)
  })

  player.on("waiting", (e: Event) => {
    console.log("player waiting.............")
    console.log(e)
    console.log(" ")
  })

  console.log("已创建播放器........................")
  console.log(" ")

  return player
}

function patchSeekButtons(container: HTMLElement | null, callbacks: PlayerCallbacks): void {
  if(!container) return
  const prevBtn = container.querySelector<HTMLButtonElement>(".shk-btn_backward")
  const nextBtn = container.querySelector<HTMLButtonElement>(".shk-btn_forward")
  patchQueueButton(prevBtn, "上一首", prevIcon(), () => callbacks.prev && callbacks.prev())
  patchQueueButton(nextBtn, "下一首", nextIcon(), () => callbacks.next && callbacks.next())
}

function patchQueueButton(btn: HTMLButtonElement | null, label: string, icon: string, callback: () => void): void {
  if(!btn) return
  btn.title = label
  btn.setAttribute("aria-label", label)
  btn.innerHTML = icon
  btn.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopImmediatePropagation()
    callback()
  }, true)
}

function patchProgressDrag(container: HTMLElement | null, player: any, onBeforeClick: (target: string) => boolean): void {
  if(!container) return
  const bar = container.querySelector<HTMLElement>(".shk-bar_wrap")
  if(!bar) return

  let dragging = false

  const seekByClientX = (clientX: number) => {
    if(!onBeforeClick("seek")) return
    const duration = Number(player.duration || player.audio?.duration || 0)
    if(!Number.isFinite(duration) || duration <= 0) return
    const rect = bar.getBoundingClientRect()
    const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    player.seek(duration * percent)
  }

  const onPointerMove = (e: PointerEvent) => {
    if(!dragging) return
    seekByClientX(e.clientX)
  }

  const onPointerUp = (e: PointerEvent) => {
    if(!dragging) return
    dragging = false
    seekByClientX(e.clientX)
    window.removeEventListener("pointermove", onPointerMove, true)
    window.removeEventListener("pointerup", onPointerUp, true)
  }

  bar.addEventListener("pointerdown", (e: PointerEvent) => {
    if(e.button !== 0) return
    e.preventDefault()
    e.stopImmediatePropagation()
    dragging = true
    seekByClientX(e.clientX)
    window.addEventListener("pointermove", onPointerMove, true)
    window.addEventListener("pointerup", onPointerUp, true)
  }, true)
}

function prevIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 10a4 4 0 0 1 4 4v14L48 10.8a4 4 0 0 1 6 3.5v35.4a4 4 0 0 1-6 3.5L18 36v14a4 4 0 0 1-8 0V14a4 4 0 0 1 4-4z"/></svg>`
}

function nextIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M50 10a4 4 0 0 0-4 4v14L16 10.8a4 4 0 0 0-6 3.5v35.4a4 4 0 0 0 6 3.5L46 36v14a4 4 0 0 0 8 0V14a4 4 0 0 0-4-4z"/></svg>`
}
