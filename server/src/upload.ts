import fs from "fs"
import path from "path"
import crypto from "crypto"
import type { NextFunction, Request, Response } from "express"
import multer from "multer"
import type {
  ContentData,
  LocalImportFailure,
  LocalUploadMetadata,
  QueueItem,
  RequestRes,
  RoomQueue,
  UploadAudioData
} from "./types"

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.resolve(process.cwd(), "data", "uploads"))
const allowedExts = new Set(["mp3", "m4a", "aac", "flac", "wav", "ogg", "wma", "dff"])

fs.mkdirSync(uploadRoot, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`)
  }
})

export const uploadMiddleware = multer({
  storage
}).array("files")

export function handleUploadAudio(req: Request, res: Response): void {
  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : []
  const metadata = parseUploadMetadata(req.body?.metadata)
  const failures: LocalImportFailure[] = []

  if (!files.length) {
    res.json({
      code: "E4000",
      showMsg: "请选择支持的本地音频文件。"
    } satisfies RequestRes)
    return
  }

  const origin = getPublicOrigin(req)
  const items: QueueItem[] = []

  files.forEach((file, index) => {
    const meta = metadata[index]
    const originalName = meta?.originalName || file.originalname || file.filename
    try {
      const detectedExt = sniffUploadedAudioExt(file.path)
      if (!detectedExt) {
        cleanupFile(file.path)
        failures.push({
          filename: originalName,
          reason: "上传后的文件内容不是可识别的音频。"
        })
        return
      }
      if (!allowedExts.has(detectedExt)) {
        cleanupFile(file.path)
        failures.push({
          filename: originalName,
          reason: `暂不支持 ${detectedExt} 格式。`
        })
        return
      }

      const stored = ensureStoredExtension(file.path, file.filename, detectedExt)
      const title = cleanText(meta?.title) || cleanText(path.basename(originalName, path.extname(originalName))) || "本地歌曲"
      const artist = cleanText(meta?.artist) || "本地歌曲"
      const url = `${origin}/uploads/${encodeURIComponent(stored.filename)}`
      items.push({
        id: `local:${stored.filename}`,
        sourceType: "local_upload",
        title,
        artist,
        linkUrl: url,
        audioUrl: url
      })
    }
    catch(err) {
      cleanupFile(file.path)
      failures.push({
        filename: originalName,
        reason: err instanceof Error ? err.message : "文件保存失败。"
      })
    }
  })

  if (!items.length) {
    res.json({
      code: "E4000",
      showMsg: summarizeFailures(failures) || "本地音频导入失败，请确认文件格式后重试。",
      data: {
        importedCount: 0,
        failures
      }
    } as RequestRes<Partial<UploadAudioData>>)
    return
  }

  const queue: RoomQueue = {
    items,
    currentIndex: 0,
    playMode: "sequence"
  }
  const first = items[0]
  const data: UploadAudioData = {
    importedCount: items.length,
    failures,
    content: {
      infoType: "podcast",
      audioUrl: first.audioUrl || "",
      sourceType: "local_upload",
      title: first.title,
      linkUrl: first.linkUrl,
      seriesName: first.artist || "本地歌曲",
      queue
    }
  }

  res.json({
    code: "0000",
    showMsg: failures.length ? summarizeFailures(failures) : undefined,
    data
  } satisfies RequestRes<UploadAudioData>)
}

export function handleUploadError(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error("upload audio failed", err instanceof Error ? err.message : err)
  res.status(400).json({
    code: "E4000",
    showMsg: "音频上传失败，请确认文件可读取后重试。"
  } satisfies RequestRes)
}

export function getUploadRoot(): string {
  return uploadRoot
}

function parseUploadMetadata(value: unknown): LocalUploadMetadata[] {
  if (typeof value !== "string" || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isUploadMetadata)
  }
  catch {
    return []
  }
}

function isUploadMetadata(value: unknown): value is LocalUploadMetadata {
  if (!value || typeof value !== "object") return false
  const meta = value as Record<string, unknown>
  return typeof meta.filename === "string" && typeof meta.originalName === "string"
}

function sniffUploadedAudioExt(filePath: string): string {
  const fd = fs.openSync(filePath, "r")
  try {
    const buf = Buffer.alloc(64)
    const size = fs.readSync(fd, buf, 0, buf.length, 0)
    const data = buf.subarray(0, size)
    if (hasPrefix(data, [0x49, 0x44, 0x33])) return "mp3"
    if (hasPrefix(data, [0x66, 0x4c, 0x61, 0x43])) return "flac"
    if (hasPrefix(data, [0x4f, 0x67, 0x67, 0x53])) return "ogg"
    if (data.length >= 12 && hasPrefix(data, [0x52, 0x49, 0x46, 0x46]) && hasPrefix(data.subarray(8), [0x57, 0x41, 0x56, 0x45])) return "wav"
    if (data.length >= 12 && hasPrefix(data.subarray(4), [0x66, 0x74, 0x79, 0x70])) return "m4a"
    if (hasPrefix(data, [0xff, 0xf1]) || hasPrefix(data, [0xff, 0xf9])) return "aac"
    if (isMp3Frame(data)) return "mp3"
    if (hasPrefix(data, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c])) return "wma"
    if (hasPrefix(data, [0x46, 0x52, 0x4d, 0x38])) return "dff"
    return ""
  }
  finally {
    fs.closeSync(fd)
  }
}

function ensureStoredExtension(filePath: string, filename: string, ext: string): { path: string; filename: string } {
  const currentExt = path.extname(filename).replace(/^\./, "").toLowerCase()
  if (currentExt === ext) return { path: filePath, filename }

  const nextFilename = `${path.basename(filename, path.extname(filename))}.${ext}`
  const nextPath = path.join(path.dirname(filePath), nextFilename)
  fs.renameSync(filePath, nextPath)
  return { path: nextPath, filename: nextFilename }
}

function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
  catch {
    // Best effort cleanup; the import response should still explain the user-facing failure.
  }
}

function hasPrefix(data: Buffer, prefix: number[]): boolean {
  if (prefix.length > data.length) return false
  return prefix.every((value, index) => data[index] === value)
}

function isMp3Frame(data: Buffer): boolean {
  return data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  if (!trimmed) return ""
  const repaired = repairMojibake(trimmed).replace(/\s+/g, " ").trim()
  if (!repaired || looksLikeMojibake(repaired)) return ""
  return repaired
}

function repairMojibake(value: string): string {
  if (!looksLikeMojibake(value)) return value
  const utf8 = decodeBinaryString(value, "utf-8")
  if (utf8 && !looksLikeMojibake(utf8)) return utf8
  const gb18030 = decodeBinaryString(value, "gb18030")
  if (gb18030 && !looksLikeMojibake(gb18030)) return gb18030
  return value
}

function looksLikeMojibake(value: string): boolean {
  if (/[�锟]/.test(value)) return true
  if (/[\u0080-\u009f]/.test(value) && /[\u00c0-\u00ff]/.test(value)) return true
  if (/[ÃãÂâ][\u0080-\u00bf\u00c0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u2018-\u201d\u201a-\u201e\u2020-\u2022\u2030\u2039-\u203a]/.test(value)) return true
  return /[äåæçèéêëìíîï][\u0080-\u00bf\u00a0-\u00bf\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u2018-\u201d\u201a-\u201e\u2020-\u2022\u2030\u2039-\u203a]/.test(value)
}

function decodeBinaryString(value: string, encoding: string): string {
  try {
    const bytes = Uint8Array.from(Array.from(value, windows1252Byte))
    return new TextDecoder(encoding, { fatal: true }).decode(bytes)
  }
  catch {
    return ""
  }
}

function windows1252Byte(char: string): number {
  const code = char.charCodeAt(0)
  if (code <= 0xff) return code
  return windows1252SpecialBytes[code] ?? 0x3f
}

const windows1252SpecialBytes: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}

function summarizeFailures(failures: LocalImportFailure[]): string {
  if (!failures.length) return ""
  const visible = failures.slice(0, 3).map(item => `${item.filename}：${item.reason}`).join("\n")
  const hidden = failures.length > 3 ? `\n还有 ${failures.length - 3} 个文件未导入。` : ""
  return `${visible}${hidden}`
}

function getPublicOrigin(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0]
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0]
  return `${proto}://${host}`
}
