/**
 * Roster server composition: wire the store + sqlite backend + HTTP handler.
 *
 * @module @roster/server
 */

import { createServer, Server } from 'node:http'
import { RosterStore } from '../../core/src/index.js'
import { RosterDb } from './db.js'
import { createHandler } from './routes.js'

export * from './db.js'
export * from './routes.js'
export * from './auth.js'

export interface ServerOptions {
  host?: string
  port?: number
  dbPath?: string
  serverSecret: string
}

export interface StartedServer {
  server: Server
  db: RosterDb
  store: RosterStore
  url: string
  close: () => Promise<void>
}

/** Build the store backed by sqlite. */
export async function buildStore(dbPath: string): Promise<{ db: RosterDb; store: RosterStore }> {
  const db = new RosterDb(dbPath)
  const store = new RosterStore({
    load: () => db.loadEntries(),
    save: (map) => db.saveEntries(map),
  })
  await store.init()
  return { db, store }
}

/** Create and start the HTTP server. Returns handles for tests/lifecycle. */
export async function startServer(opts: ServerOptions): Promise<StartedServer> {
  const { db, store } = await buildStore(opts.dbPath ?? './roster.db')
  const handler = createHandler({ store, serverSecret: opts.serverSecret })
  const server = createServer(handler)
  const host = opts.host ?? '0.0.0.0'
  const port = opts.port ?? 8765
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })
  const addr = server.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : port
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`
  return {
    server,
    db,
    store,
    url,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      db.close()
    },
  }
}
