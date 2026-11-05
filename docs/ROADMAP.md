# Roadmap

## 0.1.x — literal search MVP (current)

- Right-sidebar tab + guide entry.
- Literal phrase / all-terms / any-term matching across every workspace.
- Index-assisted search with literal verification and a literal scan fallback.
- Time-ordered results, pagination, click-to-jump with highlight.
- zh/en copy, tests, docs.

## 0.2.0 — filters and saved searches

- Filter by role (user/assistant/tool), date range, session, workspace, model.
- Search within one session from the current session header.
- Saved queries and recent searches (local storage only).
- Export results as Markdown/JSON.

## 0.3.0 — optional semantic search (opt-in, off by default)

- Local embedding backend or an operator-configured HTTP endpoint.
- Chunked index stored under `$DSH_HOME/dsh-search-chat/` with incremental updates.
- Semantic results never replace literal results; they appear as a separate
  ranking band and fall back to literal search when unavailable.
- No hidden network calls: every endpoint is explicit plugin configuration.
