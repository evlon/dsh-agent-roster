/**
 * SQLite persistence for the roster using Node's built-in `node:sqlite`.
 *
 * Two tables:
 *  - `entries(twin_id TEXT PRIMARY KEY, json TEXT)` stores each {@link RosterEntry}.
 *  - `tokens(twin_id TEXT, kind TEXT, token_hash TEXT, PRIMARY KEY(twin_id, kind))`
 *    stores issued write/read token hashes so add-twin can persist tokens across
 *    restarts without keeping plaintext.
 *
 * The database file is chosen by `ROSTER_DB` (default `./roster.db`). Use
 * `:memory:` for tests. Node >= 22 provides `node:sqlite` natively.
 *
 * @module @roster/server
 */

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { RosterEntry, emptyEntry } from '../../core/src/index.js'

export interface TokenRow {
  twinId: string
  kind: 'read' | 'write'
  tokenHash: string
}

/** Thin wrapper over the sqlite DB. */
export class RosterDb {
  private readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') {
      const dir = dirname(path)
      if (dir && dir !== '.') mkdirSync(dir, { recursive: true })
    }
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        twin_id TEXT PRIMARY KEY,
        json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tokens (
        twin_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        PRIMARY KEY (twin_id, kind)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  }

  /** Read a setting value. */
  getSetting(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value
  }

  /** Write a setting value. */
  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, value)
  }

  close(): void {
    this.db.close()
  }

  /** Load all entries into a Map for the store. */
  loadEntries(): Map<string, RosterEntry> {
    const map = new Map<string, RosterEntry>()
    const rows = this.db.prepare('SELECT twin_id, json FROM entries').all() as {
      twin_id: string
      json: string
    }[]
    for (const row of rows) {
      try {
        const entry = JSON.parse(row.json) as RosterEntry
        if (entry && typeof entry.twinId === 'string') map.set(row.twin_id, entry)
      } catch {
        // Skip corrupt rows; do not fail startup.
      }
    }
    return map
  }

  /** Persist the full map (replace-all in one transaction). */
  saveEntries(map: Map<string, RosterEntry>): void {
    const delAll = this.db.prepare('DELETE FROM entries')
    const insert = this.db.prepare(
      'INSERT OR REPLACE INTO entries (twin_id, json) VALUES (?, ?)',
    )
    this.db.exec('BEGIN')
    try {
      delAll.run()
      for (const [twinId, entry] of map) {
        insert.run(twinId, JSON.stringify(entry ?? emptyEntry(twinId)))
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  listTokens(): TokenRow[] {
    const rows = this.db.prepare('SELECT twin_id, kind, token_hash FROM tokens').all() as {
      twin_id: string
      kind: 'read' | 'write'
      token_hash: string
    }[]
    return rows.map((r) => ({ twinId: r.twin_id, kind: r.kind, tokenHash: r.token_hash }))
  }

  tokenHash(twinId: string, kind: 'read' | 'write'): string | undefined {
    const row = this.db
      .prepare('SELECT token_hash FROM tokens WHERE twin_id = ? AND kind = ?')
      .get(twinId, kind) as { token_hash: string } | undefined
    return row?.token_hash
  }

  upsertToken(twinId: string, kind: 'read' | 'write', tokenHash: string): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO tokens (twin_id, kind, token_hash) VALUES (?, ?, ?)',
      )
      .run(twinId, kind, tokenHash)
  }
}
