# DSH extension points used by this plugin (verified 2026-11-05, DSH 0.2.2-rc.1)

Everything below was verified against the live Host/Client inspectors and the
public package sources on `github.com/deepseek-ai/deepseek-harness` (master) and
npm (`@deepseek-ai/*@0.2.2-rc.1`).

## Host: session query service

`ctx.get('sessionQuery')` (optional; provided by `dsh-session-query-sqlite`):

- `listSessions(): Promise<SessionRecord[]>`
- `searchSessions({ query, filters?, limit?, cursor? }): Promise<SessionSearchPage<SessionSearchHit>>`
- `searchEvents({ sessionId, query, filters?, limit?, cursor? }): Promise<SessionEventSearchPage>`
- `filterEvents(sessionId, [{ kind: 'text', text }]): Promise<SessionEventSearchDocument[]>`
- `readEvent({ sessionId, seq, before?, after? }): Promise<SessionEventWindow>`
- `readTitleSnapshots(ids): Promise<SessionTitleObservationResult[]>`

`filterEvents`' `{ kind: 'text' }` predicate is documented as a **literal-text**
filter, which is why this plugin can guarantee character matching even if the
full-text index tokenizes CJK poorly.

Optional: `ctx.get('workspaceRegistry').list()` maps workspace paths to titles.

## Host: HTTP routes

`ctx.webServer.register({ kind: 'exact', path, handler(req, res) })` returns a
disposer. Handlers own the full response. This plugin registers five exact
paths under `/dsh-search-chat/*` (`status`, `sessions`, `search`, `context`,
`turn`) and gates each request itself.

## Client: right sidebar tabs

Public, plugin-extensible; the same path used by `dsh-plugin-wallpaper-engine`:

```js
ctx.get('sidebarRightTabs').register({
  id, kind, keepMounted, title: () => string, guide: [{ id, order, title, description, icon }],
})
ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Component)
ctx.get('sidebarRight').openTab(kind, { params? })
```

Both services are optional at runtime: resolve them with `ctx.get` (poll until
ready), never as hard object-level `inject`, so a host without the right
sidebar leaves the plugin inert instead of parking it.

## Client: opening sessions and loading history

- `ctx.get('uiWorkspace').openSession(sessionId)` — select the session.
- `ctx.get('sessions').binding(sessionId)` — `{ session }`; `session.loadThrough(seq)` ensures the target event is in the rendered window.

## Client: jumping to a message (no public API)

DSH 0.2.2's Chat view exposes turn-level navigation only to its own UI. There is
no service to focus an arbitrary event. This plugin therefore uses the product's
internal row attributes, isolated in `lib/client.js`:

- `[data-chat-flow]` — the chat column.
- `[data-chat-node-key]` — one rendered chat row.
- `[data-chat-turn="<n>"]` — rows of one Agent turn.

Jump order: text match inside a row (using the hit snippet) → turn selector →
explicit failure message. If DSH changes these attributes, update only
`findMessageNode()`; everything else stays intact.

## Client: module contract

`window.__ModuleLoader__.load({ id, factory(require) { ... return { inject, apply } } })`,
React from `require('react')`, package exports `./client`, manifest
`dsh.client = { platform: 'web', immediately: true, inject: [...] }`.

## Compatibility range

`engines.dsh: ">=0.2.2-rc.1"`. Verified on the Windows desktop client
0.2.2-rc.1; the route/tab APIs are expected to stay stable across 0.2.2.x, while
the jump selectors carry the explicit upgrade risk documented above.
