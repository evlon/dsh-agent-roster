/**
 * Zero-dependency HTTP client for the roster server.
 *
 * Resolves base URL from `--url`/`ROSTER_URL` and token from
 * `--token`/`ROSTER_TOKEN` in the calling layer; this module only exposes the
 * raw request helper and typed result handling.
 *
 * @module @roster/cli
 */

import { request } from 'node:http'
import { request as requestHttps } from 'node:https'

export type ExitCode = 0 | 1 | 2 | 3

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: ExitCode,
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface ApiResult {
  status: number
  ok: boolean
  data: Record<string, unknown>
}

/** Send a JSON request to the roster server. */
export async function api(
  baseUrl: string,
  token: string | undefined,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  let url: URL
  try {
    url = new URL(path, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/')
  } catch {
    throw new CliError(`invalid ROSTER_URL: '${baseUrl}'`, 2)
  }
  const lib = url.protocol === 'https:' ? requestHttps : request
  const data = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const r = lib(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = ''
        res.on('data', (c) => (buf += c))
        res.on('end', () => {
          let parsed: Record<string, unknown> = {}
          try {
            parsed = buf ? JSON.parse(buf) : {}
          } catch {
            parsed = { raw: buf }
          }
          const status = res.statusCode ?? 0
          const ok = status >= 200 && status < 300
          if (!ok) {
            const msg = (parsed.error as string) || `HTTP ${status}`
            reject(
              new CliError(
                `server error (${status}): ${msg}`,
                status === 401 || status === 403 ? 1 : 2,
                status,
              ),
            )
            return
          }
          resolve({ status, ok, data: parsed })
        })
      },
    )
    r.on('error', (err) => {
      reject(new CliError(`cannot reach roster server at ${url.origin}: ${err.message}`, 2))
    })
    if (data) r.write(data)
    r.end()
  })
}

/** Resolve the base URL from flag/env. */
export function resolveBaseUrl(flag?: string): string {
  return flag ?? process.env.ROSTER_URL ?? ''
}

/** Resolve the token from flag/env. */
export function resolveToken(flag?: string): string | undefined {
  return flag ?? process.env.ROSTER_TOKEN
}
