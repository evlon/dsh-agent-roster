/**
 * HTTP request routing for the roster server.
 *
 * Implemented on `node:http` with zero third-party deps so the server and CLI
 * stay trivial to build and deploy. `createHandler` returns a
 * `(req, res) => void` function usable directly by `http.createServer` or in
 * tests.
 *
 * @module @roster/server
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { RosterStore } from '../../core/src/index.js'
import { authenticate, authorizeWrite } from './auth.js'

export interface ServerDeps {
  store: RosterStore
  serverSecret: string
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body ?? {})
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

function sendError(res: ServerResponse, status: number, message: string): void {
  send(res, status, { ok: false, error: message })
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return undefined // signal malformed JSON
  }
}

function pathParts(pathname: string): string[] {
  return pathname.split('/').filter((s) => s.length > 0)
}

function nowMs(): number {
  return Date.now()
}

/** Build the HTTP handler. */
export function createHandler(deps: ServerDeps) {
  const { store, serverSecret } = deps

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/'
    const [path, query] = url.split('?') as [string, string | undefined]
    void query
    const method = (req.method ?? 'GET').toUpperCase()
    const parts = pathParts(path)
    const authHeader = req.headers['authorization']

    // /health
    if (path === '/health') {
      return send(res, 200, { ok: true, service: 'roster' })
    }

    // GET /api/roster
    if (path === '/api/roster' && method === 'GET') {
      const auth = authenticate(serverSecret, authHeader, 'read')
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      return send(res, 200, { ok: true, roster: store.listViews() })
    }

    // GET /api/roster/:twinId
    if (parts[0] === 'api' && parts[1] === 'roster' && parts[2] && method === 'GET') {
      const auth = authenticate(serverSecret, authHeader, 'read')
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      const view = store.getView(parts[2])
      if (!view) return sendError(res, 404, `twin '${parts[2]}' not found`)
      return send(res, 200, { ok: true, entry: view })
    }

    // /api/roster/:twinId/info  (PUT)
    if (parts[0] === 'api' && parts[1] === 'roster' && parts[2] && parts[3] === 'info' && method === 'PUT') {
      const target = parts[2]
      const auth = authorizeWrite(serverSecret, authHeader, target)
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      const body = await readJson(req)
      if (body === undefined) return sendError(res, 400, 'malformed JSON body')
      const b = body as Record<string, unknown>
      const entry = await store.upsertInfo(target, {
        displayName: typeof b.displayName === 'string' ? b.displayName : undefined,
        role: typeof b.role === 'string' ? b.role : undefined,
        owner: typeof b.owner === 'string' ? b.owner : undefined,
        description: b.description === undefined ? undefined : (typeof b.description === 'string' && b.description !== '' ? b.description : null),
        tags: b.tags === undefined ? undefined : (Array.isArray(b.tags) ? (b.tags as unknown[]).filter((t): t is string => typeof t === 'string') : null),
      })
      return send(res, 200, { ok: true, entry: store.getView(target) ?? entry, _now: nowMs() })
    }

    // /api/roster/:twinId/currentWork  (PUT replace-all)
    if (parts[0] === 'api' && parts[1] === 'roster' && parts[2] && parts[3] === 'currentWork' && method === 'PUT') {
      const target = parts[2]
      const auth = authorizeWrite(serverSecret, authHeader, target)
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      const body = await readJson(req)
      if (body === undefined) return sendError(res, 400, 'malformed JSON body')
      const items = (body as { items?: unknown }).items
      if (!Array.isArray(items)) return sendError(res, 400, 'expected { items: [...] }')
      let entry = store.get(target)
      if (!entry) entry = await store.upsertCurrentWork(target, { title: 'init' }) // create shell
      // Clear current work by removing each existing id, then write items.
      for (const w of [...entry.currentWork]) {
        await store.removeCurrentWork(target, w.id)
      }
      for (const item of items as { id?: unknown; title?: unknown; description?: unknown; status?: unknown; startedAt?: unknown; eta?: unknown }[]) {
        if (typeof item.title !== 'string' || item.title.trim() === '') continue
        await store.upsertCurrentWork(target, {
          id: typeof item.id === 'string' ? item.id : undefined,
          title: item.title,
          description: typeof item.description === 'string' ? item.description : undefined,
          status: item.status === 'paused' || item.status === 'blocked' ? item.status : 'active',
          startedAt: typeof item.startedAt === 'number' ? item.startedAt : undefined,
          eta: typeof item.eta === 'number' ? item.eta : undefined,
        })
      }
      return send(res, 200, { ok: true, entry: store.getView(target) })
    }

    // /api/roster/:twinId/currentWork  (POST add/update one)
    if (parts[0] === 'api' && parts[1] === 'roster' && parts[2] && parts[3] === 'currentWork' && method === 'POST') {
      const target = parts[2]
      const auth = authorizeWrite(serverSecret, authHeader, target)
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      const body = await readJson(req)
      if (body === undefined) return sendError(res, 400, 'malformed JSON body')
      const b = body as Record<string, unknown>
      if (typeof b.title !== 'string' || b.title.trim() === '') {
        return sendError(res, 400, 'expected { title: string }')
      }
      const entry = await store.upsertCurrentWork(target, {
        id: typeof b.id === 'string' && b.id ? b.id : undefined,
        title: b.title,
        description: typeof b.description === 'string' ? b.description : undefined,
        status: b.status === 'paused' || b.status === 'blocked' ? b.status : 'active',
        startedAt: typeof b.startedAt === 'number' ? b.startedAt : undefined,
        eta: typeof b.eta === 'number' ? b.eta : undefined,
      })
      return send(res, 200, { ok: true, entry: store.getView(target) ?? entry })
    }

    // DELETE /api/roster/:twinId/currentWork/:id
    if (parts[0] === 'api' && parts[1] === 'roster' && parts[2] && parts[3] === 'currentWork' && parts[4] && method === 'DELETE') {
      const target = parts[2]
      const auth = authorizeWrite(serverSecret, authHeader, target)
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      const removed = await store.removeCurrentWork(target, parts[4])
      return send(res, removed ? 200 : 404, { ok: removed, removed })
    }

    // POST /api/roster/:twinId/completedWork
    if (parts[0] === 'api' && parts[1] === 'roster' && parts[2] && parts[3] === 'completedWork' && method === 'POST') {
      const target = parts[2]
      const auth = authorizeWrite(serverSecret, authHeader, target)
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      const body = await readJson(req)
      if (body === undefined) return sendError(res, 400, 'malformed JSON body')
      const b = body as Record<string, unknown>
      if (typeof b.title !== 'string' || b.title.trim() === '') {
        return sendError(res, 400, 'expected { title: string, id?: string }')
      }
      const id = typeof b.id === 'string' && b.id ? b.id : undefined
      const entry = await store.addCompletedWork(target, {
        id: id ?? globalThis.crypto.randomUUID().slice(0, 8),
        title: b.title,
        description: typeof b.description === 'string' ? b.description : undefined,
        completedAt: typeof b.completedAt === 'number' ? b.completedAt : undefined,
        repo: typeof b.repo === 'string' ? b.repo : undefined,
      })
      return send(res, 200, { ok: true, entry: store.getView(target) ?? entry })
    }

    // POST /api/roster/:twinId/heartbeat
    if (parts[0] === 'api' && parts[1] === 'roster' && parts[2] && parts[3] === 'heartbeat' && method === 'POST') {
      const target = parts[2]
      const auth = authorizeWrite(serverSecret, authHeader, target)
      if (!auth.ok) return sendError(res, auth.status, auth.error!)
      await store.heartbeat(target, true)
      return send(res, 200, { ok: true, entry: store.getView(target) })
    }

    return sendError(res, 404, `no route: ${method} ${path}`)
  }
}
