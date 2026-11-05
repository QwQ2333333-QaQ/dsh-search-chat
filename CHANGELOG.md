# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-05

### Added

- Right-sidebar tab `dsh-search-chat` plus a guide-page entry.
- Literal search across all workspaces over the official `sessionQuery`
  service: phrase / all-terms / any-term matching, with index-assisted
  candidates, per-hit literal verification, and a literal scan fallback.
- Time-ordered results with day grouping, pagination, snippet highlighting,
  and source badges (index vs scan).
- Click-to-jump: opens the session, loads history through the hit sequence,
  resolves the Agent turn lazily (one `turn` read at click time), scrolls to the
  message and flashes a highlight, with explicit failure messages.
- Loopback-only host routes with cross-site/Origin rejection; no credentials,
  no telemetry, no query logging.
- zh/en UI copy, node:test unit tests, package validation script, CI workflow,
  API notes and roadmap.
