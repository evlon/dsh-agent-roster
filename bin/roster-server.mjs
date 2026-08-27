#!/usr/bin/env node
// Thin launcher for the `roster-server` CLI. Add this repo's ./bin to PATH, or
// `npm link` at the repo root, to expose `roster-server` as a shell command.
import('../packages/server/dist/server/src/bin.js').catch((err) => {
  process.stderr.write(`roster-server: failed to load CLI: ${err.message}\n`)
  process.exit(2)
})
