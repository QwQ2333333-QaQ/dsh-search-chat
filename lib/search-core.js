/**
 * Pure matching, snippet and ordering helpers.
 *
 * v1 deliberately uses literal character matching only: phrase containment or
 * whitespace-separated term containment. No corpus, no embeddings, no network.
 */

const SNIPPET_RADIUS = 70
const TEXT_CAP = 20000

/** Lowercase without changing the caller's string. */
function fold(text) {
  return text.toLowerCase()
}

/** Split a query into whitespace-separated terms (CJK without spaces stays one term). */
export function termsOf(query) {
  return query.split(/\s+/).filter((term) => term.length > 0)
}

/**
 * Decide whether `text` satisfies the query under one literal mode.
 * @param {string} text haystack.
 * @param {string} query normalized query.
 * @param {'phrase'|'all-terms'|'any-term'} mode literal mode.
 * @returns {{ ok: boolean, matchedTerms: string[], coverage: number }}
 */
export function matchText(text, query, mode) {
  const haystack = fold(text)
  const terms = termsOf(query).map(fold)
  const matched = terms.filter((term) => haystack.includes(term))
  const coverage = terms.length === 0 ? 0 : matched.length / terms.length
  if (mode === 'any-term') {
    return { ok: matched.length > 0, matchedTerms: matched, coverage }
  }
  if (mode === 'all-terms') {
    return { ok: terms.length > 0 && matched.length === terms.length, matchedTerms: matched, coverage }
  }
  const phrase = fold(query)
  return {
    ok: phrase.length > 0 && haystack.includes(phrase),
    matchedTerms: phrase.length > 0 && haystack.includes(phrase) ? [query] : matched,
    coverage: phrase.length > 0 && haystack.includes(phrase) ? 1 : coverage,
  }
}

/** Collapse whitespace runs so snippets stay single-line. */
function collapse(text) {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Extract a readable window around the first occurrence of the query (or the
 * first matched term), for list rendering.
 * @param {string} text full event text.
 * @param {string} query normalized query.
 * @param {string[]} matchedTerms folded terms already known to appear.
 * @returns {string} collapsed snippet with ellipses.
 */
export function makeSnippet(text, query, matchedTerms = []) {
  const source = text.length > TEXT_CAP ? text.slice(0, TEXT_CAP) : text
  const lower = fold(source)
  const needles = [fold(query), ...matchedTerms.map(fold)].filter((needle) => needle.length > 0)
  let index = -1
  for (const needle of needles) {
    index = lower.indexOf(needle)
    if (index >= 0) break
  }
  if (index < 0) return collapse(source.slice(0, SNIPPET_RADIUS * 2)) + '…'
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(source.length, index + (needles[0]?.length ?? 0) + SNIPPET_RADIUS)
  const body = collapse(source.slice(start, end))
  return `${start > 0 ? '…' : ''}${body}${end < source.length ? '…' : ''}`
}

/** Concatenate text blocks from a message record (`content` array or string). */
function messageText(message) {
  if (!message || typeof message !== 'object') return ''
  const content = message.content ?? message.text
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/** Extract searchable text from one Host session event. */
export function eventText(event) {
  if (!event || typeof event !== 'object') return ''
  const data = event.data ?? {}
  let text = ''
  switch (event.type) {
    case 'user/message':
    case 'assistant/message':
    case 'developer/message':
    case 'system/message':
    case 'tool/result':
      text = messageText(data.message)
      break
    case 'tool/call':
      text = `${data.name ?? ''}\n${data.arguments ?? ''}`
      break
    case 'session/title':
      text = typeof data.title === 'string' ? data.title : ''
      break
    case 'step/start':
    case 'step/end':
    case 'turn/start':
    case 'turn/end':
      text = ''
      break
    default: {
      try {
        text = JSON.stringify(data)
      } catch {
        text = ''
      }
    }
  }
  if (text === '' && event.type !== 'turn/start' && event.type !== 'turn/end') {
    try {
      text = JSON.stringify(data)
    } catch {
      text = ''
    }
  }
  return text.length > TEXT_CAP ? text.slice(0, TEXT_CAP) : text
}

/** Map an event type to a coarse role for list display. */
export function roleOf(type) {
  if (type === 'user/message') return 'user'
  if (type === 'assistant/message') return 'assistant'
  if (type === 'tool/call' || type === 'tool/result') return 'tool'
  if (type === 'developer/message' || type === 'system/message') return 'system'
  return 'meta'
}

/** Read the Agent turn/step carried by one event, when it has them. */
export function turnOf(event) {
  const data = event?.data ?? {}
  const turn = typeof data.turn === 'number' ? data.turn : undefined
  const step = typeof data.step === 'number' ? data.step : undefined
  return { turn, step }
}

/**
 * Deduplicate hits by `sessionId:seq`, keeping the best literal score.
 * @param {Array<object>} hits candidate hits.
 * @returns {object[]} unique hits.
 */
export function dedupe(hits) {
  const seen = new Map()
  for (const hit of hits) {
    const key = `${hit.sessionId}:${hit.seq}`
    const previous = seen.get(key)
    if (previous === undefined || hit.score > previous.score) seen.set(key, hit)
  }
  return [...seen.values()]
}

/** Literal score used only as a tie-breaker; display order stays time-based. */
export function scoreOf(phrase, coverage) {
  return (phrase ? 2 : 0) + coverage
}

/** Sort by event time, keeping phrase matches ahead of equal timestamps. */
export function sortHits(hits, order) {
  const direction = order === 'asc' ? 1 : -1
  return [...hits].sort((left, right) => {
    if (left.time !== right.time) return (left.time - right.time) * direction
    if (left.score !== right.score) return right.score - left.score
    return (left.seq - right.seq) * direction
  })
}

/**
 * Slice one sorted list for one page.
 * @returns {{ items: object[], nextCursor: string|null, total: number }}
 */
export function paginate(items, limit, offset) {
  const start = Math.max(0, Math.min(items.length, offset))
  const slice = items.slice(start, start + limit)
  const next = start + slice.length
  const encode = (value) => `o:${value}`
  return { items: slice, nextCursor: next < items.length ? encode(next) : null, total: items.length }
}
