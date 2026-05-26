import { roomRepo } from "./db"
import { getPlaylistImportData, resolveQueueItemContent, toPlayableQueueItem } from "./music/musicAdapter"
import type { ContentData, PlaylistImportProgress, QueueItem, ResToFe, Room, RoomQueue } from "./types"

const IMPORT_DELAY_MIN_MS = 800
const IMPORT_DELAY_MAX_MS = 1500

interface PlaylistImportJob {
  roomId: string
  link: string
  total: number
  successCount: number
  failedCount: number
  addedCount: number
  running: boolean
  importedIds: Set<string>
}

type RoomBroadcaster = (roomId: string, data: ResToFe) => void

const activeJobs = new Map<string, PlaylistImportJob>()
let broadcastToRoom: RoomBroadcaster = () => {}

export function setPlaylistImportBroadcaster(fn: RoomBroadcaster): void {
  broadcastToRoom = fn
}

export async function importPlaylistByLink(roomId: string, link: string): Promise<PlaylistImportProgress> {
  const existing = activeJobs.get(roomId)
  if (existing?.running) return toProgress(existing, "progress", "歌单正在导入中")

  const res = await getPlaylistImportData(link)
  if (!res || res.code !== "0000" || !res.data?.items.length) {
    return {
      status: "failed",
      roomId,
      link,
      total: 0,
      successCount: 0,
      failedCount: 0,
      addedCount: 0,
      message: res?.showMsg || "歌单解析失败，请更换链接或稍后再试。"
    }
  }

  return startPlaylistImport({
    roomId,
    link: res.data.link,
    items: res.data.items
  })
}

export function startPlaylistImport(input: {
  roomId: string
  link: string
  items: QueueItem[]
  importedItemIds?: string[]
}): PlaylistImportProgress {
  const existing = activeJobs.get(input.roomId)
  if (existing?.running) return toProgress(existing, "progress", "歌单正在导入中")

  const importedIds = new Set(input.importedItemIds || [])
  const job: PlaylistImportJob = {
    roomId: input.roomId,
    link: input.link,
    total: input.items.length,
    successCount: importedIds.size,
    failedCount: 0,
    addedCount: 0,
    running: true,
    importedIds
  }

  activeJobs.set(input.roomId, job)
  broadcastProgress(
    job,
    "started",
    job.successCount > 0 ? `已加入 ${job.successCount} 首，剩余歌曲后台加载中` : "正在导入歌单"
  )
  void runPlaylistImport(job, input.items)
  return toProgress(job, "started", "歌单已开始导入")
}

async function runPlaylistImport(job: PlaylistImportJob, items: QueueItem[]): Promise<void> {
  try {
    for (const item of items) {
      if (!job.running) break
      if (job.importedIds.has(item.id)) continue

      const room = roomRepo.get(job.roomId)
      if (!room || room.oState !== "OK") break
      if (roomHasQueueItem(room, item)) {
        job.importedIds.add(item.id)
        job.successCount += 1
        continue
      }

      await sleep(randomDelay())
      try {
        const content = await resolveQueueItemContent(item)
        if (!content?.audioUrl) {
          job.failedCount += 1
          continue
        }

        const playable = toPlayableQueueItem(item, content)
        const appended = appendQueueItem(job.roomId, playable)
        if (appended) {
          job.importedIds.add(item.id)
          job.successCount += 1
          job.addedCount += 1
          const latest = roomRepo.get(job.roomId)
          if (latest?.queue) broadcastQueue(job.roomId, latest)
          broadcastProgress(job, "progress", `已加入 ${job.successCount} 首，剩余歌曲后台加载中`)
        }
      } catch {
        job.failedCount += 1
      }
    }

    broadcastProgress(job, "completed", `导入完成：成功 ${job.successCount} 首，失败 ${job.failedCount} 首`)
  } finally {
    job.running = false
    activeJobs.delete(job.roomId)
  }
}

function appendQueueItem(roomId: string, item: QueueItem): boolean {
  const room = roomRepo.get(roomId)
  if (!room || room.oState !== "OK") return false

  const baseQueue: RoomQueue = room.queue
    ? room.queue
    : { items: [contentToQueueItem(room.content)], currentIndex: 0, playMode: "sequence" }

  if (baseQueue.items.some(existing => sameQueueItem(existing, item))) return false

  const queue: RoomQueue = {
    ...baseQueue,
    items: [...baseQueue.items, item]
  }

  roomRepo.update(roomId, { queue, operateStamp: Date.now() })
  return true
}

function broadcastQueue(roomId: string, room: Room): void {
  broadcastToRoom(roomId, {
    responseType: "NEW_STATUS",
    roomStatus: {
      roomId,
      content: room.content,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      contentStamp: room.contentStamp,
      operateStamp: room.operateStamp,
      operator: room.operator,
      queue: room.queue,
      currentIndex: room.queue?.currentIndex,
      playMode: room.queue?.playMode
    }
  })
}

function broadcastProgress(job: PlaylistImportJob, status: PlaylistImportProgress["status"], message: string): void {
  broadcastToRoom(job.roomId, {
    responseType: "PLAYLIST_IMPORT_PROGRESS",
    playlistImportProgress: toProgress(job, status, message)
  })
}

function toProgress(job: PlaylistImportJob, status: PlaylistImportProgress["status"], message: string): PlaylistImportProgress {
  return {
    status,
    roomId: job.roomId,
    link: job.link,
    total: job.total,
    successCount: job.successCount,
    failedCount: job.failedCount,
    addedCount: job.addedCount,
    message
  }
}

function contentToQueueItem(content: ContentData): QueueItem {
  return {
    id: `${content.sourceType || "current"}:${content.linkUrl || content.audioUrl}`,
    sourceType: content.sourceType || "audio",
    title: content.title || content.seriesName || "当前音频",
    artist: content.seriesName || "",
    imageUrl: content.imageUrl || "",
    linkUrl: content.linkUrl || "",
    audioUrl: content.audioUrl
  }
}

function sameQueueItem(a: QueueItem, b: QueueItem): boolean {
  if (a.id && b.id && a.id === b.id) return true
  if (a.sourceType && b.sourceType && a.resourceId && b.resourceId) {
    return a.sourceType === b.sourceType && a.resourceId === b.resourceId
  }
  return Boolean(a.audioUrl && b.audioUrl && a.audioUrl === b.audioUrl)
}

function roomHasQueueItem(room: Room, item: QueueItem): boolean {
  return Boolean(room.queue?.items.some(existing => sameQueueItem(existing, item)))
}

function randomDelay(): number {
  return IMPORT_DELAY_MIN_MS + Math.floor(Math.random() * (IMPORT_DELAY_MAX_MS - IMPORT_DELAY_MIN_MS + 1))
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
