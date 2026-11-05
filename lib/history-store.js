/**
 * Search history: recent queries with their matching mode and date context.
 * One JSON file, newest first, deduplicated by the full query shape.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pluginDataDir } from './paths.js'

const MAX_ITEMS = 100

function normalizeItem(input) {
  const query = typeof input?.query === 'string' ? input.query.trim().slice(0, 200) : ''
  if (query === '') return null
  return {
    query,
    match: ['phrase', 'all-terms', 'any-term'].includes(input?.match) ? input.match : 'phrase',
    mode: input?.mode === 'date' ? 'date' : 'all',
    date: typeof input?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null,
    radiusDays: Number.isFinite(input?.radiusDays) ? Math.max(0, Math.min(15, Math.round(input.radiusDays))) : 3,
  }
}

function itemKey(item) {
  return `${item.query}\u0000${item.match}\u0000${item.mode}\u0000${item.date ?? ''}\u0000${item.radiusDays}`
}

/** Create the history store. */
export function createHistoryStore({ file = join(pluginDataDir(), 'history.json'), now = Date.now } = {}) {
  let loaded = null

  async function read() {
    if (loaded !== null) return loaded
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8'))
      loaded = (Array.isArray(parsed?.items) ? parsed.items : [])
        .filter((item) => item?.id && typeof item.query === 'string')
        .slice(0, MAX_ITEMS)
    } catch {
      loaded = []
    }
    return loaded
  }

  async function write(items) {
    loaded = items
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify({ version: 1, items }, null, 2), 'utf8')
    await rename(temporary, file)
  }

  async function list() {
    return (await read()).map((item) => ({ ...item }))
  }

  async function add(input) {
    const normalized = normalizeItem(input)
    if (normalized === null) return list()
    const items = await read()
    const key = itemKey(normalized)
    const existing = items.find((item) => itemKey(item) === key)
    const next = [
      { id: existing?.id ?? randomUUID(), ...normalized, at: now() },
      ...items.filter((item) => itemKey(item) !== key),
    ].slice(0, MAX_ITEMS)
    await write(next)
    return next.map((item) => ({ ...item }))
  }

  async function remove(id) {
    const next = (await read()).filter((item) => item.id !== id)
    await write(next)
    return next.map((item) => ({ ...item }))
  }

  async function clear() {
    await write([])
    return []
  }

  return { list, add, remove, clear }
}
