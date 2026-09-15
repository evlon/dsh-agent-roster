/**
 * Request authentication: parse and verify the `Authorization: Bearer` token.
 *
 * A read operation accepts any valid read or write token. A write operation on
 * `twinId` requires a valid **write** token whose `twinId` matches, so a twin
 * can only write its own entry.
 *
 * @module @roster/server
 */

import { verifyToken, TokenPayload } from '../../core/src/index.js'

export interface AuthContext {
  /** The verified token payload, if a valid token was supplied. */
  payload?: TokenPayload
}

/** Extract the bearer token from a raw Authorization header value. */
export function extractBearer(header: string | undefined): string | undefined {
  if (!header) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1] : undefined
}

export interface AuthResult {
  ok: boolean
  status: number
  error?: string
  payload?: TokenPayload
}

/** Validate a request against the required token kind. */
export function authenticate(
  serverSecret: string,
  header: string | undefined,
  kind: 'read' | 'write',
): AuthResult {
  // A read operation accepts a `read` or `write` token (write implies read).
  const accepted: ('read' | 'write')[] = kind === 'read' ? ['read', 'write'] : ['write']
  for (const k of accepted) {
    const payload = verifyToken(serverSecret, extractBearer(header), k)
    if (payload) return { ok: true, status: 200, payload }
  }
  return {
    ok: false,
    status: 401,
    error: 'missing or invalid token',
  }
}

/**
 * Enforce a write on `targetTwinId`. Requires a valid write token whose twinId
 * equals `targetTwinId`. `*` is a wildcard write token (admin/seed), allowed for
 * bootstrap.
 */
export function authorizeWrite(
  serverSecret: string,
  header: string | undefined,
  targetTwinId: string,
): AuthResult {
  const base = authenticate(serverSecret, header, 'write')
  if (!base.ok) return base
  const p = base.payload!
  if (p.twinId !== targetTwinId && p.twinId !== '*') {
    return {
      ok: false,
      status: 403,
      error: `token is not authorized to write twin '${targetTwinId}'`,
    }
  }
  return { ok: true, status: 200, payload: p }
}
