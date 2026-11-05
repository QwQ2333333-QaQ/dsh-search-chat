/**
 * Wire vocabulary shared by the host and client halves.
 * Everything here is plain data: no services, no Node or browser APIs.
 */

/** Route paths registered on the Host web server. */
export const ROUTES = Object.freeze({
  status: '/dsh-search-chat/status',
  sessions: '/dsh-search-chat/sessions',
  search: '/dsh-search-chat/search',
  context: '/dsh-search-chat/context',
  turn: '/dsh-search-chat/turn',
  settings: '/dsh-search-chat/settings',
  timeline: '/dsh-search-chat/timeline',
  calendar: '/dsh-search-chat/calendar',
  history: '/dsh-search-chat/history',
})

/** Fixed search caps plus timeline/calendar bounds. */
export const FIXED = Object.freeze({
  perSession: 8,
  scanSessions: 80,
  pageSize: 40,
})

/** Timeline-time browsing bounds. */
export const TIMELINE = Object.freeze({
  radiusDefault: 3,
  stepDefault: 3,
  windowItemMax: 500,
  sessionItemMax: 200,
  calendarSessionMax: 100,
  messageTypes: Object.freeze(['user/message', 'assistant/message']),
})

/** Bounds shared by both halves; the service re-clamps every request. */
export const LIMITS = Object.freeze({
  queryMaxLength: 200,
  limitDefault: 40,
  limitMax: 100,
  perSessionDefault: 8,
  perSessionMax: 20,
  scanSessionsDefault: 80,
  scanSessionsMin: 10,
  scanSessionsMax: 500,
  sessionListMax: 400,
  contextBefore: 2,
  contextAfter: 2,
  bodyMaxBytes: 64 * 1024,
  dateSpanMaxDays: 31,
})

const DAY_MS = 86_400_000

/** Literal matching modes. All three are character matching; none uses a corpus. */
export const MATCH_MODES = Object.freeze(['phrase', 'all-terms', 'any-term'])
export const DEFAULT_MATCH = 'phrase'

/** Errors the client renders as-is (message is already localized by the Host). */
export const ERROR_CODES = Object.freeze({
  badRequest: 'BAD_REQUEST',
  notLoopback: 'NOT_LOOPBACK',
  noSessionQuery: 'NO_SESSION_QUERY',
  unavailable: 'UNAVAILABLE',
  internal: 'INTERNAL',
})

/** Parse `limit` from an untrusted value. */
export function clampLimit(value, fallback = LIMITS.limitDefault) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(1, Math.min(LIMITS.limitMax, Math.trunc(number)))
}

/** Parse the per-session hit cap from an untrusted value. */
export function clampPerSession(value, fallback = LIMITS.perSessionDefault) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(1, Math.min(LIMITS.perSessionMax, Math.trunc(number)))
}

/** Parse the scanned-session cap from an untrusted value. */
export function clampScanSessions(value, fallback = LIMITS.scanSessionsDefault) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(LIMITS.scanSessionsMin, Math.min(LIMITS.scanSessionsMax, Math.trunc(number)))
}

/**
 * Normalize an optional inclusive event-time window.
 * @param {{ timeFrom?: unknown, timeTo?: unknown }} input request fields.
 * @returns {{ from: number, to: number } | null} the window, or null when absent/invalid/too wide.
 */
export function normalizeTimeRange(input) {
  const from = Number(input?.timeFrom)
  const to = Number(input?.timeTo)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  if (from > to) return null
  if (to - from > LIMITS.dateSpanMaxDays * DAY_MS) return null
  return { from: Math.trunc(from), to: Math.trunc(to) }
}

/** Normalize and bound one query string. */
export function normalizeQuery(value) {
  if (typeof value !== 'string') return ''
  return value.replace(/\u0000/g, '').trim().slice(0, LIMITS.queryMaxLength)
}

/** Normalize the requested matching mode. */
export function normalizeMatch(value) {
  return MATCH_MODES.includes(value) ? value : DEFAULT_MATCH
}

/** Normalize the requested sort order. */
export function normalizeOrder(value) {
  return value === 'asc' ? 'asc' : 'desc'
}

/** Encode a numeric offset cursor. */
export function encodeCursor(offset) {
  if (!Number.isFinite(offset) || offset <= 0) return null
  return `o:${Math.trunc(offset)}`
}

/** Decode a cursor produced by {@link encodeCursor}; malformed cursors start at zero. */
export function decodeCursor(value) {
  if (typeof value !== 'string') return 0
  const match = /^o:(\d{1,9})$/.exec(value)
  if (match === null) return 0
  return Number(match[1])
}
