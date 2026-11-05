/**
 * Local result cache: memory LRU plus atomic JSON files on disk, keyed by the
 * normalized request and guarded by a corpus signature. Windows that touch
 * today are only kept in memory because live sessions can still change.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pluginDataDir } from './paths.js'

const MEMORY_TTL_MS = 60_000
const DISK_TTL_MS = 7 * 86_400_000
const MAX_ENTRIES = 200
const MAX_BYTES = 20 * 1024 * 1024

/** Stable hash for one normalized request shape. */
export function cacheKey(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

/** Create the cache store. */
export function createCacheStore({ dir = join(pluginDataDir(), 'cache'), now = Date.now } = {}) {
  const memory = new Map()
  let ready = false

  async function ensureDir() {
    if (ready) return
    await mkdir(dir, { recursive: true })
    ready = true
  }

  function memoryGet(key, corpusSig) {
    const entry = memory.get(key)
    if (entry === undefined) return undefined
    if (entry.corpusSig !== corpusSig || now() - entry.at > MEMORY_TTL_MS) {
      memory.delete(key)
      return undefined
    }
    return entry.payload
  }

  async function get(key, corpusSig) {
    const warm = memoryGet(key, corpusSig)
    if (warm !== undefined) return warm
    try {
      const entry = JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8'))
      if (entry?.corpusSig !== corpusSig) return undefined
      if (typeof entry.savedAt !== 'number' || now() - entry.savedAt > DISK_TTL_MS) return undefined
      memory.set(key, { at: now(), corpusSig, payload: entry.payload })
      return entry.payload
    } catch {
      return undefined
    }
  }

  async function prune() {
    try {
      const entries = []
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.json')) continue
        const path = join(dir, name)
        const info = await stat(path)
        entries.push({ path, mtime: info.mtimeMs, size: info.size })
      }
      entries.sort((left, right) => left.mtime - right.mtime)
      let total = entries.reduce((sum, entry) => sum + entry.size, 0)
      let count = entries.length
      for (const entry of entries) {
        if (count <= MAX_ENTRIES && total <= MAX_BYTES) break
        try {
          await unlink(entry.path)
          total -= entry.size
          count -= 1
        } catch {
          // A concurrent prune may have removed it already.
        }
      }
    } catch {
      // Pruning is best-effort.
    }
  }

  async function put(key, corpusSig, payload, { persist = true } = {}) {
    memory.set(key, { at: now(), corpusSig, payload })
    if (!persist) return
    try {
      await ensureDir()
      const temporary = join(dir, `${key}.${process.pid}.tmp`)
      await writeFile(temporary, JSON.stringify({ version: 1, key, corpusSig, savedAt: now(), payload }), 'utf8')
      await rename(temporary, join(dir, `${key}.json`))
      await prune()
    } catch {
      // The memory copy remains usable.
    }
  }

  async function stats() {
    try {
      const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
      return { entries: files.length }
    } catch {
      return { entries: 0 }
    }
  }

  return { key: cacheKey, get, put, stats, dir }
}
