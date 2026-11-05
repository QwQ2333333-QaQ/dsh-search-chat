import test from 'node:test'
import assert from 'node:assert/strict'

const CLEANUP = Symbol.for('dsh-search-chat.host.cleanup')

function disposeGlobal() {
  const cleanup = globalThis[CLEANUP]
  if (typeof cleanup === 'function') cleanup()
  delete globalThis[CLEANUP]
}

function fakeContext() {
  const routes = new Map()
  return {
    routes,
    ctx: {
      webServer: {
        register(route) {
          if (routes.has(route.path)) throw new Error(`webserver: duplicate exact route "${route.path}"`)
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
      get: () => undefined,
      effect: () => () => {},
    },
  }
}

test('apply registers every route and repeated apply is self-healing', async () => {
  disposeGlobal()
  const { apply } = await import('../lib/index.js')
  const context = fakeContext()
  apply(context.ctx)
  assert.equal(context.routes.size, 6)
  apply(context.ctx)
  assert.equal(context.routes.size, 6, 'the previous instance must release its routes first')
  disposeGlobal()
  assert.equal(context.routes.size, 0)
})

test('a stale duplicate route does not fail the whole plugin', async () => {
  disposeGlobal()
  const { apply } = await import('../lib/index.js')
  const context = fakeContext()
  context.routes.set('/dsh-search-chat/status', { stale: true })
  apply(context.ctx)
  assert.equal(context.routes.size, 6, 'the duplicate is skipped and the other routes still register')
  disposeGlobal()
})

test('the settings route serves both verbs on one exact path', async () => {
  disposeGlobal()
  const { apply } = await import('../lib/index.js')
  const { ROUTES } = await import('../lib/protocol.js')
  const context = fakeContext()
  apply(context.ctx)
  const settings = context.routes.get(ROUTES.settings)
  assert.ok(settings)
  assert.equal(context.routes.size, 6)
  assert.equal(settings.kind, 'exact')
  disposeGlobal()
})
