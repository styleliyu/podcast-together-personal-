import WebSocket from "ws"
import type { PtWebSocket, ResToFe } from "../types"

class WebSocketBroadcaster {
  private readonly sockets = new Set<PtWebSocket>()

  add(socket: PtWebSocket): void {
    this.sockets.add(socket)
  }

  remove(socket: PtWebSocket): void {
    this.sockets.delete(socket)
  }

  send(socket: PtWebSocket, data: ResToFe): void {
    if (socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(data))
  }

  broadcastToRoom = (roomId: string, data: ResToFe): void => {
    for (const socket of this.sockets) {
      if (socket.roomId === roomId) this.send(socket, data)
    }
  }
}

export const broadcaster = new WebSocketBroadcaster()
