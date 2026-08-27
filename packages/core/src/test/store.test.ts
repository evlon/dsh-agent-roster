import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RosterStore,
  memoryBackend,
  StoreBackend,
} from '../store.js'
import { RosterEntry, COMPLETED_WORK_CAP, CURRENT_WORK_CAP } from '../types.js'

function makeStore() {
  const store = new RosterStore(memoryBackend)
  return store
}

test('upsertInfo sets fields and deletes empties', async () => {
  const store = makeStore()
  let e = await store.upsertInfo('ai-a', {
    displayName: '@ai-a:example.org',
    role: 'dev',
    owner: '@humano:example.org',
    description: 'backend',
    tags: ['node', 'go'],
  })
  assert.equal(e.info.role, 'dev')
  assert.deepEqual(e.info.tags, ['node', 'go'])

  e = await store.upsertInfo('ai-a', { description: null, tags: [] })
  assert.equal(e.info.description, undefined)
  assert.equal(e.info.tags, undefined)
})

test('upsertCurrentWork adds new and updates by id, capped', async () => {
  const store = makeStore()
  let e = await store.upsertCurrentWork('ai-a', { title: 'task one' })
  const firstId = e.currentWork[0]!.id
  e = await store.upsertCurrentWork('ai-a', { title: 'task two', status: 'blocked' })
  assert.equal(e.currentWork.length, 2)

  e = await store.upsertCurrentWork('ai-a', { id: firstId, title: 'task one edited' })
  const edited = e.currentWork.find((w) => w.id === firstId)
  assert.equal(edited?.title, 'task one edited')
})

test('addCompletedWork dedups by id and caps', async () => {
  const store = makeStore()
  let e = await store.addCompletedWork('ai-a', { id: 'c1', title: 'done one' })
  e = await store.addCompletedWork('ai-a', { id: 'c2', title: 'done two' })
  assert.equal(e.completedWork.length, 2)
  e = await store.addCompletedWork('ai-a', { id: 'c1', title: 'done one v2' })
  assert.equal(e.completedWork.length, 2)
  const c1 = e.completedWork.find((w) => w.id === 'c1')
  assert.equal(c1?.title, 'done one v2')

  // Cap enforcement.
  for (let i = 0; i < COMPLETED_WORK_CAP + 20; i++) {
    e = await store.addCompletedWork('ai-a', { id: `c${i}`, title: `t${i}` })
  }
  assert.ok(e.completedWork.length <= COMPLETED_WORK_CAP)
})

test('removeCurrentWork removes by id', async () => {
  const store = makeStore()
  let e = await store.upsertCurrentWork('ai-a', { title: 'task one' })
  const id = e.currentWork[0]!.id
  const ok = await store.removeCurrentWork('ai-a', id)
  assert.equal(ok, true)
  e = store.get('ai-a')!
  assert.equal(e.currentWork.length, 0)
  const missing = await store.removeCurrentWork('ai-a', 'nope')
  assert.equal(missing, false)
})

test('heartbeat sets presence', async () => {
  const store = makeStore()
  await store.heartbeat('ai-a')
  const e = store.get('ai-a')!
  assert.equal(e.presence.online, true)
  assert.ok(e.presence.lastActiveAt > 0)
})

test('listViews is sorted and clones', async () => {
  const store = makeStore()
  await store.upsertInfo('ai-b', { displayName: 'b', role: 'dev', owner: 'o' })
  await store.upsertInfo('ai-a', { displayName: 'a', role: 'pm', owner: 'o' })
  const views = store.listViews()
  assert.deepEqual(views.map((v) => v.twinId), ['ai-a', 'ai-b'])
  views[0]!.info.displayName = 'MUTATED'
  const again = store.listViews()
  assert.equal(again[0]!.info.displayName, 'a')
})

test('persistence via backend is called on change', async () => {
  let saved: Map<string, RosterEntry> | undefined
  const backend: StoreBackend = {
    load() {
      return new Map()
    },
    save(map) {
      saved = map
    },
  }
  const store = new RosterStore(backend)
  await store.init()
  await store.upsertInfo('ai-a', { displayName: 'a', role: 'dev', owner: 'o' })
  assert.ok(saved)
  assert.equal(saved!.get('ai-a')?.info.displayName, 'a')
})

test('no persist when nothing changed', async () => {
  let saveCount = 0
  const backend: StoreBackend = {
    load() {
      return new Map()
    },
    save() {
      saveCount++
    },
  }
  const store = new RosterStore(backend)
  await store.init()
  await store.upsertInfo('ai-a', { displayName: 'a', role: 'dev', owner: 'o' })
  const before = saveCount
  // No-op update should not persist.
  await store.upsertInfo('ai-a', {})
  assert.equal(saveCount, before)
})

test('CURRENT_WORK_CAP is respected', async () => {
  const store = makeStore()
  let e = store.get('ai-a')
  for (let i = 0; i < CURRENT_WORK_CAP + 5; i++) {
    e = await store.upsertCurrentWork('ai-a', { title: `w${i}` })
  }
  assert.ok(e!.currentWork.length <= CURRENT_WORK_CAP)
})
