import type { RequestRes } from "../types"

export function ok<T>(data?: T): RequestRes<T> {
  return data === undefined ? { code: "0000" } : { code: "0000", data }
}

export function fail<T = Record<string, unknown>>(code: string, showMsg?: string, errMsg?: string): RequestRes<T> {
  return {
    code,
    ...(showMsg ? { showMsg } : {}),
    ...(errMsg ? { errMsg } : {})
  }
}

export function notFound<T = Record<string, unknown>>(): RequestRes<T> {
  return fail("E4044")
}

export function badRequest<T = Record<string, unknown>>(showMsg?: string): RequestRes<T> {
  return fail("E4000", showMsg)
}
