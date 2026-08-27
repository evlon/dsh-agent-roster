#!/usr/bin/env node
/**
 * `dsh-roster` CLI entry. Talk to a roster server to view/update the digital
 * twin roster. Designed to be called by agents (via bash/pwsh) as well as
 * humans.
 *
 * Config: `ROSTER_URL` (or `--url`), `ROSTER_TOKEN` (or `--token`).
 * Output: JSON on stdout; diagnostics on stderr.
 *
 * Exit codes: 0 ok, 1 auth/permission, 2 network/server, 3 usage.
 *
 * @module @roster/cli
 */

import {
  get,
  post,
  put,
  del,
  CliError,
} from './commands.js'
import { twinIdFromToken, num } from './util.js'

/** Effective token: CLI flag wins, else env var. */
function effectiveToken(flag?: string): string | undefined {
  return flag ?? process.env.ROSTER_TOKEN
}

function usage(): never {
  process.stderr.write(
    [
      'dsh-roster <command> [options]',
      '',
      'View:',
      '  dsh-roster list [--url U] [--token T]                    list the whole roster',
      '  dsh-roster get <twinId> [--url U] [--token T]             get one twin entry',
      '  dsh-roster self [--url U] [--token T]                     get your own entry (from token)',
      '  dsh-roster whoami [--url U] [--token T]                   show your token identity',
      '',
      'Update your own info:',
      '  dsh-roster update-info --displayName N --role R [--owner O]',
      '      [--description D] [--tags a,b,c] [--clear-tags] [--url U] [--token T]',
      '',
      'Current work:',
      '  dsh-roster work add --title T [--description D] [--status active|paused|blocked]',
      '      [--eta EPOCH_MS] [--url U] [--token T]',
      '  dsh-roster work update <id> --title T [--status S] [--description D] [--url U] [--token T]',
      '  dsh-roster work remove <id> [--url U] [--token T]',
      '  dsh-roster work replace --items-json \'[...]\' [--url U] [--token T]   replace all',
      '',
      'Completed work:',
      '  dsh-roster done add --title T [--description D] [--repo R] [--completed-at EPOCH_MS]',
      '      [--id ID] [--url U] [--token T]',
      '',
      'Presence:',
      '  dsh-roster heartbeat [--url U] [--token T]',
      '',
      'Skill:',
      '  dsh-roster init-skill [--target DIR] [--source FILE]   install the roster skill into a dsh skill root',
      '      (default: ~/.dsh/skills; runs if skill not yet installed)',
      '',
      'Env:',
      '  ROSTER_URL   base URL of the roster server (e.g. http://host:8765)',
      '  ROSTER_TOKEN per-twin write token (read tokens also work for reads)',
      '',
    ].join('\n'),
  )
  process.exit(3)
}

interface Flags {
  url?: string
  token?: string
  [key: string]: string | undefined
}

function parseArgs(args: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = args[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = 'true'
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags }
}

function jsonOut(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n')
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) usage()
  const cmd = args[0]!
  const rest = args.slice(1)
  const { positional, flags } = parseArgs(rest)

  switch (cmd) {
    case 'list': {
      const data = await get('/api/roster', flags.url, flags.token)
      jsonOut({ ok: true, roster: data.roster })
      return
    }
    case 'get': {
      const twinId = positional[0]
      if (!twinId) usage()
      const data = await get(`/api/roster/${encodeURIComponent(twinId)}`, flags.url, flags.token)
      jsonOut({ ok: true, entry: data.entry })
      return
    }
    case 'self': {
      const data = await get('/api/roster', flags.url, flags.token)
      const twinId = twinIdFromToken(effectiveToken(flags.token))
      const roster = (data.roster as { twinId: string }[] | undefined) ?? []
      const me = roster.find((e) => e.twinId === twinId)
      jsonOut({ ok: true, twinId, entry: me ?? null })
      return
    }
    case 'whoami': {
      const twinId = twinIdFromToken(effectiveToken(flags.token))
      jsonOut({ ok: true, twinId })
      return
    }
    case 'update-info': {
      const body: Record<string, unknown> = {}
      if (flags.displayName !== undefined) body.displayName = flags.displayName
      if (flags.role !== undefined) body.role = flags.role
      if (flags.owner !== undefined) body.owner = flags.owner
      if (flags.description !== undefined) body.description = flags.description
      if (flags.tags !== undefined) body.tags = flags.tags.split(',').map((s) => s.trim()).filter(Boolean)
      if (flags.clearTags === 'true') body.tags = []
      const twinId = twinIdFromToken(effectiveToken(flags.token))
      if (!twinId) {
        throw new CliError('update-info requires a write token that identifies your twinId', 1)
      }
      const data = await put(`/api/roster/${encodeURIComponent(twinId)}/info`, body, flags.url, flags.token)
      jsonOut({ ok: true, entry: data.entry })
      return
    }
    case 'work': {
      const sub = positional[0]
      if (sub === 'add') {
        const title = flags.title
        if (!title) throw new CliError('work add requires --title', 3)
        const twinId = mustTwin(effectiveToken(flags.token))
        const data = await post(
          `/api/roster/${encodeURIComponent(twinId)}/currentWork`,
          {
            title,
            description: flags.description,
            status: flags.status ?? 'active',
            eta: num(flags.eta),
          },
          flags.url,
          flags.token,
        )
        jsonOut({ ok: true, entry: data.entry })
        return
      }
      if (sub === 'update') {
        const id = positional[1]
        if (!id) throw new CliError('work update requires <id>', 3)
        if (!flags.title && !flags.status && !flags.description) {
          throw new CliError('work update requires --title/--status/--description', 3)
        }
        const twinId = mustTwin(effectiveToken(flags.token))
        const data = await post(
          `/api/roster/${encodeURIComponent(twinId)}/currentWork`,
          {
            id,
            title: flags.title,
            status: flags.status,
            description: flags.description,
          },
          flags.url,
          flags.token,
        )
        jsonOut({ ok: true, entry: data.entry })
        return
      }
      if (sub === 'remove') {
        const id = positional[1]
        if (!id) throw new CliError('work remove requires <id>', 3)
        const twinId = mustTwin(effectiveToken(flags.token))
        const data = await del(
          `/api/roster/${encodeURIComponent(twinId)}/currentWork/${encodeURIComponent(id)}`,
          flags.url,
          flags.token,
        )
        jsonOut({ ok: true, removed: data.removed })
        return
      }
      if (sub === 'replace') {
        const twinId = mustTwin(effectiveToken(flags.token))
        let items: unknown
        try {
          items = JSON.parse(flags.itemsJson ?? '[]')
        } catch {
          throw new CliError('work replace requires --items-json to be valid JSON', 3)
        }
        const data = await put(
          `/api/roster/${encodeURIComponent(twinId)}/currentWork`,
          { items },
          flags.url,
          flags.token,
        )
        jsonOut({ ok: true, entry: data.entry })
        return
      }
      usage()
      return
    }
    case 'done': {
      const sub = positional[0]
      if (sub === 'add') {
        const title = flags.title
        if (!title) throw new CliError('done add requires --title', 3)
        const twinId = mustTwin(effectiveToken(flags.token))
        const data = await post(
          `/api/roster/${encodeURIComponent(twinId)}/completedWork`,
          {
            id: flags.id,
            title,
            description: flags.description,
            repo: flags.repo,
            completedAt: num(flags.completedAt),
          },
          flags.url,
          flags.token,
        )
        jsonOut({ ok: true, entry: data.entry })
        return
      }
      usage()
      return
    }
    case 'heartbeat': {
      const twinId = mustTwin(effectiveToken(flags.token))
      const data = await post(
        `/api/roster/${encodeURIComponent(twinId)}/heartbeat`,
        {},
        flags.url,
        flags.token,
      )
      jsonOut({ ok: true, entry: data.entry })
      return
    }
    case 'init-skill': {
      const { initSkill } = await import('./skill-init.js')
      const result = await initSkill(
        flags.target === 'true' ? undefined : flags.target,
        flags.source === 'true' ? undefined : flags.source,
      )
      if (result.existed) {
        jsonOut({ ok: true, existed: true, path: result.path, note: 'skill already installed' })
      } else {
        jsonOut({ ok: true, installed: true, path: result.path, note: 'roster skill initialized' })
      }
      return
    }
    default:
      usage()
  }
}

function mustTwin(token: string | undefined): string {
  const twinId = twinIdFromToken(token)
  if (!twinId) {
    throw new CliError('this command requires a write token that identifies your twinId (set ROSTER_TOKEN)', 1)
  }
  return twinId
}

main().catch((err) => {
  if (err instanceof CliError) {
    process.stderr.write(`dsh-roster: ${err.message}\n`)
    process.exit(err.exitCode)
  }
  process.stderr.write(`dsh-roster: unexpected error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(2)
})
