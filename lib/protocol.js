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
})

/** Bounds shared by both halves; the Host re-clamps every request. */
export const LIMITS = Object.freeze({
  queryMaxLength: 200,
  limitDefault: 40,
  limitMax: 100,
  scanSessionMax: 80,
  sessionListMax: 400,
  contextBefore: 2,
  contextAfter: 2,
  bodyMaxBytes: 64 * 1024,
})

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
