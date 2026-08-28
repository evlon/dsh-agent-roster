#!/usr/bin/env node
/**
 * `dsh-roster-server` CLI entry.
 *
 * Commands:
 *   dsh-roster-server serve [--port N] [--host H] [--db PATH]
 *   dsh-roster-server add-twin <twinId> [--write|--read] [--secret S]
 *   dsh-roster-server tokens [--db PATH] [--secret S]
 *   dsh-roster-server hash-token <token>
 *
 * The server secret is resolved from `ROSTER_SECRET`, then from the sqlite
 * settings table (auto-persisted on first run). For `add-twin`/`tokens`
 * without a db, pass `--secret` explicitly.
 *
 * @module @roster/server
 */

import { createToken, hashToken, randomSecret, isValidTwinId } from '../../core/src/index.js'
import { RosterDb } from './db.js'
import { startServer } from './index.js'

function usage(): never {
  process.stderr.write(
    [
      'dsh-roster-server <command>',
      '',
      '  serve [--port N] [--host H] [--db PATH]     start the HTTP server',
      '  add-twin <twinId> [--write|--read] [--secret S]  issue a token for a twin',
      '  tokens [--db PATH] [--secret S]             list issued tokens (hashes)',
      '  hash-token <token>                          print the hash of a token',
      '',
      'Environment:',
      '  ROSTER_SECRET      server secret (auto-persisted if absent)',
      '  ROSTER_DB          database path (default ./roster.db)',
      '  ROSTER_PORT        server port (default 8765)',
      '  ROSTER_HOST        server host (default 0.0.0.0)',
      '  ROSTER_UI_PUBLIC   enable public read-only WEB UI (default true; set "false" to disable)',
      '',
    ].join('\n'),
  )
  process.exit(2)
}

function parseFlags(args: string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        flags.set(key, next)
        i++
      } else {
        flags.set(key, 'true')
      }
    }
  }
  return flags
}

function resolveSecret(flags: Map<string, string>, db?: RosterDb): string {
  const fromEnv = process.env.ROSTER_SECRET
  if (fromEnv) return fromEnv
  const fromFlag = flags.get('secret')
  if (fromFlag && fromFlag !== 'true') return fromFlag
  if (db) {
    const persisted = db.getSetting('server_secret')
    if (persisted) return persisted
    const generated = randomSecret(32)
    db.setSetting('server_secret', generated)
    process.stderr.write('[dsh-roster-server] generated a new server secret and persisted it to the db\n')
    return generated
  }
  process.stderr.write('[dsh-roster-server] no server secret found; pass --secret or set ROSTER_SECRET\n')
  process.exit(1)
  return '' // unreachable
}

async function cmdServe(flags: Map<string, string>): Promise<void> {
  const dbPath = flags.get('db') ?? process.env.ROSTER_DB ?? './roster.db'
  const port = Number(flags.get('port') ?? process.env.ROSTER_PORT ?? 8765)
  const host = flags.get('host') ?? process.env.ROSTER_HOST ?? '0.0.0.0'
  const db = new RosterDb(dbPath)
  const serverSecret = resolveSecret(flags, db)
  db.close()
  const uiEnv = process.env.ROSTER_UI_PUBLIC
  const uiPublic = flags.get('ui') === 'false' ? false : flags.get('no-ui') === 'true' ? false : uiEnv === 'false' ? false : true
  const { url } = await startServer({
    host,
    port,
    dbPath,
    serverSecret,
    uiPublic,
  })
  process.stderr.write(`[dsh-roster-server] server listening at ${url} (db: ${dbPath})\n`)
  process.stderr.write(`[dsh-roster-server] public UI: ${uiPublic ? 'enabled (http://<host>:<port>/)' : 'disabled'}\n`)
}

function cmdAddTwin(flags: Map<string, string>, twinId: string): void {
  if (!isValidTwinId(twinId)) {
    process.stderr.write(`invalid twinId: '${twinId}'\n`)
    process.exit(3)
  }
  const kind = flags.get('read') === 'true' ? 'read' : 'write'
  const dbPath = flags.get('db') ?? process.env.ROSTER_DB ?? './roster.db'
  const useDb = !(flags.get('no-db') === 'true')
  let serverSecret: string
  let db: RosterDb | undefined
  if (useDb) {
    db = new RosterDb(dbPath)
    serverSecret = resolveSecret(flags, db)
  } else {
    serverSecret = resolveSecret(flags, undefined)
  }
  const token = createToken(serverSecret, twinId, kind)
  if (db) {
    db.upsertToken(twinId, kind, hashToken(token))
    db.close()
  }
  // Only print the token once; it is the secret the twin must hold.
  process.stdout.write(JSON.stringify({ twinId, kind, token, note: 'store this token in the twin\'s ROSTER_TOKEN' }, null, 2) + '\n')
}

function cmdTokens(flags: Map<string, string>): void {
  const dbPath = flags.get('db') ?? process.env.ROSTER_DB ?? './roster.db'
  const db = new RosterDb(dbPath)
  const serverSecret = resolveSecret(flags, db)
  const rows = db.listTokens().map((r) => ({ twinId: r.twinId, kind: r.kind }))
  db.close()
  void serverSecret
  process.stdout.write(JSON.stringify({ tokens: rows }, null, 2) + '\n')
}

function cmdHashToken(token: string): void {
  process.stdout.write(hashToken(token) + '\n')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const cmd = args[0]
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') usage()
  const rest = args.slice(1)
  const flags = parseFlags(rest)
  if (cmd === 'serve') {
    await cmdServe(flags)
    return
  }
  if (cmd === 'add-twin') {
    const twinId = rest.find((a) => !a.startsWith('--'))
    if (!twinId) usage()
    cmdAddTwin(flags, twinId)
    return
  }
  if (cmd === 'tokens') {
    cmdTokens(flags)
    return
  }
  if (cmd === 'hash-token') {
    const token = rest.find((a) => !a.startsWith('--'))
    if (!token) usage()
    cmdHashToken(token)
    return
  }
  usage()
}

main().catch((err) => {
  process.stderr.write(`[dsh-roster-server] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
