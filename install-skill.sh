#!/usr/bin/env bash
# Install the roster skill into a dsh skill discovery root.
# Default target: $DSH_HOME/skills/dsh-roster  (DSH_HOME defaults to ~/.dsh)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/skills/dsh-roster/SKILL.md"

if [[ ! -f "$SRC" ]]; then
  echo "SKILL.md not found at $SRC (run from the roster repo root)" >&2
  exit 1
fi

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
TARGET="${TARGET:-$DSH_HOME/skills}"
DEST_DIR="$TARGET/dsh-roster"
mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST_DIR/SKILL.md"

echo "Installed roster skill -> $DEST_DIR/SKILL.md"
echo "dsh scans skill roots by default: <project>/.dsh/skills, ~/.dsh/skills, ~/.agents/skills"
