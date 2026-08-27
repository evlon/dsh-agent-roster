#!/usr/bin/env pwsh
# Install the roster skill into a dsh skill discovery root.
# Default target: $DSH_HOME/skills/roster  (DSH_HOME defaults to ~/.dsh)
# Override with:  .\install-skill.ps1 -Target "D:\some\skills"   (-SkipLinks)
#
# The skill only references the external `roster` CLI, so no bundled assets are
# required; this just copies SKILL.md so the dsh skill provider discovers it.

[CmdletBinding()]
param(
  [string]$Target,
  [switch]$SkipLinks
)

$ErrorActionPreference = 'Stop'

$src = Join-Path $PSScriptRoot 'skills\roster\SKILL.md'
if (-not (Test-Path $src)) {
  throw "SKILL.md not found at $src (run from the roster repo root)"
}

$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $HOME '.dsh' }

if (-not $Target) { $Target = Join-Path $dshHome 'skills' }
$destDir = Join-Path $Target 'roster'
$dest = Join-Path $destDir 'SKILL.md'

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
Copy-Item -Path $src -Destination $dest -Force

Write-Host "Installed roster skill -> $dest"
Write-Host "dsh scans these skill roots by default: <project>/.dsh/skills, ~/.dsh/skills, ~/.agents/skills"
Write-Host "Verify with: dsh --profile web --dump-config | grep skills  (or run a session and check the skill catalog)"
