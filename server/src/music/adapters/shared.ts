export function linkText(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`
}

export function pickParamAnywhere(url: URL, text: string, keys: string[]): string {
  return pickParam(url, keys) || pickParamFromText(text, keys)
}

export function pickParam(url: URL, keys: string[]): string {
  for (const key of keys) {
    const val = url.searchParams.get(key)
    if (val) return val
  }
  return ""
}

export function pickParamFromText(text: string, keys: string[]): string {
  for (const key of keys) {
    const reg = new RegExp(`[?&#]${key}=([^&#/]+)`, "i")
    const match = text.match(reg)
    if (match?.[1]) return decodeURIComponent(match[1])
  }
  return ""
}

export function pickMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ""
}
