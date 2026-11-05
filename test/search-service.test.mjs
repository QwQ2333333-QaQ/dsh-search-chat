import test from 'node:test'
import assert from 'node:assert/strict'
import { createSearchService } from '../lib/search-service.js'

function doc(sessionId, seq, text, time, turn, type = 'user/message') {
  return { sessionId, seq, text, time, turn, type }
}

function fakeQuery({ sessions, documents, titles = {} }) {
  return {
    async listSessions() {
      return sessions.map((header) => ({ header, live: false, persisted: true }))
    },
    async searchSessions({ query, limit = 10 }) {
      const items = sessions
        .filter((header) => (documents[header.id] ?? []).some((item) => item.text.includes(query)))
        .slice(0, limit)
        .map((header) => ({
          header,
          live: false,
          persisted: true,
          bestMatch: { sessionId: header.id, seq: 1, type: 'user/message', time: 1, surface: 'current', snippet: '' },
        }))
      return { items }
    },
    async filterEvents(sessionId, filters) {
      return (documents[sessionId] ?? []).filter((item) =>
        filters.some((filter) => filter.kind === 'text' && item.text.includes(filter.text)))
    },
    async readEvent({ sessionId, seq }) {
      const found = (documents[sessionId] ?? []).find((item) => item.seq === seq)
      if (found === undefined) throw new Error('missing')
      return {
        target: {
          seq,
          type: found.type,
          time: found.time,
          data: { turn: found.turn, step: 1, message: { role: 'user', content: [{ type: 'text', text: found.text }] } },
        },
        events: [],
      }
    },
    async readTitleSnapshots(ids) {
      return ids.map((id) => ({
        sessionId: id,
        status: 'fulfilled',
        value: { session: {}, title: { title: titles[id] ?? id } },
      }))
    },
  }
}

const sessions = [
  { id: 's1', version: 4, createdAt: 1000, cwd: 'D:\\work\\alpha', isSeeded: false },
  { id: 's2', version: 4, createdAt: 2000, cwd: 'C:\\work\\beta', isSeeded: false },
]
const documents = {
  s1: [
    doc('s1', 3, '今天安装了鲸鱼插件', 1000, 1),
    doc('s1', 9, '然后修好了报错', 2000, 2),
  ],
  s2: [
    doc('s2', 5, '安装插件之后余额显示正常', 3000, 1),
    doc('s2', 8, '插件配置说明', 4000, 2, 'assistant/message'),
  ],
}

function makeService(overrides = {}) {
  return createSearchService({
    getSessionQuery: () => fakeQuery({
      sessions,
      documents,
      titles: { s1: '鲸鱼插件安装', s2: '余额显示' },
    }),
    getWorkspaceRegistry: () => ({ list: () => [{ path: 'D:\\work\\alpha', title: 'Alpha 项目' }] }),
    ...overrides,
  })
}

test('status reports availability, counts and literal capabilities', async () => {
  const service = makeService()
  const status = await service.status()
  assert.equal(status.ok, true)
  assert.equal(status.sessionQuery, true)
  assert.equal(status.sessions, 2)
  assert.equal(status.workspaces, 1)
  assert.equal(status.capabilities.literal, true)
  assert.equal(status.capabilities.semantic, false)
})

test('status degrades when the session query service is missing', async () => {
  const service = createSearchService({ getSessionQuery: () => undefined })
  const status = await service.status()
  assert.equal(status.sessionQuery, false)
  await assert.rejects(() => service.search({ query: '安装' }), (error) => error.statusCode === 503)
})

test('phrase search returns literal hits with session metadata', async () => {
  const service = makeService()
  const result = await service.search({ query: '安装了鲸鱼插件' })
  assert.equal(result.ok, true)
  assert.equal(result.total, 1)
  assert.equal(result.items[0].sessionId, 's1')
  assert.equal(result.items[0].sessionTitle, '鲸鱼插件安装')
  assert.equal(result.items[0].workspaceTitle, 'Alpha 项目')
  assert.equal(result.items[0].turn, null, 'turn is resolved lazily at jump time')
  assert.ok(result.items[0].snippet.includes('安装了鲸鱼插件'))
})

test('turn resolves the Agent turn on demand', async () => {
  const service = makeService()
  const resolved = await service.turn({ sessionId: 's1', seq: 3 })
  assert.equal(resolved.ok, true)
  assert.equal(resolved.turn, 1)
  const missing = await service.turn({ sessionId: 'nope', seq: 3 })
  assert.equal(missing.turn, null)
})

test('all-terms and any-term modes match the literal token rules', async () => {
  const service = makeService()
  const all = await service.search({ query: '安装 插件', match: 'all-terms' })
  assert.equal(all.total, 2)
  const any = await service.search({ query: '鲸鱼 余额', match: 'any-term' })
  assert.equal(any.total, 2)
  const none = await service.search({ query: '鲸鱼 余额', match: 'all-terms' })
  assert.equal(none.total, 0)
})

test('order and pagination are applied to the complete hit list', async () => {
  const service = makeService()
  const desc = await service.search({ query: '插件', limit: 1 })
  assert.equal(desc.items.length, 1)
  assert.equal(desc.items[0].time, 4000)
  assert.equal(desc.nextOffset, 1)
  const next = await service.search({ query: '插件', limit: 1, offset: desc.nextOffset })
  assert.equal(next.items[0].time, 3000)
  const asc = await service.search({ query: '插件', order: 'asc', limit: 1 })
  assert.equal(asc.items[0].time, 1000)
})

test('workspace scope filters sessions by cwd', async () => {
  const service = makeService()
  const scoped = await service.search({ query: '插件', cwd: 'D:\\work\\alpha' })
  assert.equal(scoped.total, 1)
  assert.equal(scoped.items[0].sessionId, 's1')
})

test('scan fallback still returns verified literal hits when the index misses', async () => {
  const service = createSearchService({
    getSessionQuery: () => {
      const query = fakeQuery({ sessions, documents, titles: {} })
      return { ...query, searchSessions: async () => ({ items: [] }) }
    },
  })
  const result = await service.search({ query: '安装了鲸鱼插件' })
  assert.equal(result.total, 1)
  assert.equal(result.source, 'scan')
  assert.equal(result.items[0].sessionId, 's1')
})

test('context normalizes one event window', async () => {
  const service = makeService()
  const context = await service.context({ sessionId: 's1', seq: 3 })
  assert.equal(context.ok, true)
  assert.equal(context.events.length, 1)
  assert.equal(context.events[0].role, 'user')
  assert.equal(context.events[0].turn, 1)
  assert.ok(context.events[0].text.includes('鲸鱼插件'))
})

test('sessions lists titles and workspace labels', async () => {
  const service = makeService()
  const list = await service.sessions({})
  assert.equal(list.total, 2)
  const first = list.items.find((item) => item.sessionId === 's1')
  assert.equal(first.title, '鲸鱼插件安装')
  assert.equal(first.workspaceTitle, 'Alpha 项目')
})

test('empty query is rejected as a bad request', async () => {
  const service = makeService()
  await assert.rejects(() => service.search({ query: '   ' }), (error) => error.statusCode === 400)
})
