#!/usr/bin/env node
// Thin launcher for the `dsh-roster` CLI. Add this repo's ./bin to PATH, or
// `npm link` at the repo root, to expose `dsh-roster` as a shell command.
import('../packages/cli/dist/bin.js').catch((err) => {
  process.stderr.write(`dsh-roster: failed to load CLI: ${err.message}\n`)
  process.exit(2)
})
