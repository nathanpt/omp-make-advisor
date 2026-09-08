#!/usr/bin/env bash
# validate.sh — f-008 precision validator: for each fixture mini-repo, emit
# the watchdog pair from the committed brief, run one live advisor turn with
# a trap-triggering task, harvest the advisor transcripts, then score them
# against expected.json into results/report.json + results/scored-report.md.
#
# Scoring (src/validate.ts): a violation fixture is `keep` when >=1 advise
# note hits an expected keyword (case-insensitive), `retune` when it advised
# off-keyword, `drop` when silent; a clean fixture is `keep` when silent,
# `retune` when it advised. No transcript at all is `no-run` → exit 2, a
# harness failure distinct from advisor misses. Verdicts never set the exit
# code — the report is the product.
#
# Both omp invocations pass --session-dir with a per-fixture scratch dir:
# in the shared ~/.omp/agent/sessions tree the __advisor*.jsonl projections
# land only minutes after the process exits (observed live 2026-09-08,
# 1-8 min, flickering), while a custom session dir is written directly —
# transcript present within seconds of turn end. Each fixture's dir holds
# exactly one session, so harvest needs no newest-session disambiguation.
#
# Requires omp auth + a resolvable @slow chain. timeout 300 is mandatory
# (err-3: never leak a hung omp or a temp dir — the EXIT trap removes the
# scratch dirs). Per-fixture archives are cleared up front so a no-run
# fixture can never score against a previous run's transcripts.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
RESULTS="$HERE/results"
FIXTURES=(conc-map err-swallow data-drift build-gate clean-tidy clean-empty)

mkdir -p "$RESULTS"
rm -f "$RESULTS"/report.json "$RESULTS"/scored-report.md

tmp=""
sessions_root="$(mktemp -d /tmp/oma-validate-sessions-XXXX)"

cleanup() {
	if [ -n "$tmp" ]; then rm -rf "$tmp"; fi
	rm -rf "$sessions_root"
}
trap cleanup EXIT

for name in "${FIXTURES[@]}"; do
	tmp="$(mktemp -d /tmp/oma-validate-XXXX)"
	sessions_dir="$sessions_root/$name"
	mkdir -p "$sessions_dir"
	rm -f "$RESULTS/$name".advisor.*.jsonl
	cp -r "$HERE/$name/." "$tmp"/
	echo "== $name: emitting watchdog pair in $tmp"
	(cd "$tmp" && omp --session-dir "$sessions_dir" -e "$REPO/index.ts" -p "/oma emit")
	TASK="$(bun -e "import { readFileSync } from 'node:fs'; process.stdout.write(JSON.parse(readFileSync('$HERE/expected.json', 'utf8'))['$name'].task)")"
	echo "== $name: advisor turn (task: $TASK)"
	if (cd "$tmp" && timeout 300 omp --session-dir "$sessions_dir" -p --advisor --auto-approve "$TASK"); then
		:
	else
		echo "warn: $name advisor run exited nonzero"
	fi
	# Transcripts land with the session at turn end; the short retry only
	# covers a final-record flush running seconds behind process exit.
	copied=0
	deadline=$((SECONDS + 15))
	while [ "$copied" = 0 ] && [ "$SECONDS" -lt "$deadline" ]; do
		for f in "$sessions_dir"/*/__advisor*.jsonl; do
			if [ ! -s "$f" ]; then continue; fi
			base="$(basename "$f")"
			if [ "$base" = "__advisor.jsonl" ]; then
				slug="default"
			else
				slug="${base#__advisor.}"
				slug="${slug%.jsonl}"
			fi
			cp "$f" "$RESULTS/$name.advisor.$slug.jsonl"
			copied=1
		done
		if [ "$copied" = 0 ]; then sleep 2; fi
	done
	if [ "$copied" = 1 ]; then
		echo "== $name: transcripts archived to results/"
	else
		echo "warn: $name produced no advisor transcript (scored no-run)"
	fi
	rm -rf "$tmp"
	tmp=""
done

echo "== scoring archived transcripts"
status=0
bun -e "
	import { scoreFromResults } from '$REPO/src/validate.ts';
	const report = scoreFromResults('$HERE/expected.json', '$RESULTS', '$RESULTS/report.json', '$RESULTS/scored-report.md');
	if (report.fixtures.some((f) => f.status === 'no-run')) process.exit(2);
" || status=$?
exit $status
