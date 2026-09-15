import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createToken,
  verifyToken,
  hashToken,
  newId,
  TokenPayload,
} from '../tokens.js'

const SECRET = 'test-server-secret-0123456789abcdef'

test('create + verify a write token round-trips', () => {
  const token = createToken(SECRET, 'ai-alpha', 'write')
  const payload = verifyToken(SECRET, token, 'write')
  assert.deepEqual(payload, { twinId: 'ai-alpha', kind: 'write' } as TokenPayload)
})

test('verify rejects the wrong kind', () => {
  const token = createToken(SECRET, 'ai-alpha', 'write')
  assert.equal(verifyToken(SECRET, token, 'read'), undefined)
})

test('verify rejects a token signed with a different secret', () => {
  const token = createToken('other-secret', 'ai-alpha', 'write')
  assert.equal(verifyToken(SECRET, token, 'write'), undefined)
})

test('verify rejects tampered payload', () => {
  const token = createToken(SECRET, 'ai-alpha', 'write')
  const tampered = token.slice(0, -2) + (token.endsWith('00') ? '11' : '00')
  assert.equal(verifyToken(SECRET, tampered, 'write'), undefined)
})

test('verify rejects non-token strings', () => {
  assert.equal(verifyToken(SECRET, undefined, 'write'), undefined)
  assert.equal(verifyToken(SECRET, 'garbage', 'write'), undefined)
  assert.equal(verifyToken(SECRET, 'roster.', 'write'), undefined)
})

test('hashToken is stable and not reversible to the plaintext', () => {
  const token = createToken(SECRET, 'ai-alpha', 'write')
  const h1 = hashToken(token)
  const h2 = hashToken(token)
  assert.equal(h1, h2)
  assert.notEqual(h1, token)
})

test('newId is short and unique', () => {
  const a = newId()
  const b = newId()
  assert.ok(a.length >= 6 && a.length <= 12)
  assert.notEqual(a, b)
})
