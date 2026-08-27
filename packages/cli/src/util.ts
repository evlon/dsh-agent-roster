/**
 * Small pure helpers for the CLI, extracted for unit testing.
 *
 * @module @roster/cli
 */

/** Extract the twinId embedded in a `roster.*` token (not cryptographically verified here). */
export function twinIdFromToken(token: string | undefined): string | undefined {
  if (!token || !token.startsWith('roster.')) return undefined
  const rest = token.slice('roster.'.length)
  const first = rest.indexOf('.')
  if (first <= 0) return undefined
  return rest.slice(0, first)
}

/** Parse a numeric CLI value, returning undefined when absent or invalid. */
export function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '' || v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
