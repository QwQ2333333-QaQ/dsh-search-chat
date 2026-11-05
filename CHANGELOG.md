# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-11-05

### Added

- Search-scope controls in the settings panel: hits per session, sessions to
  scan, and results per page; persisted with the other settings.
- Date-range search: pick a date and an optional ±N-day window (0/1/3/7, default
  3); the window is pushed down as official `time`/`created-at` filters, so
  sessions created after the window are pruned before scanning.
- Host request fields `perSession`, `scanSessions`, `timeFrom`, `timeTo`, and an
  `effective` echo in every response; `/status.limits` reports the new bounds.
- Settings file upgraded to version 2 with a `search` section; v1 files are read
  and upgraded on the next save.

### Fixed

- Index-candidate search now sends the official `sessionFilters` /
  `eventFilters` fields (previously it sent `filters`, so the index path rarely
  contributed candidates).

### Changed

- The hard-coded per-session/per-scan caps are now request-scoped with clamped
  bounds; defaults remain 8 hits/session and 80 scanned sessions.

## [0.2.0] - 2026-11-05

### Added

- Appearance settings inside the search panel (gear button): highlight
  background/text color with automatic contrast text, keyword bold toggle,
  whole-panel background color with opacity, and panel text color.
- Presets `default` / `contrast` / `soft`, plus one-click reset to defaults.
- Settings persist through the Host at `$DSH_HOME/.dsh-search-chat.json`
  (validated values, atomic write) and survive page reloads and plugin
  reinstalls.
- Host routes `GET/POST /dsh-search-chat/settings`.

### Changed

- Default keyword highlight is now a high-contrast amber mark
  (`#ffd54f` + near-black text + bold + 1px outline) instead of a faint
  translucent blue, so it stays readable over skin/wallpaper backgrounds.
- Panel background remains transparent and panel text inherits the theme by
  default, matching the previous look.

### Tests

- Added settings sanitizer/persistence tests; manifest now checks the
  appearance contract and settings wiring.

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
