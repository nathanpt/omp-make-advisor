import { YAML } from "bun";
import type { WatchdogConfigDoc } from "@oh-my-pi/pi-coding-agent/advisor/config";

// Vendored verbatim from @oh-my-pi/pi-coding-agent src/advisor/config.ts
// (18.1.12): appendYamlString + serializeWatchdogConfig. omp's extension
// loader resolves bare specifiers that are not in its bundled-module map
// from the SESSION cwd, so importing the advisor/config subpath at runtime
// breaks whenever omp loads this extension from another directory — which is
// the normal installed-plugin case (verified omp 18.1.14, headless from a
// foreign cwd: "Cannot find package '@oh-my-pi/omptype'"). Scalar quoting
// still delegates to Bun's YAML encoder, the exact function OMP itself
// calls, and test/emit.test.ts pins this copy byte-for-byte against OMP's
// real serializeWatchdogConfig across the literal-block-scalar edge cases,
// so any upstream format change fails the suite instead of drifting. The
// only intentional divergence is the export name — serializeAdvisorConfig
// (upstream: serializeWatchdogConfig) — so the equivalence test can name
// both sides unambiguously.
//
// Multiline strings render as literal block scalars; an empty doc
// serializes to "" (OMP deletes the file for an empty doc — callers never
// emit one).

function appendYamlString(lines: string[], indent: string, key: string, value: string): void {
	const hasSignificantLeadingWhitespace = value.split("\n").some(line => /^[ \t]/.test(line));
	if (!value.includes("\n") || hasSignificantLeadingWhitespace) {
		lines.push(`${indent}${key}: ${YAML.stringify(value)}`);
		return;
	}
	const normalized = value.replaceAll("\r\n", "\n");
	let trailingNewlines = 0;
	for (let index = normalized.length - 1; index >= 0 && normalized[index] === "\n"; index--) {
		trailingNewlines++;
	}
	const chomp = trailingNewlines === 0 ? "|2-" : trailingNewlines === 1 ? "|2" : "|2+";
	const body = trailingNewlines === 0 ? normalized : normalized.slice(0, -trailingNewlines);
	lines.push(`${indent}${key}: ${chomp}`);
	for (const line of body.split("\n")) {
		lines.push(`${indent}  ${line}`);
	}
	for (let index = 1; index < trailingNewlines; index++) {
		lines.push(`${indent}  `);
	}
}

export function serializeAdvisorConfig(doc: WatchdogConfigDoc): string {
	const lines: string[] = [];
	if (doc.instructions?.trim()) appendYamlString(lines, "", "instructions", doc.instructions);
	if (doc.advisors.length > 0) {
		lines.push("advisors:");
		for (const advisor of doc.advisors) {
			lines.push(`  - name: ${YAML.stringify(advisor.name)}`);
			if (advisor.model?.trim()) lines.push(`    model: ${YAML.stringify(advisor.model)}`);
			if (advisor.tools !== undefined) {
				if (advisor.tools.length === 0) {
					lines.push("    tools: []");
				} else {
					lines.push("    tools:");
					for (const tool of advisor.tools) {
						lines.push(`      - ${YAML.stringify(tool)}`);
					}
				}
			}
			if (advisor.instructions?.trim()) {
				appendYamlString(lines, "    ", "instructions", advisor.instructions);
			}
			if (advisor.enabled !== undefined) lines.push(`    enabled: ${advisor.enabled}`);
		}
	}
	return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
