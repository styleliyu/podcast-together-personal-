type LogMeta = Record<string, unknown>

function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return ""
  try {
    return ` ${JSON.stringify(meta)}`
  } catch {
    return " [unserializable meta]"
  }
}

function write(level: "info" | "warn" | "error", message: string, meta?: LogMeta): void {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${formatMeta(meta)}`
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    write("info", message, meta)
  },
  warn(message: string, meta?: LogMeta): void {
    write("warn", message, meta)
  },
  error(message: string, meta?: LogMeta): void {
    write("error", message, meta)
  }
}
