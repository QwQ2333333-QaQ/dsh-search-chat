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
import {
  LIMITS, FIXED, TIMELINE, clampLimit, normalizeMatch, normalizeOrder, normalizeQuery,
} from './protocol.js'
import { createCacheStore } from './cache-store.js'
import { createHistoryStore } from './history-store.js'
import { createCalendarIndex, dayKey, dayStart, shiftWindow, windowAround } from './calendar-index.js'

const PLUGIN_VERSION = '0.4.0'
const CONCURRENCY = 8
const TITLE_TTL_MS = 60_000
const DOCS_TTL_MS = 60_000

/** Parse a bounded integer with a fallback default. */
function clampInt(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(number)))
}

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
  const titleCache = new Map()
  const docsCache = new Map()
  const workspaceCache = { at: 0, map: new Map() }
  const cacheStore = createCacheStore()
  const historyStore = createHistoryStore()
  const calendarIndex = createCalendarIndex({ getSessionQuery })

  /** Corpus signature: count + newest session creation time + today. */
  function corpusSignature(records) {
    const latest = records.reduce((max, record) => Math.max(max, Number(record?.header?.createdAt) || 0), 0)
    return `${records.length}:${latest}:${dayKey(Date.now())}`
  }

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

  async function indexCandidates(terms, scoped, cwd, options) {
    const query = sessionQuery()
    const byId = new Map()
    const sessionFilters = []
    if (cwd !== undefined) sessionFilters.push({ kind: 'cwd', values: [cwd] })
    if (options.timeRange !== null) sessionFilters.push({ kind: 'created-at', to: options.timeRange.to })
    const eventFilters = options.timeRange === null
      ? undefined
      : [{ kind: 'time', from: options.timeRange.from, to: options.timeRange.to }]
    for (const term of terms.slice(0, 6)) {
      let page
      try {
        page = await query.searchSessions({
          query: term,
          limit: Math.min(60, Math.max(10, scoped.length)),
          ...(sessionFilters.length > 0 ? { sessionFilters } : {}),
          ...(eventFilters === undefined ? {} : { eventFilters }),
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
  async function eventsOfSession(record, terms, options) {
    const query = sessionQuery()
    const sessionId = record.header.id
    const seqs = new Map()
    const now = Date.now()
    const timeRange = options.timeRange
    for (const term of terms.slice(0, 6)) {
      const cacheKey = `${sessionId}\u0000${term}\u0000${timeRange?.from ?? ''}\u0000${timeRange?.to ?? ''}`
      const cached = docsCache.get(cacheKey)
      if (cached !== undefined && now - cached.at < DOCS_TTL_MS) {
        for (const [seq, doc] of cached.docs) seqs.set(seq, doc)
        continue
      }
      const docs = []
      const filters = [{ kind: 'text', text: term }]
      if (timeRange !== null) filters.push({ kind: 'time', from: timeRange.from, to: timeRange.to })
      try {
        const found = await query.filterEvents(sessionId, filters)
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
    return [...seqs.values()].slice(0, options.perSession).map((doc) => ({ ...doc, sessionId }))
  }

  async function verifyDocuments(record, documents, queryText, match, source, timeRange) {
    const hits = []
    for (const document of documents) {
      if (timeRange !== null) {
        if (typeof document.time !== 'number') continue
        if (document.time < timeRange.from || document.time > timeRange.to) continue
      }
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

  async function collect(scoped, queryText, match, cwd, options) {
    const terms = match === 'phrase' ? [queryText] : core.termsOf(queryText)
    const effectiveTerms = terms.length === 0 ? [queryText] : terms
    let hits = []
    let source = 'index'

    const candidates = await indexCandidates(effectiveTerms, scoped, cwd, options)
    if (candidates.length > 0) {
      const expanded = await mapLimit(candidates.slice(0, Math.min(40, options.scanSessions)), CONCURRENCY, async (record) => {
        const docs = await eventsOfSession(record, effectiveTerms, options)
        return verifyDocuments(record, docs, queryText, match, 'index', options.timeRange)
      })
      hits = expanded
    }

    if (hits.length === 0) {
      source = 'scan'
      const scanned = scoped.slice(0, options.scanSessions)
      const expanded = await mapLimit(scanned, CONCURRENCY, async (record) => {
        const docs = await eventsOfSession(record, effectiveTerms, options)
        return verifyDocuments(record, docs, queryText, match, 'scan', options.timeRange)
      })
      hits = expanded
    }

    return { hits: core.dedupe(hits), source, truncated: scoped.length > options.scanSessions }
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
    const limit = clampLimit(body?.limit, FIXED.pageSize)
    const offset = Number.isInteger(body?.offset) ? Math.max(0, body.offset) : 0
    const cwd = typeof body?.cwd === 'string' && body.cwd.length > 0 ? body.cwd : undefined
    const records = await listRecords()
    const corpusSig = corpusSignature(records)
    const key = cacheStore.key(['search', query, match, order, cwd ?? ''])
    const cached = await cacheStore.get(key, corpusSig)
    let entry = cached
    if (entry === undefined) {
      const started = Date.now()
      const scoped = cwd === undefined ? records : records.filter((record) => record.header.cwd === cwd)
      const { hits, source, truncated } = await collect(scoped, query, match, cwd, {
        perSession: FIXED.perSession,
        scanSessions: FIXED.scanSessions,
        timeRange: null,
      })
      const cwdById = new Map(records.map((record) => [record.header.id, record.header.cwd ?? '']))
      const decorated = await decorate(hits, cwdById)
      const sorted = core.sortHits(decorated, order)
      entry = {
        items: sorted.slice(0, 500),
        source,
        truncated,
        total: sorted.length,
        sessions: scoped.length,
        tookMs: Date.now() - started,
      }
      await cacheStore.put(key, corpusSig, entry)
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
      cached: cached !== undefined,
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

  async function timeline(body) {
    const queryText = normalizeQuery(body?.query)
    const match = normalizeMatch(body?.match)
    const direction = ['initial', 'older', 'newer'].includes(body?.direction) ? body.direction : 'initial'
    let window
    if (direction === 'initial') {
      const radius = clampInt(body?.radiusDays, 0, 15, TIMELINE.radiusDefault)
      window = windowAround(typeof body?.anchorDate === 'string' ? body.anchorDate : '', radius)
      if (window === null) throw Object.assign(errorWith(400, 'BAD_REQUEST'), { message: 'anchorDate is invalid' })
    } else {
      const from = Number(body?.windowFrom)
      const to = Number(body?.windowTo)
      const step = clampInt(body?.stepDays, 1, 15, TIMELINE.stepDefault)
      if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
        throw Object.assign(errorWith(400, 'BAD_REQUEST'), { message: 'windowFrom/windowTo are invalid' })
      }
      window = shiftWindow({ from, to }, direction, step)
    }
    const query = sessionQuery()
    if (query === undefined) throw errorWith(503, 'NO_SESSION_QUERY')
    const records = await listRecords()
    const corpusSig = corpusSignature(records)
    const key = cacheStore.key(['timeline', queryText, match, window.from, window.to])
    const cached = await cacheStore.get(key, corpusSig)
    if (cached !== undefined) return { ...cached, cached: true }
    const started = Date.now()
    const scoped = records
      .filter((record) => {
        const created = record.header.createdAt
        return typeof created !== 'number' || created <= window.to
      })
      .slice(0, LIMITS.scanSessionMax)
    const scanned = await mapLimit(scoped, CONCURRENCY, async (record) => {
      const filters = [{ kind: 'time', from: window.from, to: window.to }]
      if (queryText !== '') filters.push({ kind: 'text', text: queryText })
      let documents
      try {
        documents = await query.filterEvents(record.header.id, filters)
      } catch (error) {
        report(error)
        return []
      }
      const hits = []
      for (const document of (documents ?? []).slice(0, TIMELINE.sessionItemMax)) {
        const text = typeof document.text === 'string' ? document.text : ''
        if (text === '') continue
        let verdict
        if (queryText === '') {
          if (!TIMELINE.messageTypes.includes(document.type)) continue
          verdict = { ok: true, matchedTerms: [], coverage: 0 }
        } else {
          verdict = core.matchText(text, queryText, match)
          if (!verdict.ok) continue
        }
        hits.push({
          sessionId: record.header.id,
          seq: document.seq,
          time: document.time,
          type: document.type,
          role: core.roleOf(document.type),
          turn: null,
          step: null,
          snippet: core.makeSnippet(text, queryText, verdict.matchedTerms),
          matchedTerms: verdict.matchedTerms,
          score: core.scoreOf(verdict.coverage === 1, verdict.coverage),
          source: 'timeline',
        })
      }
      return hits
    })
    const deduped = core.dedupe(scanned)
      .sort((left, right) => left.time - right.time || left.seq - right.seq)
      .slice(0, TIMELINE.windowItemMax)
    const cwdById = new Map(records.map((record) => [record.header.id, record.header.cwd ?? '']))
    const decorated = await decorate(deduped, cwdById)
    const bounds = await calendarIndex.bounds()
    const fromDay = dayKey(window.from)
    const toDay = dayKey(window.to)
    const payload = {
      ok: true,
      items: decorated,
      window: { from: window.from, to: window.to, fromDay, toDay },
      hasOlder: bounds.first !== null && bounds.first < fromDay,
      hasNewer: bounds.last !== null && bounds.last > toDay,
      corpusSig,
      tookMs: Date.now() - started,
    }
    const persist = window.to < dayStart(dayKey(Date.now()))
    await cacheStore.put(key, corpusSig, payload, { persist })
    return { ...payload, cached: false }
  }

  async function calendar(body) {
    const result = await calendarIndex.month(typeof body?.month === 'string' ? body.month : '')
    return { ok: true, month: result.month, days: result.days }
  }

  async function history(body) {
    const action = body?.action
    if (action === 'add') return { ok: true, items: await historyStore.add(body?.item) }
    if (action === 'delete') return { ok: true, items: await historyStore.remove(String(body?.id ?? '')) }
    if (action === 'clear') return { ok: true, items: await historyStore.clear() }
    return { ok: true, items: await historyStore.list() }
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
    const cache = await cacheStore.stats()
    let historyItems = 0
    try {
      historyItems = (await historyStore.list()).length
    } catch {
      historyItems = 0
    }
    return {
      ok: true,
      version: PLUGIN_VERSION,
      sessionQuery: query !== undefined,
      sessions,
      workspaces,
      capabilities: { literal: true, semantic: false, timeline: true, history: true, cache: true },
      fixed: { perSession: FIXED.perSession, scanSessions: FIXED.scanSessions, pageSize: FIXED.pageSize },
      timeline: { radiusDays: TIMELINE.radiusDefault, stepDays: TIMELINE.stepDefault },
      cache,
      history: { items: historyItems },
    }
  }

  return { status, sessions, search, context, turn, timeline, calendar, history }
}
