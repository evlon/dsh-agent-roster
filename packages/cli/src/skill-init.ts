/**
 * Skill initialization: install the bundled `dsh-roster` SKILL.md into a dsh
 * skill discovery root. Used by `dsh-roster init-skill`.
 *
 * The SKILL.md asset ships inside the published `dsh-roster-cli` package under
 * `assets/dsh-roster/SKILL.md`, so a twin (or operator) can initialize the
 * skill with `dsh-roster init-skill` after installing the CLI — no manual
 * copy needed.
 *
 * dsh scans these skill roots by default: <project>/.dsh/skills, ~/.dsh/skills
 * (=$DSH_HOME/skills), ~/.agents/skills.
 *
 * @module @roster/cli
 */

import { mkdir, readFile, writeFile, access, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** Absolute path to the bundled SKILL.md inside the package (works in dist + src). */
export function bundledSkillPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // dist: <pkg>/dist/skill-init.js  ->  <pkg>/assets/dsh-roster/SKILL.md
  // src:  <pkg>/src/skill-init.ts   ->  <pkg>/assets/dsh-roster/SKILL.md
  return join(here, '..', 'assets', 'dsh-roster', 'SKILL.md')
}

/** Resolve the dsh user skill root (default ~/.dsh/skills). */
export function userSkillRoot(): string {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(dshHome, 'skills')
}

export interface InitSkillResult {
  installed: boolean
  existed: boolean
  path: string
}

/** Initialize the roster skill in a target skill root (default user dsh root). */
export async function initSkill(
  target?: string,
  source?: string,
): Promise<InitSkillResult> {
  const src = source ?? bundledSkillPath()
  let content: string
  try {
    content = await readFile(src, 'utf8')
  } catch {
    throw new Error(`roster skill asset not found at ${src}; install the package intact (npm i -g dsh-roster-cli)`)
  }

  const destRoot = target ?? userSkillRoot()
  const destDir = join(destRoot, 'dsh-roster')
  const dest = join(destDir, 'SKILL.md')

  // Check if already installed and identical.
  try {
    await access(dest)
    const existing = await readFile(dest, 'utf8')
    if (existing === content) {
      return { installed: false, existed: true, path: dest }
    }
  } catch {
    // Not present or unreadable -> (re)install below.
  }

  await mkdir(destDir, { recursive: true })
  await copyFile(src, dest)
  return { installed: true, existed: false, path: dest }
}
