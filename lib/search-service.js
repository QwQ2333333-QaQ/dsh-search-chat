/**
 * Host-side search orchestration over the official `sessionQuery` service.
 *
 * Strategy (all literal, no corpus):
 * 1. Ask the index for candidate sessions (fast), expanding each candidate's
 *    events, then re-read every hit's full event text and verify it literally.
 * 2. If the index yields nothing, scan the scoped sessions with
 *    `filterEvents({ kind: 'text' })`, whose own contract is literal text.
 * 3. Cache the complete sorted hit list briefly and paginate from it.
 */

import * as core from './search-core.js'
import { LIMITS, clampLimit, normalizeMatch, normalizeOrder, normalizeQuery } from './protocol.js'

const PLUGIN_VERSION = '0.1.0'
const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 120
const CONCURRENCY = 8
const VERIFY_PER_SESSION = 8
const TITLE_TTL_MS = 60_000

function errorWith(statusCode, code) {
  return Object.assign(new Error(code), { statusCode, code })
}

/** Run one async mapper over items with a bounded concurrency. */
async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = await mapper(items[index], index)
      } catch {
        results[index] = []
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results.flat()
}

/** Basename of a Windows or POSIX path. */
function basename(path) {
  const text = String(path ?? '').replace(/[\\/]+$/, '')
  const parts = text.split(/[\\/]/)
  return parts.at(-1) ?? ''
}

/** Read the Agent turn of one event, falling back to the nearest earlier event. */
function turnFromWindow(window, fallback) {
  const target = window?.target ?? fallback
  const direct = core.turnOf(target)
  if (direct.turn !== undefined) return direct
  const events = Array.isArray(window?.events) ? [...window.events].reverse() : []
  for (const event of events) {
    const turn = core.turnOf(event)
    if (turn.turn !== undefined) return turn
  }
  return direct
}

/**
 * Create the search service over injected Host dependencies.
 * @param {object} deps
 * @param {() => any} deps.getSessionQuery optional `ctx.get('sessionQuery')`.
 * @param {() => any} deps.getWorkspaceRegistry optional `ctx.get('workspaceRegistry')`.
 * @param {(error: unknown) => void} [deps.report] diagnostics sink.
 * @returns service face used by the routes and covered by tests.
 */
export function createSearchService({ getSessionQuery, getWorkspaceRegistry, report = () => {} }) {
  const hitCache = new Map()
  const titleCache = new Map()
  const docsCache = new Map()
  const workspaceCache = { at: 0, map: new Map() }

  function sessionQuery() {
    try {
      return getSessionQuery() ?? undefined
    } catch {
      return undefined
    }
  }

  async function listRecords() {
    const query = sessionQuery()
    if (query === undefined) throw errorWith(503, 'NO_SESSION_QUERY')
    const records = await query.listSessions()
    return records.filter((record) => record?.header?.formatStatus !== 'migration-required')
  }

  async function titlesOf(ids) {
    const query = sessionQuery()
    const now = Date.now()
    const missing = []
    const titles = new Map()
    for (const id of ids) {
      const cached = titleCache.get(id)
      if (cached !== undefined && now - cached.at < TITLE_TTL_MS) titles.set(id, cached.title)
      else missing.push(id)
    }
    if (missing.length > 0 && query !== undefined) {
      try {
        const results = await query.readTitleSnapshots(missing)
        for (const result of results) {
          if (result?.status !== 'fulfilled') continue
          const title = result.value?.title?.title ?? null
          titleCache.set(result.sessionId, { at: now, title })
          titles.set(result.sessionId, title)
        }
      } catch (error) {
        report(error)
      }
    }
    return titles
  }

  async function workspaceTitles() {
    const now = Date.now()
    if (now - workspaceCache.at < TITLE_TTL_MS) return workspaceCache.map
    const map = new Map()
    try {
      const registry = getWorkspaceRegistry?.() ?? undefined
      for (const workspace of registry?.list?.() ?? []) {
        const path = workspace?.path ?? workspace?.directory
        if (typeof path === 'string') map.set(path, workspace?.title ?? basename(path))
      }
    } catch (error) {
      report(error)
    }
    workspaceCache.at = now
    workspaceCache.map = map
    return map
  }

  function workspaceTitleOf(cwd, workspaces) {
    if (workspaces.has(cwd)) return workspaces.get(cwd)
    return basename(cwd) || '未标记工作区'
  }

  async function indexCandidates(terms, scoped, cwd) {
    const query = sessionQuery()
    const byId = new Map()
    for (const term of terms.slice(0, 6)) {
      let page
      try {
        page = await query.searchSessions({
          query: term,
          limit: Math.min(60, Math.max(10, scoped.length)),
          ...(cwd === undefined ? {} : { filters: [{ kind: 'cwd', values: [cwd] }] }),
        })
      } catch (error) {
        report(error)
        continue
      }
      for (const item of page?.items ?? []) {
        const id = item?.header?.id
        if (typeof id !== 'string') continue
        byId.set(id, (byId.get(id) ?? 0) + 1)
      }
    }
    return [...byId.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id]) => scoped.find((record) => record.header.id === id))
      .filter((record) => record !== undefined)
  }

  async function eventsOfSession(record, terms) {
    const query = sessionQuery()
    const sessionId = record.header.id
    const seqs = new Map()
    const now = Date.now()
    for (const term of terms.slice(0, 6)) {
      const cacheKey = `${sessionId}\u0000${term}`
      const cached = docsCache.get(cacheKey)
      if (cached !== undefined && now - cached.at < CACHE_TTL_MS) {
        for (const [seq, doc] of cached.docs) seqs.set(seq, doc)
        continue
      }
      const docs = []
      try {
        const found = await query.filterEvents(sessionId, [{ kind: 'text', text: term }])
        for (const doc of found ?? []) {
          if (typeof doc?.seq === 'number') docs.push(doc)
        }
      } catch (error) {
        report(error)
      }
      if (docsCache.size > 4000) docsCache.clear()
      docsCache.set(cacheKey, { at: now, docs: docs.map((doc) => [doc.seq, doc]) })
      for (const doc of docs) seqs.set(doc.seq, doc)
    }
    return [...seqs.values()].slice(0, VERIFY_PER_SESSION).map((doc) => ({ ...doc, sessionId }))
  }

  async function verifyDocuments(record, documents, queryText, match, source) {
    const hits = []
    for (const document of documents) {
      const text = typeof document.text === 'string' ? document.text : ''
      if (text === '') continue
      const verdict = core.matchText(text, queryText, match)
      if (!verdict.ok) continue
      hits.push({
        sessionId: record.header.id,
        seq: document.seq,
        time: document.time,
        type: document.type,
        role: core.roleOf(document.type),
        // Resolved lazily at jump time through the `turn` route, which keeps
        // scanning to one literal pass instead of reading every hit again.
        turn: null,
        step: null,
        snippet: core.makeSnippet(text, queryText, verdict.matchedTerms),
        matchedTerms: verdict.matchedTerms,
        score: core.scoreOf(verdict.coverage === 1, verdict.coverage),
        source,
      })
    }
    return hits
  }

  async function collect(scoped, queryText, match, cwd) {
    const terms = match === 'phrase' ? [queryText] : core.termsOf(queryText)
    const effectiveTerms = terms.length === 0 ? [queryText] : terms
    let hits = []
    let source = 'index'

    const candidates = await indexCandidates(effectiveTerms, scoped, cwd)
    if (candidates.length > 0) {
      const expanded = await mapLimit(candidates.slice(0, 40), CONCURRENCY, async (record) => {
        const docs = await eventsOfSession(record, effectiveTerms)
        return verifyDocuments(record, docs, queryText, match, 'index')
      })
      hits = expanded
    }

    if (hits.length === 0) {
      source = 'scan'
      const scanned = scoped.slice(0, LIMITS.scanSessionMax)
      const expanded = await mapLimit(scanned, CONCURRENCY, async (record) => {
        const docs = await eventsOfSession(record, effectiveTerms)
        return verifyDocuments(record, docs, queryText, match, 'scan')
      })
      hits = expanded
    }

    return { hits: core.dedupe(hits), source, truncated: scoped.length > LIMITS.scanSessionMax }
  }

  async function decorate(hits, cwdById) {
    const titles = await titlesOf([...new Set(hits.map((hit) => hit.sessionId))])
    const workspaces = await workspaceTitles()
    return hits.map((hit) => {
      const cwd = cwdById.get(hit.sessionId) ?? ''
      return {
        ...hit,
        sessionTitle: titles.get(hit.sessionId) ?? null,
        cwd,
        workspaceTitle: workspaceTitleOf(cwd, workspaces),
      }
    })
  }

  async function search(body) {
    const query = normalizeQuery(body?.query)
    if (query === '') throw Object.assign(errorWith(400, 'BAD_REQUEST'), { message: 'query is required' })
    const match = normalizeMatch(body?.match)
    const order = normalizeOrder(body?.order)
    const limit = clampLimit(body?.limit)
    const offset = Number.isInteger(body?.offset) ? Math.max(0, body.offset) : 0
    const cwd = typeof body?.cwd === 'string' && body.cwd.length > 0 ? body.cwd : undefined
    const key = JSON.stringify([query, match, order, cwd ?? ''])
    const cached = hitCache.get(key)
    const now = Date.now()
    let entry = cached !== undefined && now - cached.at < CACHE_TTL_MS ? cached : undefined
    if (entry === undefined) {
      const started = Date.now()
      const records = await listRecords()
      const scoped = cwd === undefined ? records : records.filter((record) => record.header.cwd === cwd)
      const { hits, source, truncated } = await collect(scoped, query, match, cwd)
      const cwdById = new Map(records.map((record) => [record.header.id, record.header.cwd ?? '']))
      const decorated = await decorate(hits, cwdById)
      const sorted = core.sortHits(decorated, order)
      entry = {
        at: now,
        items: sorted.slice(0, 500),
        source,
        truncated,
        total: sorted.length,
        sessions: scoped.length,
        tookMs: Date.now() - started,
      }
      if (hitCache.size > CACHE_MAX_ENTRIES) hitCache.clear()
      hitCache.set(key, entry)
    }
    const start = Math.min(offset, entry.items.length)
    const items = entry.items.slice(start, start + limit)
    return {
      ok: true,
      query,
      match,
      order,
      source: entry.source,
      truncated: entry.truncated,
      total: entry.total,
      sessions: entry.sessions,
      tookMs: entry.tookMs,
      nextOffset: start + items.length < entry.items.length ? start + items.length : null,
      items,
    }
  }

  async function sessions(body) {
    const records = await listRecords()
    const limit = clampLimit(body?.limit, 200)
    const cwd = typeof body?.cwd === 'string' && body.cwd.length > 0 ? body.cwd : undefined
    const scoped = (cwd === undefined ? records : records.filter((record) => record.header.cwd === cwd)).slice(0, LIMITS.sessionListMax)
    const titles = await titlesOf(scoped.map((record) => record.header.id))
    const workspaces = await workspaceTitles()
    return {
      ok: true,
      total: records.length,
      items: scoped.slice(0, limit).map((record) => ({
        sessionId: record.header.id,
        title: titles.get(record.header.id) ?? null,
        cwd: record.header.cwd ?? '',
        workspaceTitle: workspaceTitleOf(record.header.cwd ?? '', workspaces),
        createdAt: record.header.createdAt ?? null,
        live: record.live === true,
      })),
    }
  }

  async function context(body) {
    const sessionId = body?.sessionId
    const seq = Number(body?.seq)
    if (typeof sessionId !== 'string' || !Number.isInteger(seq)) {
      throw Object.assign(errorWith(400, 'BAD_REQUEST'), { message: 'sessionId and seq are required' })
    }
    const query = sessionQuery()
    if (query === undefined) throw errorWith(503, 'NO_SESSION_QUERY')
    let window
    try {
      window = await query.readEvent({
        sessionId,
        seq,
        before: LIMITS.contextBefore,
        after: LIMITS.contextAfter,
      })
    } catch (error) {
      report(error)
      throw Object.assign(errorWith(404, 'NOT_FOUND'), { message: 'event not found' })
    }
    const listed = Array.isArray(window?.events) ? window.events : []
    const target = window?.target
    const merged = target !== undefined && !listed.some((event) => event.seq === target.seq)
      ? [...listed, target]
      : listed
    const events = [...merged].sort((left, right) => left.seq - right.seq).map((event) => {
      const turn = core.turnOf(event)
      return {
        seq: event.seq,
        type: event.type,
        role: core.roleOf(event.type),
        time: event.time,
        turn: turn.turn ?? null,
        step: turn.step ?? null,
        text: core.eventText(event),
      }
    })
    return { ok: true, sessionId, events }
  }

  async function turn(body) {
    const sessionId = body?.sessionId
    const seq = Number(body?.seq)
    if (typeof sessionId !== 'string' || !Number.isInteger(seq)) {
      throw Object.assign(errorWith(400, 'BAD_REQUEST'), { message: 'sessionId and seq are required' })
    }
    const query = sessionQuery()
    if (query === undefined) throw errorWith(503, 'NO_SESSION_QUERY')
    try {
      const window = await query.readEvent({ sessionId, seq, before: 6, after: 0 })
      const result = turnFromWindow(window, window?.target)
      return { ok: true, sessionId, seq, turn: result.turn ?? null, step: result.step ?? null }
    } catch (error) {
      report(error)
      return { ok: true, sessionId, seq, turn: null, step: null }
    }
  }

  async function status() {
    const query = sessionQuery()
    let sessions = 0
    if (query !== undefined) {
      try {
        sessions = (await query.listSessions()).length
      } catch (error) {
        report(error)
      }
    }
    const workspaces = (await workspaceTitles()).size
    return {
      ok: true,
      version: PLUGIN_VERSION,
      sessionQuery: query !== undefined,
      sessions,
      workspaces,
      capabilities: { literal: true, semantic: false, scanFallback: true },
      limits: { limitMax: LIMITS.limitMax, queryMaxLength: LIMITS.queryMaxLength },
    }
  }

  return { status, sessions, search, context, turn }
}
