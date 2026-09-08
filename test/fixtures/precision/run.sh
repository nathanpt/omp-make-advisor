#!/usr/bin/env bash
# run.sh — f-005 precision harness: copies each fixture mini-repo into a
# fresh temp dir, runs one headless oma scan there, and archives the
# resulting advisor-brief.md under results/ for manual scoring.
#
# Scoring (pinned in PROGRESS.md): a violation fixture is flagged iff >=1
# candidate title hits an expected keyword (case-insensitive) AND its
# evidence path resolves inside the fixture; a clean fixture false-positives
# iff any candidate's evidence resolves inside the fixture.
#
# Requires omp auth. timeout 300 is mandatory (err-3: never leak a hung omp
# or a temp dir — the EXIT trap removes the current scratch dir).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
RESULTS="$HERE/results"
FIXTURES=(conc-map err-swallow data-drift build-gate clean-tidy clean-empty)

mkdir -p "$RESULTS"

# Build the scan prompt once from the working tree under test.
PROMPT="$(bun -e "import { buildScanPrompt } from '${REPO}/src/scan.ts'; process.stdout.write(buildScanPrompt())")"

cleanup() {
	if [ -n "$tmp" ]; then rm -rf "$tmp"; fi
}
trap cleanup EXIT

for name in "${FIXTURES[@]}"; do
	tmp="$(mktemp -d /tmp/oma-precision-XXXX)"
	cp -r "$HERE/$name/." "$tmp"/
	echo "== $name: scanning in $tmp"
	(cd "$tmp" && timeout 300 omp -e "$REPO/index.ts" -p "$PROMPT")
	cp "$tmp/advisor-brief.md" "$RESULTS/$name.md"
	rm -rf "$tmp"
	tmp=""
	echo "== $name: brief archived to results/$name.md"
done

echo "All fixtures scanned. Score results/*.md against expected.json."
