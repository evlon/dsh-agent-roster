import { test } from 'node:test'
import assert from 'node:assert/strict'
import { twinIdFromToken, num } from '../util.js'

test('twinIdFromToken extracts the twinId', () => {
  assert.equal(twinIdFromToken('roster.ai-alpha.write.sig'), 'ai-alpha')
  assert.equal(twinIdFromToken('roster.ai-b.read.sig'), 'ai-b')
})

test('twinIdFromToken handles malformed tokens', () => {
  assert.equal(twinIdFromToken(undefined), undefined)
  assert.equal(twinIdFromToken(''), undefined)
  assert.equal(twinIdFromToken('garbage'), undefined)
  assert.equal(twinIdFromToken('roster.'), undefined)
  assert.equal(twinIdFromToken('roster..write.sig'), undefined)
})

test('num parses valid numbers', () => {
  assert.equal(num('42'), 42)
  assert.equal(num('1.5'), 1.5)
  assert.equal(num(undefined), undefined)
})

test('num rejects invalid numbers', () => {
  assert.equal(num('abc'), undefined)
  assert.equal(num(''), undefined)
})
