# Roadmap

## 0.1.x — literal search MVP (current)

- Right-sidebar tab + guide entry.
- Literal phrase / all-terms / any-term matching across every workspace.
- Index-assisted search with literal verification and a literal scan fallback.
- Time-ordered results, pagination, click-to-jump with highlight.
- zh/en copy, tests, docs.

## 0.2.0 — appearance controls (current)

- Configurable keyword highlight (background/text/bold, automatic contrast).
- Configurable panel background color + opacity and panel text color.
- Presets (default / high contrast / soft), reset, and Host-persisted settings.
- Default highlight changed to a high-contrast amber mark.

## 0.3.0 — search scope and date windows (current)

- Configurable hits per session, scanned sessions, and results per page.
- Date search with a ±N-day window (0/1/3/7), pushed down as official
  `time` / `created-at` filters; sessions created after the window are pruned.
- `effective` echo in responses and new `/status.limits` bounds.
- Settings file upgraded to v2 with a `search` section.

## 0.4.0 — timeline browsing, history and cache (current)

- Date-centred timeline: ±3 days initial window, bidirectional extension.
- Custom month calendar with unavailable days disabled.
- Search history with hover delete and two-step clear.
- Local result cache (memory + atomic JSON files, corpus signature, LRU).
- Settings v3 (theme only); fixed search caps again.

## 0.5.0 — filters and saved searches

- Filter by role (user/assistant/tool), session, workspace, model.
- Search within one session from the current session header.
- Saved queries and recent searches.
- Export results as Markdown/JSON.

## 0.6.0 — optional semantic search (opt-in, off by default)

- Local embedding backend or an operator-configured HTTP endpoint.
- Chunked index stored under `$DSH_HOME/dsh-search-chat/` with incremental updates.
- Semantic results never replace literal results; they appear as a separate
  ranking band and fall back to literal search when unavailable.
- No hidden network calls: every endpoint is explicit plugin configuration.
