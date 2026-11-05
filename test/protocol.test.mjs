import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampLimit, clampPerSession, clampScanSessions, normalizeTimeRange,
} from '../lib/protocol.js'

test('clampPerSession bounds the per-session hit cap', () => {
  assert.equal(clampPerSession(1), 1)
  assert.equal(clampPerSession(20), 20)
  assert.equal(clampPerSession(0), 1)
  assert.equal(clampPerSession(999), 20)
  assert.equal(clampPerSession(undefined), 8)
  assert.equal(clampPerSession('abc'), 8)
})

test('clampScanSessions bounds the scanned-session cap', () => {
  assert.equal(clampScanSessions(30), 30)
  assert.equal(clampScanSessions(5), 10)
  assert.equal(clampScanSessions(9999), 500)
  assert.equal(clampScanSessions(undefined), 80)
})

test('clampLimit keeps the existing page-size bounds', () => {
  assert.equal(clampLimit(40), 40)
  assert.equal(clampLimit(0), 1)
  assert.equal(clampLimit(1000), 100)
  assert.equal(clampLimit(undefined), 40)
})

test('normalizeTimeRange accepts a valid window and rejects malformed ones', () => {
  const range = normalizeTimeRange({ timeFrom: 1000, timeTo: 5000 })
  assert.deepEqual(range, { from: 1000, to: 5000 })
  assert.deepEqual(normalizeTimeRange({ timeFrom: 1000.9, timeTo: 5000.2 }), { from: 1000, to: 5000 })
  assert.equal(normalizeTimeRange({}), null)
  assert.equal(normalizeTimeRange({ timeFrom: 5000, timeTo: 1000 }), null)
  assert.equal(normalizeTimeRange({ timeFrom: 'x', timeTo: 5000 }), null)
})

test('normalizeTimeRange rejects a window wider than the documented span', () => {
  const day = 86_400_000
  assert.notEqual(normalizeTimeRange({ timeFrom: 0, timeTo: 31 * day }), null)
  assert.equal(normalizeTimeRange({ timeFrom: 0, timeTo: 32 * day }), null)
})
