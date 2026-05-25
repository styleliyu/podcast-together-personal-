import fs from "fs"
import path from "path"
import crypto from "crypto"
import type { NextFunction, Request, Response } from "express"
import multer from "multer"
import type { ContentData, QueueItem, RequestRes, RoomQueue } from "./types"

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), "data", "uploads"))
const allowedExts = new Set([".mp3", ".m4a", ".aac"])

fs.mkdirSync(uploadRoot, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`)
  }
})

export const uploadMiddleware = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!allowedExts.has(ext)) {
      cb(new Error("unsupported audio type"))
      return
    }
    cb(null, true)
  }
}).array("files")

export function handleUploadAudio(req: Request, res: Response): void {
  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : []
  if (!files.length) {
    res.json({ code: "E4000", showMsg: "请选择 mp3、m4a 或 aac 音频文件。" } satisfies RequestRes)
    return
  }

  const origin = getPublicOrigin(req)
  const items: QueueItem[] = files.map(file => {
    const title = path.basename(file.originalname, path.extname(file.originalname))
    const url = `${origin}/uploads/${encodeURIComponent(file.filename)}`
    return {
      id: `local:${file.filename}`,
      sourceType: "local_upload",
      title,
      artist: "本地歌曲",
      linkUrl: url,
      audioUrl: url
    }
  })

  const queue: RoomQueue = {
    items,
    currentIndex: 0,
    playMode: "sequence"
  }
  const first = items[0]
  const data: ContentData = {
    infoType: "podcast",
    audioUrl: first.audioUrl || "",
    sourceType: "local_upload",
    title: first.title,
    linkUrl: first.linkUrl,
    seriesName: "本地歌曲",
    queue
  }

  res.json({ code: "0000", data } satisfies RequestRes<ContentData>)
}

export function handleUploadError(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error("upload audio failed", err instanceof Error ? err.message : err)
  res.status(400).json({ code: "E4000", showMsg: "音频上传失败，请确认文件格式为 mp3、m4a 或 aac。" } satisfies RequestRes)
}

export function getUploadRoot(): string {
  return uploadRoot
}

function getPublicOrigin(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0]
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0]
  return `${proto}://${host}`
}
