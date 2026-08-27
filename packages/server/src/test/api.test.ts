import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { AddressInfo } from 'node:net'
import { startServer, StartedServer } from '../index.js'
import { createToken } from '../../../core/src/index.js'

const SECRET = 'integration-test-secret-0123456789abcdef'

let srv: StartedServer
let base: string

async function req(
  method: string,
  path: string,
  token: string | undefined,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const data = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const r = request(
      base + path,
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
          try {
            resolve({ status: res.statusCode ?? 0, json: buf ? JSON.parse(buf) : {} })
          } catch {
            resolve({ status: res.statusCode ?? 0, json: { raw: buf } })
          }
        })
      },
    )
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

before(async () => {
  srv = await startServer({ dbPath: ':memory:', serverSecret: SECRET, host: '127.0.0.1', port: 0 })
  const addr = srv.server.address() as AddressInfo
  base = `http://127.0.0.1:${addr.port}`
})

after(async () => {
  await srv.close()
})

test('health endpoint responds', async () => {
  const res = await req('GET', '/health', undefined)
  assert.equal(res.status, 200)
  assert.equal(res.json.ok, true)
})

test('full write-then-read lifecycle for one twin', async () => {
  const aWrite = createToken(SECRET, 'ai-a', 'write')
  const readToken = createToken(SECRET, 'ai-a', 'read')

  // update info
  let r = await req('PUT', '/api/roster/ai-a/info', aWrite, {
    displayName: '@ai-a:example.org',
    role: 'dev',
    owner: '@owner:example.org',
    description: 'backend engineer',
    tags: ['node', 'go'],
  })
  assert.equal(r.status, 200)

  // add current work
  r = await req('POST', '/api/roster/ai-a/currentWork', aWrite, { title: 'build roster', status: 'active' })
  assert.equal(r.status, 200)
  const workId = (r.json.entry as { currentWork: { id: string }[] }).currentWork[0]!.id

  // update current work
  r = await req('POST', '/api/roster/ai-a/currentWork', aWrite, { id: workId, title: 'build roster v2', status: 'blocked' })
  assert.equal(r.status, 200)

  // add completed
  r = await req('POST', '/api/roster/ai-a/completedWork', aWrite, { title: 'shipped thing', repo: 'repo/x' })
  assert.equal(r.status, 200)

  // heartbeat
  r = await req('POST', '/api/roster/ai-a/heartbeat', aWrite, {})
  assert.equal(r.status, 200)

  // read single
  r = await req('GET', '/api/roster/ai-a', readToken)
  assert.equal(r.status, 200)
  const entry = r.json.entry as {
    info: { role: string; tags: string[] }
    currentWork: { id: string; title: string; status: string }[]
    completedWork: { title: string }[]
    presence: { online: boolean }
  }
  assert.equal(entry.info.role, 'dev')
  assert.deepEqual(entry.info.tags, ['node', 'go'])
  assert.equal(entry.currentWork[0]!.title, 'build roster v2')
  assert.equal(entry.currentWork[0]!.status, 'blocked')
  assert.equal(entry.completedWork[0]!.title, 'shipped thing')
  assert.equal(entry.presence.online, true)
})

test('reading the whole roster requires a token', async () => {
  const noAuth = await req('GET', '/api/roster', undefined)
  assert.equal(noAuth.status, 401)
  const readToken = createToken(SECRET, 'ai-a', 'read')
  const ok = await req('GET', '/api/roster', readToken)
  assert.equal(ok.status, 200)
  assert.ok(Array.isArray(ok.json.roster))
})

test('a write token cannot write another twin', async () => {
  const aWrite = createToken(SECRET, 'ai-a', 'write')
  const r = await req('PUT', '/api/roster/ai-b/info', aWrite, { role: 'pm' })
  assert.equal(r.status, 403)
})

test('a read token cannot write', async () => {
  const aRead = createToken(SECRET, 'ai-a', 'read')
  const r = await req('POST', '/api/roster/ai-a/currentWork', aRead, { title: 'nope' })
  assert.equal(r.status, 401)
})

test('a write token can read (write implies read)', async () => {
  const aWrite = createToken(SECRET, 'ai-a', 'write')
  const r = await req('GET', '/api/roster', aWrite)
  assert.equal(r.status, 200)
  assert.ok(Array.isArray(r.json.roster))
})

test('unknown route returns 404', async () => {
  const readToken = createToken(SECRET, 'ai-a', 'read')
  const r = await req('GET', '/api/nope', readToken)
  assert.equal(r.status, 404)
})
