# Decisions

MADR-style decision records for omp-make-advisor. `docs/design-docs/DESIGN.md` §12 holds the
current decision defaults; an ADR is required when a change would constrain future work
(architecture, interfaces, data, security, deployment, dependencies, major user-visible behavior)
or deviate from a §12 default.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-extension-plus-skill-over-standalone-binary.md) | Ship as an OMP extension + skill, not a standalone binary | accepted |

## Rules

- File names: `NNNN-short-title-with-dashes.md`, numbered sequentially from `0001`.
- One decision per ADR. Status is one of: `proposed`, `accepted`, `deprecated`,
  `superseded by NNNN`.
- Never rewrite or delete an accepted ADR. To change a decision, write a new ADR that supersedes
  it, update the old one's status line, and update this index.
- Link every new ADR from DESIGN.md (the §12 table or Sources).
- Record confirmation evidence (command, observed result, or pointer) in the ADR itself.

## Template

```markdown
# ADR-NNNN — <title>

- Status: proposed
- Date: YYYY-MM-DD

## Context and problem

## Decision drivers

## Considered options

## Decision outcome

## Consequences

## Confirmation evidence
```
