import { roomRepo } from "./db"
import type { Room } from "./types"

export function startRoomClock(intervalMs: number): NodeJS.Timeout {
  const run = async () => {
    try {
      await handleRoomClock()
    } catch (err) {
      console.error("room clock failed", err)
    }
  }

  void run()
  return setInterval(run, intervalMs)
}

async function handleRoomClock(): Promise<void> {
  const rooms = roomRepo.findPlayingRooms()
  if (rooms.length < 1) return

  const now = Date.now()
  for (const room of rooms) {
    let participants = room.participants || []

    if (participants.length < 1) {
      roomRepo.update(room._id, { playStatus: "PAUSED" })
      continue
    }

    const oldLen = participants.length
    let lastHeartbeat = 1
    const sec50Ago = now - 50 * 1000
    participants = participants.filter(person => {
      if (person.heartbeatStamp > lastHeartbeat) lastHeartbeat = person.heartbeatStamp
      return person.heartbeatStamp > sec50Ago
    })

    if (participants.length === oldLen) continue

    const patch: Partial<Room> = { participants }
    if (participants.length === 0) {
      let speedRateNum = Number(room.speedRate)
      if (Number.isNaN(speedRateNum) || speedRateNum >= 1.71) speedRateNum = 1
      const diffMilli = lastHeartbeat - room.operateStamp
      patch.playStatus = "PAUSED"
      patch.contentStamp = room.contentStamp + diffMilli * speedRateNum
      patch.operateStamp = now
      patch.operator = ""
    }

    roomRepo.update(room._id, patch)
  }
}
