#!/usr/bin/env bash
# init.sh — development/check entry point for omp-make-advisor.
#
# Status: pre-implementation. There is no extension to build or run yet, so this
# script runs the documentation baseline checks only. Slice 1 (feature f-001)
# replaces the placeholder sections below with the real setup/build/test path.
# Keep this script honest at every step: no hidden failures, no fake success.
#
# Usage: ./init.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "== omp-make-advisor init =="
echo "Status: pre-implementation (documentation baseline only)"

# --- Prerequisites ---------------------------------------------------------
for tool in python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "MISSING prerequisite: $tool" >&2
    exit 1
  fi
done

# --- Setup -----------------------------------------------------------------
# Placeholder: nothing to install yet. Extension dependencies land with slice 1
# (feature f-001) and must be recorded in AGENTS.md "Commands".

# --- Start -----------------------------------------------------------------
# Placeholder: nothing to start yet. From f-001 the extension loads inside an
# OMP session via /make-advisor (alias oma).

# --- Baseline checks -------------------------------------------------------
python3 - <<'EOF'
import json, os, re, sys

failures = []

# Feature contract parses and is internally consistent.
data = json.load(open('docs/feature-list.json'))
features = data['features']
ids = {f['id'] for f in features}
for f in features:
    for dep in f.get('dependencies', []):
        if dep not in ids:
            failures.append(f"{f['id']}: unknown dependency {dep}")

# Markdown links resolve (relative to each file's own directory).
for name in ['README.md', 'AGENTS.md', 'PROGRESS.md', 'ARCHITECTURE.md',
             'CHANGELOG.md', 'docs/design-docs/DESIGN.md']:
    for target in re.findall(r'\]\(([^)#]+)\)', open(name).read()):
        if target.startswith(('http://', 'https://', 'mailto:')):
            continue
        if not os.path.exists(os.path.join(os.path.dirname(name), target)):
            failures.append(f"{name}: broken link -> {target}")

# Router stays a router.
agents_lines = len(open('AGENTS.md').read().splitlines())
if not 50 <= agents_lines <= 200:
    failures.append(f"AGENTS.md is {agents_lines} lines (budget 50-200)")

if failures:
    print('FAIL:')
    for f in failures:
        print(' -', f)
    sys.exit(1)
print(f'OK: {len(features)} features, deps resolve, links resolve, AGENTS.md {agents_lines} lines')
EOF

echo "Baseline checks passed."

# --- Stop / cleanup --------------------------------------------------------
# Nothing to stop or clean up; this script writes no state.
