import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHistoryStore } from '../lib/history-store.js'
import { cacheKey, createCacheStore } from '../lib/cache-store.js'
import { dayKey, dayStart, shiftWindow, windowAround } from '../lib/calendar-index.js'

test('history store dedupes, reorders and caps entries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-history-'))
  try {
    const store = createHistoryStore({ file: join(dir, 'history.json'), now: () => 1000 })
    await store.add({ query: 'alpha', match: 'phrase', mode: 'all' })
    await store.add({ query: 'beta', match: 'all-terms', mode: 'all' })
    let items = await store.list()
    assert.deepEqual(items.map((item) => item.query), ['beta', 'alpha'])

    await store.add({ query: 'alpha', match: 'phrase', mode: 'all' })
    items = await store.list()
    assert.deepEqual(items.map((item) => item.query), ['alpha', 'beta'])
    assert.equal(items.length, 2, 'a repeated query is lifted, not duplicated')

    const removed = await store.remove(items[0].id)
    assert.deepEqual(removed.map((item) => item.query), ['beta'])
    assert.deepEqual(await store.clear(), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('cache store hits by key and invalidates on a corpus signature change', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-cache-'))
  let clock = 1000
  try {
    const store = createCacheStore({ dir, now: () => clock })
    const key = cacheKey(['search', 'alpha'])
    assert.equal(await store.get(key, 'sig-1'), undefined)
    await store.put(key, 'sig-1', { ok: true, items: [1] })
    assert.deepEqual(await store.get(key, 'sig-1'), { ok: true, items: [1] })
    assert.equal(await store.get(key, 'sig-2'), undefined, 'a changed corpus signature misses')
    clock += 8 * 86_400_000
    await store.put(key, 'sig-3', { ok: true, items: [2] })
    clock += 8 * 86_400_000
    assert.equal(await store.get(key, 'sig-3'), undefined, 'expired entries miss')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('timeline helpers build inclusive local windows and shift them', () => {
  const window = windowAround('2026-11-05', 3)
  assert.ok(window !== null)
  assert.equal(dayKey(window.from), '2026-11-02')
  assert.equal(dayKey(window.to), '2026-11-08')

  const older = shiftWindow({ from: window.from, to: window.to }, 'older', 3)
  assert.equal(dayKey(older.to), '2026-11-01')
  assert.equal(dayKey(older.from), '2026-10-30')

  const newer = shiftWindow({ from: window.from, to: window.to }, 'newer', 3)
  assert.equal(dayKey(newer.from), '2026-11-09')
  assert.equal(dayKey(newer.to), '2026-11-11')
  assert.ok(dayStart('2026-11-05') !== null)
  assert.equal(dayStart('nope'), null)
})
