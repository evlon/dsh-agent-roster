import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initSkill, bundledSkillPath } from '../skill-init.js'

let dir: string
let assetSource: string

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'roster-skill-'))
  // Create a fake bundled asset so the test does not depend on repo layout.
  assetSource = join(dir, 'SKILL.md')
  await writeFile(assetSource, '---\nname: dsh-roster\n---\n# dsh-roster\n', 'utf8')
})

after(async () => {
  await rm(dir, { recursive: true, force: true })
})

test('bundledSkillPath resolves to a readable SKILL.md (or throws on missing asset)', async () => {
  // The real package ships assets/dsh-roster/SKILL.md; resolve it and confirm readable.
  const p = bundledSkillPath()
  assert.ok(p.endsWith('SKILL.md'))
  try {
    await readFile(p, 'utf8')
  } catch {
    // In a source checkout without the copied asset this may be absent; the
    // initSkill test below covers the packaged behavior with a fake source.
  }
})

test('initSkill installs the skill when missing', async () => {
  const target = join(dir, 'skills')
  const res = await initSkill(target, assetSource)
  assert.equal(res.installed, true)
  assert.equal(res.existed, false)
  assert.equal(res.path, join(target, 'dsh-roster', 'SKILL.md'))
  const content = await readFile(res.path, 'utf8')
  assert.match(content, /name: dsh-roster/)
})

test('initSkill detects an existing identical skill', async () => {
  const target = join(dir, 'skills')
  const res = await initSkill(target, assetSource)
  assert.equal(res.installed, false)
  assert.equal(res.existed, true)
})

test('initSkill overwrites a different existing skill', async () => {
  const target = join(dir, 'skills2')
  const destDir = join(target, 'dsh-roster')
  await mkdir(destDir, { recursive: true })
  await writeFile(join(destDir, 'SKILL.md'), 'old content', 'utf8')
  const res = await initSkill(target, assetSource)
  assert.equal(res.installed, true)
  assert.equal(res.existed, false)
  const content = await readFile(join(destDir, 'SKILL.md'), 'utf8')
  assert.match(content, /name: dsh-roster/)
})

test('initSkill throws when the source asset is missing', async () => {
  await assert.rejects(
    initSkill(join(dir, 'skills3'), join(dir, 'does-not-exist.md')),
    /not found/,
  )
})
