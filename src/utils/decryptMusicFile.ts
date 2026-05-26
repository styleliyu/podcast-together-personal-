import { Buffer } from "buffer"
import type { DecryptResult, FileInfo } from "@decrypt-core/decrypt/entity"

type DecryptModule = typeof import("@decrypt-core/decrypt")

const plainAudioExtensions = new Set(["mp3", "m4a", "aac", "flac", "wav", "ogg", "wma", "dff"])

const encryptedAudioExtensions = new Set([
  "mg3d",
  "ncm",
  "uc",
  "kwm",
  "xm",
  "tm0",
  "tm2",
  "tm3",
  "tm6",
  "qmc0",
  "qmc2",
  "qmc3",
  "qmc4",
  "qmc6",
  "qmc8",
  "qmcflac",
  "qmcogg",
  "tkm",
  "bkcmp3",
  "bkcm4a",
  "bkcflac",
  "bkcwav",
  "bkcape",
  "bkcogg",
  "bkcwma",
  "mggl",
  "mflac",
  "mflac0",
  "mflach",
  "mgg",
  "mgg0",
  "mgg1",
  "mmp4",
  "666c6163",
  "6d7033",
  "6f6767",
  "6d3461",
  "776176",
  "cache",
  "vpr",
  "kgm",
  "kgma",
  "ofl_en",
  "x2m",
  "x3m",
])

const outputMimeByExt: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  wma: "audio/x-ms-wma",
  dff: "audio/x-dff",
}

export const LOCAL_MUSIC_ACCEPT = [
  ...Array.from(plainAudioExtensions, ext => `.${ext}`),
  ...Array.from(encryptedAudioExtensions, ext => `.${ext}`),
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "audio/wav",
  "audio/ogg",
].join(",")

export interface DecryptedMusicFile {
  title: string
  artist?: string
  album?: string
  ext: string
  mime: string
  blob: Blob
  objectUrl: string
  pictureUrl?: string
  rawFilename?: string
  rawExt?: string
  file: File
}

export interface PreparedLocalMusicFiles {
  files: File[]
  decrypted: DecryptedMusicFile[]
}

let decryptModulePromise: Promise<DecryptModule> | null = null

export function isSupportedLocalMusicFile(file: File): boolean {
  const ext = getFileExtension(file.name)
  return plainAudioExtensions.has(ext) || encryptedAudioExtensions.has(ext)
}

export function isEncryptedMusicFile(file: File): boolean {
  return encryptedAudioExtensions.has(getFileExtension(file.name))
}

export async function decryptMusicFile(file: File): Promise<DecryptedMusicFile> {
  const { Decrypt } = await loadDecryptModule()
  const result = await Decrypt(createFileInfo(file), {})
  return toDecryptedMusicFile(file, result)
}

export async function prepareLocalMusicFilesForUpload(files: File[]): Promise<PreparedLocalMusicFiles> {
  const preparedFiles: File[] = []
  const decrypted: DecryptedMusicFile[] = []

  for (const file of files) {
    if (!isSupportedLocalMusicFile(file)) {
      throw new Error(`不支持的本地文件格式：${file.name}`)
    }

    if (!isEncryptedMusicFile(file)) {
      preparedFiles.push(file)
      continue
    }

    const decryptedFile = await decryptMusicFile(file)
    decrypted.push(decryptedFile)
    preparedFiles.push(decryptedFile.file)
  }

  return {
    files: preparedFiles,
    decrypted,
  }
}

export function releaseDecryptedMusicFile(result: DecryptedMusicFile): void {
  if (result.objectUrl) URL.revokeObjectURL(result.objectUrl)
  if (result.pictureUrl?.startsWith("blob:")) URL.revokeObjectURL(result.pictureUrl)
}

function loadDecryptModule(): Promise<DecryptModule> {
  ensureBuffer()
  if (!decryptModulePromise) {
    decryptModulePromise = import("@decrypt-core/decrypt")
  }
  return decryptModulePromise
}

function ensureBuffer(): void {
  const scope = globalThis as typeof globalThis & { Buffer?: typeof Buffer }
  if (!scope.Buffer) scope.Buffer = Buffer
}

function createFileInfo(file: File): FileInfo {
  return {
    status: "ready",
    name: file.name,
    size: file.size,
    percentage: 0,
    uid: Date.now() + Math.floor(Math.random() * 100000),
    raw: file,
  }
}

function toDecryptedMusicFile(sourceFile: File, result: DecryptResult): DecryptedMusicFile {
  const rawName = result.rawFilename || removeExtension(sourceFile.name)
  const ext = normalizeExtension(result.ext || result.rawExt || "mp3")
  const mime = result.mime || outputMimeByExt[ext] || "application/octet-stream"
  const title = result.title || rawName
  const filename = `${sanitizeFilename(title || rawName)}.${ext}`
  const file = new File([result.blob], filename, {
    type: mime,
    lastModified: Date.now(),
  })

  return {
    title,
    artist: result.artist,
    album: result.album,
    ext,
    mime,
    blob: result.blob,
    objectUrl: result.file,
    pictureUrl: result.picture,
    rawFilename: result.rawFilename,
    rawExt: result.rawExt,
    file,
  }
}

function getFileExtension(filename: string): string {
  const pos = filename.lastIndexOf(".")
  if (pos < 0) return ""
  return normalizeExtension(filename.slice(pos + 1))
}

function normalizeExtension(ext: string): string {
  return ext.trim().replace(/^\./, "").toLowerCase()
}

function removeExtension(filename: string): string {
  const pos = filename.lastIndexOf(".")
  return pos > 0 ? filename.slice(0, pos) : filename
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]+/g, "_").trim() || "local-audio"
}
