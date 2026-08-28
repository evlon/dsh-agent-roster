/**
 * Simulated load generator for the roster server.
 *
 * Generates a month-scale dataset through the REAL HTTP API (via the Caddy
 * domain) to observe how the system holds up under sustained use:
 *   - N twins across teams/roles/owners
 *   - each twin gets a profile, 2-8 in-flight work items
 *   - each twin accumulates a month of completed work (spread timestamps)
 *   - presence/heartbeat times simulate varied activity (some offline)
 *
 * Usage:
 *   node scripts/simulate.js [numTwins] [maxCompletedPerTwin]
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = join(__dirname, '..')
const DB = process.env.ROSTER_DB || 'E:/ai-works/caddy/roster-data/roster.db'
const BIN = join(REPO, 'packages/server/dist/server/src/bin.js')

const BASE = process.env.ROSTER_URL || 'http://ai-roster.ict.cmcc'

const TEAMS = ['growth', 'core', 'infra', 'data']
const ROLES = ['dev', 'dev', 'dev', 'dev', 'qa', 'qa', 'pm', 'leader', 'custom']
const OWNERS = ['@niukunliang', '@liamgnc', '@lihua', '@wangming']
const TAG_POOL = ['node', 'go', 'vue', 'react', 'ts', 'python', 'sqlite', 'docker', 'k8s', 'graphql', 'rust', 'postgres', 'redis', 'ci', 'kafka', 'grpc']
const ACTIVE = ['开发新功能', '修复线上Bug', '性能优化', '重构模块', '编写自动化测试', '设计接口', '评审需求', '迁移数据', '部署上线', '排查故障']
const DONE = ['完成需求迭代', '交付版本', '实现核心模块', '优化查询性能', '修复崩溃问题', '搭建监控', '编写文档', '重构历史代码', '接入第三方服务', '上线A/B实验', '修复安全漏洞', '完成数据迁移']

const DAY = 24 * 3600 * 1000
const now = Date.now()
const MONTH_AGO = now - 30 * DAY

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1))
}
function rid() {
  return Math.random().toString(36).slice(2, 10)
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = {}
  try { json = text ? JSON.parse(text) : {} } catch { /* ignore */ }
  if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  return json
}

// ---- CLI-style helpers to build tokens ourselves? No: the server owns signing.
// We need a write token per twin. Simplest is to re-issue via the server bin
// (add-twin). Since that reads the persisted secret from the db, tokens remain
// valid. We shell out once per twin at startup (cheap).

function issueToken(twinId) {
  const out = execFileSync(process.execPath, [BIN, 'add-twin', twinId, '--write', '--db', DB], {
    encoding: 'utf8',
  })
  const j = JSON.parse(out)
  return j.token
}

async function concurrencyLimit(items, limit, fn) {
  let i = 0
  const workers = []
  const results = []
  const next = async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  }
  for (let w = 0; w < limit; w++) workers.push(next())
  await Promise.all(workers)
  return results
}

async function main() {
  const numTwins = Math.max(1, Number(process.argv[2] || 20))
  const maxDone = Math.max(1, Number(process.argv[3] || 200))

  // Build twin specs
  const twins = []
  for (let i = 0; i < numTwins; i++) {
    const team = pick(TEAMS)
    const role = pick(ROLES)
    const tags = [...new Set(Array.from({ length: rand(2, 5) }, () => pick(TAG_POOL)))]
    const activeCount = rand(2, 8)
    const doneCount = rand(Math.min(80, maxDone), Math.min(maxDone, 200))
    twins.push({
      id: `${team}-${role}-${i + 1}`,
      team, role,
      displayName: `${team} ${role} #${i + 1}`,
      owner: pick(OWNERS),
      description: `负责${team}团队的${role === 'qa' ? '质量与测试' : role === 'pm' ? '需求与排期' : role === 'leader' ? '技术架构' : role === 'custom' ? '专项' : '工程研发'}工作`,
      tags,
      activeCount,
      doneCount,
      online: Math.random() < 0.8,
    })
  }

  console.log(`Generating ${twins.length} twins, up to ${maxDone} completed each (~${twins.length * maxDone} work items)...`)

  let doneTotal = 0
  let activeTotal = 0

  // ---- Issue tokens & write profiles
  await concurrencyLimit(twins, 8, async (t) => {
    const token = issueToken(t.id)
    t.token = token
    await api('PUT', `/api/roster/${t.id}/info`, token, {
      displayName: t.displayName,
      role: t.role,
      owner: t.owner,
      description: t.description,
      tags: t.tags,
    })
  })
  console.log('Profiles written.')

  // ---- In-flight work (full replace via PUT)
  await concurrencyLimit(twins, 8, async (t) => {
    const items = Array.from({ length: t.activeCount }, () => ({
      title: pick(ACTIVE) + ' - ' + rid(),
      status: ['active', 'active', 'paused', 'blocked'][rand(0, 3)],
      startedAt: MONTH_AGO + rand(0, 20) * DAY,
    }))
    await api('PUT', `/api/roster/${t.id}/currentWork`, t.token, { items })
    activeTotal += items.length
  })
  console.log('In-flight work written.')

  // ---- Completed work (accumulated over a month), concurrency-limited
  const jobs = []
  for (const t of twins) {
    for (let k = 0; k < t.doneCount; k++) {
      jobs.push({ twin: t, k })
    }
  }
  let errorCount = 0
  await concurrencyLimit(jobs, 15, async ({ twin: t, k }) => {
    const completedAt = MONTH_AGO + Math.floor((k / t.doneCount) * 28 * DAY) + rand(0, 2) * 3600000
    try {
      await api('POST', `/api/roster/${t.id}/completedWork`, t.token, {
        id: rid(),
        title: pick(DONE) + ' - ' + t.team,
        completedAt,
        repo: `repo/${t.team}/${pick(['app', 'svc', 'lib', 'ops'])}`,
      })
      doneTotal++
    } catch (err) {
      errorCount++
      if (errorCount <= 5) console.error('  err:', err.message)
    }
  })
  console.log(`Completed work written: ${doneTotal} ok, ${errorCount} errors`)

  // ---- Presence/heartbeat (varied activity: offline twins have old timestamps)
  await concurrencyLimit(twins, 8, async (t) => {
    // force online flag & a realistic lastActiveAt by writing a heartbeat,
    // then for "offline" twins nothing more (their online stays from heartbeat
    // unless a later process sets it off). We model offline as old activity.
    await api('POST', `/api/roster/${t.id}/heartbeat`, t.token, {})
  })
  console.log('Heartbeats written.')

  // Summary
  const total = activeTotal + doneTotal
  console.log('\n===== SIMULATION SUMMARY =====')
  console.log(`twins: ${twins.length}`)
  console.log(`in-flight work: ${activeTotal}`)
  console.log(`completed work: ${doneTotal}`)
  console.log(`total work items: ${total}`)

  // Fetch a real list to verify
  const readToken = twins[0].token
  const list = await api('GET', '/api/roster', readToken, undefined)
  console.log(`\nAPI list returned ${list.roster.length} twins.`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
