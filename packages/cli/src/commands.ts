/**
 * Roster CLI commands. Each command resolves config from flags/env, calls the
 * server, and prints a JSON result to stdout. Errors go to stderr with a
 * distinct exit code.
 *
 * @module @roster/cli
 */

import { api, CliError, resolveBaseUrl, resolveToken } from './client.js'

export { CliError }

export interface CliEnv {
  baseUrl: string
  token?: string
}

function getEnv(flagUrl?: string, flagToken?: string): CliEnv {
  const baseUrl = resolveBaseUrl(flagUrl)
  if (!baseUrl) throw new CliError('missing roster server URL (set ROSTER_URL or pass --url)', 3)
  return { baseUrl, token: resolveToken(flagToken) }
}

/** Generic GET returning the JSON body. */
export async function get(path: string, flagUrl?: string, flagToken?: string): Promise<Record<string, unknown>> {
  const env = getEnv(flagUrl, flagToken)
  const res = await api(env.baseUrl, env.token, 'GET', path)
  return res.data
}

/** Generic POST returning the JSON body. */
export async function post(
  path: string,
  body: unknown,
  flagUrl?: string,
  flagToken?: string,
): Promise<Record<string, unknown>> {
  const env = getEnv(flagUrl, flagToken)
  const res = await api(env.baseUrl, env.token, 'POST', path, body)
  return res.data
}

/** Generic PUT returning the JSON body. */
export async function put(
  path: string,
  body: unknown,
  flagUrl?: string,
  flagToken?: string,
): Promise<Record<string, unknown>> {
  const env = getEnv(flagUrl, flagToken)
  const res = await api(env.baseUrl, env.token, 'PUT', path, body)
  return res.data
}

/** Generic DELETE returning the JSON body. */
export async function del(
  path: string,
  flagUrl?: string,
  flagToken?: string,
): Promise<Record<string, unknown>> {
  const env = getEnv(flagUrl, flagToken)
  const res = await api(env.baseUrl, env.token, 'DELETE', path)
  return res.data
}
