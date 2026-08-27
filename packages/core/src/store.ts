/**
 * Roster store: in-memory mutation logic for {@link RosterEntry} records.
 *
 * The store keeps a map of twinId -> entry and exposes atomic mutations that
 * enforce the caps and dedup rules. Persistence is not owned here: the server
 * loads the map at startup and persists after each mutation (see `db.ts`).
 *
 * @module @roster/core
 */

import {
  COMPLETED_WORK_CAP,
  CURRENT_WORK_CAP,
  CurrentWork,
  CompletedWork,
  emptyEntry,
  RosterEntry,
  toView,
  RosterEntryView,
} from './types.js'

/** Persistent backend contract the store uses to load/persist. */
export interface StoreBackend {
  /** Load all entries (twinId -> entry). Return an empty map when absent. */
  load(): Promise<Map<string, RosterEntry>> | Map<string, RosterEntry>
  /** Persist the full map after a mutation. */
  save(map: Map<string, RosterEntry>): Promise<void> | void
}

/** No-op backend (in-memory only). */
export const memoryBackend: StoreBackend = {
  load() {
    return new Map()
  },
  save() {
    // no-op
  },
}

export interface UpsertInfoInput {
  displayName?: string
  role?: string
  owner?: string
  description?: string | null
  tags?: string[] | null
}

export interface UpsertCurrentWorkInput {
  id?: string
  title: string
  description?: string
  status?: 'active' | 'paused' | 'blocked'
  startedAt?: number
  eta?: number
}

export interface AddCompletedInput {
  id: string
  title: string
  description?: string
  completedAt?: number
  repo?: string
}

export interface MutationResult {
  entry: RosterEntry
  /** true if anything actually changed (used to decide persistence). */
  changed: boolean
}

/** In-memory roster store with cap/dedup rules. */
export class RosterStore {
  private map: Map<string, RosterEntry>

  constructor(private readonly backend: StoreBackend = memoryBackend) {
    this.map = new Map()
  }

  async init(): Promise<void> {
    this.map = await this.backend.load()
  }

  entries(): RosterEntry[] {
    return [...this.map.values()].map((e) => structuredClone(e))
  }

  /** Public projection of all entries, sorted by twinId. */
  listViews(): RosterEntryView[] {
    return this.entries()
      .sort((a, b) => a.twinId.localeCompare(b.twinId))
      .map(toView)
  }

  get(twinId: string): RosterEntry | undefined {
    const e = this.map.get(twinId)
    return e ? structuredClone(e) : undefined
  }

  getView(twinId: string): RosterEntryView | undefined {
    const e = this.get(twinId)
    return e ? toView(e) : undefined
  }

  has(twinId: string): boolean {
    return this.map.has(twinId)
  }

  private mutate(twinId: string, fn: (entry: RosterEntry) => void): MutationResult {
    let entry = this.map.get(twinId)
    if (!entry) {
      entry = emptyEntry(twinId)
      this.map.set(twinId, entry)
    }
    const before = JSON.stringify(entry)
    entry.updatedAt = Date.now()
    fn(entry)
    const changed = before !== JSON.stringify(entry)
    return { entry: structuredClone(entry), changed }
  }

  private async persist(): Promise<void> {
    await this.backend.save(this.map)
  }

  async upsertInfo(twinId: string, input: UpsertInfoInput): Promise<RosterEntry> {
    const res = this.mutate(twinId, (e) => {
      if (input.displayName !== undefined) e.info.displayName = input.displayName
      if (input.role !== undefined) e.info.role = input.role
      if (input.owner !== undefined) e.info.owner = input.owner
      if (input.description !== undefined) {
        if (input.description === null || input.description === '') delete e.info.description
        else e.info.description = input.description
      }
      if (input.tags !== undefined) {
        if (input.tags === null || input.tags.length === 0) delete e.info.tags
        else e.info.tags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))]
      }
    })
    if (res.changed) await this.persist()
    return res.entry
  }

  async upsertCurrentWork(twinId: string, input: UpsertCurrentWorkInput): Promise<RosterEntry> {
    const res = this.mutate(twinId, (e) => {
      const status = input.status ?? 'active'
      if (input.id) {
        const idx = e.currentWork.findIndex((w) => w.id === input.id)
        const item: CurrentWork = {
          id: input.id,
          title: input.title,
          status,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
          ...(input.eta !== undefined ? { eta: input.eta } : {}),
        }
        if (idx >= 0) e.currentWork[idx] = item
        else e.currentWork.unshift(item)
      } else {
        const item: CurrentWork = {
          id: randomId(),
          title: input.title,
          status,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
          ...(input.eta !== undefined ? { eta: input.eta } : {}),
        }
        e.currentWork.unshift(item)
      }
      if (e.currentWork.length > CURRENT_WORK_CAP) {
        e.currentWork.length = CURRENT_WORK_CAP
      }
    })
    if (res.changed) await this.persist()
    return res.entry
  }

  async removeCurrentWork(twinId: string, id: string): Promise<boolean> {
    const entry = this.map.get(twinId)
    if (!entry) return false
    const before = entry.currentWork.length
    entry.currentWork = entry.currentWork.filter((w) => w.id !== id)
    const changed = before !== entry.currentWork.length
    if (changed) {
      entry.updatedAt = Date.now()
      await this.persist()
    }
    return changed
  }

  async addCompletedWork(twinId: string, input: AddCompletedInput): Promise<RosterEntry> {
    const res = this.mutate(twinId, (e) => {
      // Dedup by id.
      if (e.completedWork.some((w) => w.id === input.id)) {
        e.completedWork = e.completedWork.map((w) =>
          w.id === input.id
            ? {
                id: input.id,
                title: input.title,
                completedAt: input.completedAt ?? w.completedAt,
                ...(input.description !== undefined ? { description: input.description } : {}),
                ...(input.repo !== undefined ? { repo: input.repo } : {}),
              }
            : w,
        )
        return
      }
      const item: CompletedWork = {
        id: input.id,
        title: input.title,
        completedAt: input.completedAt ?? Date.now(),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.repo !== undefined ? { repo: input.repo } : {}),
      }
      e.completedWork.unshift(item)
      if (e.completedWork.length > COMPLETED_WORK_CAP) {
        e.completedWork.length = COMPLETED_WORK_CAP
      }
    })
    if (res.changed) await this.persist()
    return res.entry
  }

  /** Update presence (last heartbeat) and set online flag. */
  async heartbeat(twinId: string, online = true): Promise<RosterEntry> {
    const res = this.mutate(twinId, (e) => {
      e.presence.online = online
      e.presence.lastActiveAt = Date.now()
    })
    if (res.changed) await this.persist()
    return res.entry
  }
}

function randomId(): string {
  return globalThis.crypto.randomUUID().slice(0, 8)
}
