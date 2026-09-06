# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions begin once there
is a runnable artifact; until then changes accumulate under Unreleased.

## [Unreleased]

### Changed
- Design reframed from a standalone Rust binary to an OMP extension + skill
  (`docs/design-docs/DESIGN.md`; recorded as ADR-0001).

### Added
- Repository foundation: `README.md`, `AGENTS.md` router, `PROGRESS.md`, `ARCHITECTURE.md`
  (planned-state map), machine-readable feature contract (`docs/feature-list.json`, 9 features),
  decision layer (`docs/decisions/` with ADR-0001), exec-plan scaffolding
  (`docs/exec-plans/active/`, `docs/exec-plans/completed/`), source reading list
  (`docs/references/index.md`), and `init.sh` documentation-baseline check.
