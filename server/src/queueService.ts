import type { ContentData, PlayMode, QueueItem, Room, RoomConfig, RoomQueue, RoomStatus } from "./types"

// Queue service owns queue shape and navigation rules. Future currentItemId,
// drag sort, delete, skip, and play-next logic should be normalized here.
export function canOperateQueue(room: Room, clientId: string, defaultRoomCfg: RoomConfig): boolean {
  const roomCfg = room.config || defaultRoomCfg
  const isOwner = room.owner === clientId
  return isOwner || roomCfg.everyoneCanOperatePlayer !== "N"
}

export function getNextQueueIndex(queue: RoomQueue, direction: "next" | "prev" | "auto"): number {
  if (queue.items.length < 1) return -1
  if (queue.playMode === "single" && direction === "auto") return queue.currentIndex
  if (queue.playMode === "shuffle" && direction !== "prev") {
    if (queue.items.length === 1) return queue.currentIndex
    let next = queue.currentIndex
    for (let i = 0; i < 8 && next === queue.currentIndex; i++) next = Math.floor(Math.random() * queue.items.length)
    return next === queue.currentIndex ? (queue.currentIndex + 1) % queue.items.length : next
  }
  if (direction === "prev") return queue.currentIndex > 0 ? queue.currentIndex - 1 : 0
  const next = queue.currentIndex + 1
  if (next >= queue.items.length) return direction === "auto" ? -1 : queue.currentIndex
  return next
}

export function sanitizeQueueItems(items: QueueItem[] | undefined): QueueItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter(item => item && item.title && (item.audioUrl || item.resourceId))
    .map((item, index) => ({
      id: item.id || `${item.sourceType || "audio"}:${item.resourceId || item.audioUrl || Date.now()}:${index}`,
      sourceType: item.sourceType || "audio",
      title: item.title,
      artist: item.artist || "",
      imageUrl: item.imageUrl || "",
      linkUrl: item.linkUrl || "",
      resourceId: item.resourceId || "",
      audioUrl: item.audioUrl || ""
    }))
}

export function contentToQueueItem(content: ContentData): QueueItem {
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

export function buildQueueRoomStatus(
  roomId: string,
  room: Room,
  queue: RoomQueue,
  operator: string
): RoomStatus {
  return {
    roomId,
    content: room.content,
    playStatus: room.playStatus,
    speedRate: room.speedRate,
    contentStamp: room.contentStamp,
    operateStamp: room.operateStamp,
    operator,
    queue,
    currentIndex: queue.currentIndex,
    playMode: queue.playMode
  }
}

export function isPlayMode(value: string): value is PlayMode {
  return ["sequence", "shuffle", "single"].includes(value)
}
