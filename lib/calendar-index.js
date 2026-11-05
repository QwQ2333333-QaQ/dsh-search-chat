/**
 * Day availability derived from local session event times: used by the date
 * picker to disable days without conversations and by the timeline to decide
 * whether older/newer windows exist. Memory-cached for five minutes.
 */

import { LIMITS } from './protocol.js'

const TTL_MS = 5 * 60_000
const DAY_MS = 86_400_000

/** Local `YYYY-MM-DD` for one epoch millisecond. */
export function dayKey(time) {
  const date = new Date(time)
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight for one `YYYY-MM-DD`; null when invalid. */
export function dayStart(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
  if (match === null) return null
  const time = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime()
  return Number.isFinite(time) ? time : null
}

/** Shift a local date key by whole days (DST-safe through local Date fields). */
export function shiftDayKey(key, offsetDays) {
  const start = dayStart(key)
  if (start === null) return null
  const date = new Date(start)
  date.setDate(date.getDate() + offsetDays)
  return dayKey(date.getTime())
}

/** Inclusive epoch window for `anchor ± radiusDays` local days. */
export function windowAround(anchorKey, radiusDays) {
  const start = dayStart(anchorKey)
  if (start === null) return null
  return {
    from: start - radiusDays * DAY_MS,
    to: start + (radiusDays + 1) * DAY_MS - 1,
  }
}

/** Extend one window by `stepDays` toward `direction` (older/newer). */
export function shiftWindow(window, direction, stepDays) {
  if (direction === 'older') {
    const to = new Date(window.from - 1)
    const from = new Date(window.from)
    from.setDate(from.getDate() - stepDays)
    return { from: from.getTime(), to: to.getTime() }
  }
  const from = new Date(window.to + 1)
  const to = new Date(window.to + 1)
  to.setDate(to.getDate() + stepDays)
  return { from: from.getTime(), to: to.getTime() - 1 }
}

/** Create the in-memory calendar index. */
export function createCalendarIndex({ getSessionQuery, now = Date.now } = {}) {
  let cache = { at: 0, days: new Map() }

  async function load() {
    if (now() - cache.at < TTL_MS && cache.days.size > 0) return cache.days
    const query = getSessionQuery()
    if (query === undefined) return cache.days
    const days = new Map()
    try {
      const records = (await query.listSessions()).slice(0, LIMITS.scanSessionMax)
      for (let index = 0; index < records.length; index += 8) {
        await Promise.all(records.slice(index, index + 8).map(async (record) => {
          try {
            for (const event of await query.listEvents(record.header.id) ?? []) {
              if (typeof event?.time !== 'number') continue
              const key = dayKey(event.time)
              days.set(key, (days.get(key) ?? 0) + 1)
            }
          } catch {
            // A broken session contributes no days.
          }
        }))
      }
    } catch {
      // Keep the previous snapshot on listing failure.
    }
    cache = { at: now(), days }
    return days
  }

  async function month(monthKey) {
    const map = await load()
    const prefix = typeof monthKey === 'string' && /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : dayKey(now()).slice(0, 7)
    const result = {}
    for (const [day, count] of map) {
      if (day.startsWith(`${prefix}-`)) result[day] = count
    }
    return { month: prefix, days: result, available: map.size > 0 }
  }

  async function bounds() {
    const keys = [...(await load()).keys()].sort()
    return { first: keys[0] ?? null, last: keys[keys.length - 1] ?? null }
  }

  return { month, bounds, dayKey }
}
