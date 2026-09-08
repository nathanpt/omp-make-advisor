#!/usr/bin/env bash
# CI test gate: run every test file we can find, fail on any failure.
set -euo pipefail
for f in test/*.test.ts; do
	[ -e "$f" ] || continue
	bun test "$f"
done
echo "gate: all tests passed"
