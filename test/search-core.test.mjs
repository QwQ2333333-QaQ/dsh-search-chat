import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dedupe, makeSnippet, matchText, paginate, scoreOf, sortHits, termsOf,
} from '../lib/search-core.js'

test('termsOf keeps CJK without spaces as one term and splits latin words', () => {
  assert.deepEqual(termsOf('安装 插件 报错'), ['安装', '插件', '报错'])
  assert.deepEqual(termsOf('   '), [])
  assert.deepEqual(termsOf('hello world'), ['hello', 'world'])
  assert.deepEqual(termsOf('中文English混排'), ['中文English混排'])
})

test('phrase mode is a literal case-insensitive substring match', () => {
  assert.equal(matchText('今天安装了插件', '安装了', 'phrase').ok, true)
  assert.equal(matchText('HELLO world', 'hello', 'phrase').ok, true)
  assert.equal(matchText('今天安装了插件', '卸载', 'phrase').ok, false)
})

test('all-terms requires every term, any-term accepts one', () => {
  const text = '安装了一个插件然后报错'
  assert.equal(matchText(text, '安装 插件', 'all-terms').ok, true)
  assert.equal(matchText(text, '安装 卸载', 'all-terms').ok, false)
  assert.equal(matchText(text, '安装 卸载', 'any-term').ok, true)
  assert.equal(matchText(text, '完全不存在', 'any-term').ok, false)
})

test('coverage is reported for ranking tie-breaks', () => {
  const verdict = matchText('安装插件报错', '安装 插件 卸载', 'any-term')
  assert.equal(verdict.coverage, 2 / 3)
  assert.equal(scoreOf(false, verdict.coverage), 2 / 3)
})

test('makeSnippet centers the query and collapses whitespace', () => {
  const text = `前置内容\n\n${'x'.repeat(200)}目标文字${'y'.repeat(200)}`
  const snippet = makeSnippet(text, '目标文字')
  assert.ok(snippet.includes('目标文字'))
  assert.ok(!snippet.includes('\n'))
  assert.ok(snippet.startsWith('…'))
  assert.ok(snippet.endsWith('…'))
})

test('makeSnippet falls back to the first term when the phrase is absent', () => {
  const snippet = makeSnippet('aaa bbb ccc', 'zzz bbb')
  assert.ok(snippet.includes('bbb'))
})

test('dedupe keeps the highest score per session and sequence', () => {
  const hits = [
    { sessionId: 's1', seq: 3, score: 1, time: 1 },
    { sessionId: 's1', seq: 3, score: 2, time: 1 },
    { sessionId: 's2', seq: 1, score: 1, time: 2 },
  ]
  const unique = dedupe(hits)
  assert.equal(unique.length, 2)
  assert.equal(unique.find((hit) => hit.sessionId === 's1').score, 2)
})

test('sortHits orders by time and respects direction', () => {
  const hits = [
    { sessionId: 'a', seq: 1, time: 100, score: 1 },
    { sessionId: 'b', seq: 2, time: 300, score: 1 },
    { sessionId: 'c', seq: 3, time: 200, score: 3 },
  ]
  assert.deepEqual(sortHits(hits, 'asc').map((hit) => hit.time), [100, 200, 300])
  assert.deepEqual(sortHits(hits, 'desc').map((hit) => hit.time), [300, 200, 100])
})

test('paginate reports the next offset', () => {
  const items = Array.from({ length: 5 }, (_, index) => ({ index }))
  const first = paginate(items, 2, 0)
  assert.deepEqual(first.items.map((item) => item.index), [0, 1])
  assert.equal(first.nextCursor, 'o:2')
  assert.equal(first.total, 5)
  const last = paginate(items, 2, 4)
  assert.equal(last.nextCursor, null)
})
