/**
 * Shared data model for the roster: a registry of AI digital twins.
 *
 * Every twin owns one {@link RosterEntry} keyed by `twinId`. Twins can read the
 * whole roster and write only their own entry. Fields cover basic info, current
 * work, completed work and presence (online / last active).
 *
 * @module @roster/core
 */

/** Basic identifying / role information for a twin. */
export interface TwinInfo {
  /** Display name, often the twin's Matrix userId. */
  displayName: string
  /** Job role: leader | pm | dev | qa | custom (free-form allowed). */
  role: string
  /** Working responsibility owner (a real human Matrix userId). */
  owner: string
  /** Free-form responsibility description. */
  description?: string
  /** Skill / domain tags. */
  tags?: string[]
}

/** A single item of work the twin is currently doing. */
export interface CurrentWork {
  /** Stable id assigned by the writer (or server-generated). */
  id: string
  title: string
  description?: string
  status: 'active' | 'paused' | 'blocked'
  startedAt?: number
  eta?: number
}

/** A completed piece of work, kept as history. */
export interface CompletedWork {
  /** Stable id (writer-supplied; dedup uses it). */
  id: string
  title: string
  description?: string
  /** Epoch ms completion time. */
  completedAt: number
  /** Repo / deliverable touched. */
  repo?: string
}

/** Presence / liveness info. */
export interface Presence {
  online: boolean
  /** Epoch ms of the last heartbeat. */
  lastActiveAt: number
}

/** One twin's full roster record. */
export interface RosterEntry {
  twinId: string
  info: TwinInfo
  currentWork: CurrentWork[]
  completedWork: CompletedWork[]
  presence: Presence
  /** Epoch ms of the last write to this entry. */
  updatedAt: number
}

/** Status values accepted for a current-work item. */
export const CURRENT_WORK_STATUSES = ['active', 'paused', 'blocked'] as const
export type CurrentWorkStatus = (typeof CURRENT_WORK_STATUSES)[number]

/** Default cap on how many completed-work items to retain per twin. */
export const COMPLETED_WORK_CAP = 200
/** Default cap on how many current-work items to retain per twin. */
export const CURRENT_WORK_CAP = 20

/** Reasonable defaults for a fresh entry. */
export function emptyEntry(twinId: string): RosterEntry {
  return {
    twinId,
    info: { displayName: twinId, role: '', owner: '' },
    currentWork: [],
    completedWork: [],
    presence: { online: false, lastActiveAt: 0 },
    updatedAt: 0,
  }
}

/** Minimal public projection of an entry (no secrets). */
export interface RosterEntryView {
  twinId: string
  info: TwinInfo
  currentWork: CurrentWork[]
  completedWork: CompletedWork[]
  presence: Presence
  updatedAt: number
}

/** Build the public view of an entry, applying output caps defensively. */
export function toView(entry: RosterEntry): RosterEntryView {
  return {
    twinId: entry.twinId,
    info: { ...entry.info, tags: entry.info.tags ? [...entry.info.tags] : undefined },
    currentWork: entry.currentWork.slice(0, CURRENT_WORK_CAP),
    completedWork: entry.completedWork.slice(0, COMPLETED_WORK_CAP),
    presence: { ...entry.presence },
    updatedAt: entry.updatedAt,
  }
}

/** Validate a twinId is a safe, non-empty identifier. */
export function isValidTwinId(twinId: unknown): twinId is string {
  return typeof twinId === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(twinId)
}
