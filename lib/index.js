/**
 * Host half of dsh-search-chat.
 *
 * Registers four local-only JSON routes over the official `sessionQuery`
 * service. Every route is loopback-gated; the plugin never stores or returns
 * credentials and never logs query content.
 */

import { createSearchService } from './search-service.js'
import { readJsonBody, requestRejection, sendJson } from './fence.js'
import { ERROR_CODES, LIMITS, ROUTES } from './protocol.js'
import { readSettings, updateSettings } from './settings.js'

/** Plugin identity used by the Loader. */
export const name = 'dsh-search-chat'

/** The Web server is the only hard dependency; `sessionQuery` is optional. */
export const inject = ['webServer']

const ALLOW = 'GET, POST, OPTIONS'

/** Process-wide route cleanup: a hot-reloaded module instance reuses this slot. */
const CLEANUP_KEY = Symbol.for('dsh-search-chat.host.cleanup')

/** Read the query parameters of one GET request. */
function queryOf(request) {
  try {
    return Object.fromEntries(new URL(request.url ?? '/', 'http://localhost').searchParams)
  } catch {
    return {}
  }
}

/**
 * Mount the Host plugin.
 * @param {import('@deepseek-ai/cordis').Context} ctx Host context.
 */
export function apply(ctx) {
  // A reloaded module instance must release the previous instance's routes first;
  // otherwise the Web server rejects the new exact-path registrations.
  const previous = globalThis[CLEANUP_KEY]
  if (typeof previous === 'function') {
    try {
      previous()
    } catch {
      // Stale cleanup is best-effort; fresh registrations below still run.
    }
    delete globalThis[CLEANUP_KEY]
  }

  const service = createSearchService({
    getSessionQuery: () => ctx.get('sessionQuery'),
    getWorkspaceRegistry: () => ctx.get('workspaceRegistry'),
    report: (error) => {
      try {
        console.error('[dsh-search-chat]', error instanceof Error ? error.message : String(error))
      } catch {
        // Reporting must never break a request.
      }
    },
  })

  const disposers = []

  async function dispatch(request, response, methods, handler) {
    try {
      const rejection = requestRejection(request)
      if (rejection !== null) {
        sendJson(response, rejection, {
          ok: false,
          error: { code: ERROR_CODES.notLoopback, message: 'This route only accepts local requests.' },
        })
        return
      }
      const actual = String(request.method ?? 'GET').toUpperCase()
      if (actual === 'OPTIONS') {
        response.statusCode = 204
        response.setHeader('allow', ALLOW)
        response.end()
        return
      }
      if (!methods.includes(actual)) {
        sendJson(response, 405, {
          ok: false,
          error: { code: ERROR_CODES.badRequest, message: `method ${actual} is not allowed` },
        })
        response.setHeader('allow', methods.join(', '))
        return
      }
      const body = actual === 'POST'
        ? await readJsonBody(request, LIMITS.bodyMaxBytes)
        : queryOf(request)
      const result = await handler(body, request)
      sendJson(response, 200, result)
    } catch (error) {
      const status = Number(error?.statusCode) >= 400 ? Number(error.statusCode) : 500
      const code = typeof error?.code === 'string'
        ? error.code
        : status === 400
          ? ERROR_CODES.badRequest
          : status === 503
            ? ERROR_CODES.noSessionQuery
            : ERROR_CODES.internal
      sendJson(response, status, {
        ok: false,
        error: {
          code,
          message: status >= 500 ? 'search is temporarily unavailable' : String(error?.message ?? 'request failed'),
        },
      })
    }
  }

  function route(path, methods, handler) {
    try {
      disposers.push(ctx.webServer.register({
        kind: 'exact',
        path,
        handler: (request, response) => {
          void dispatch(request, response, methods, handler)
        },
      }))
    } catch (error) {
      // A route left behind by a reloaded module instance must not fail the
      // whole plugin; report it and keep the routes that did register.
      try {
        console.error('[dsh-search-chat] route registration skipped:', path, error instanceof Error ? error.message : String(error))
      } catch {
        // Reporting is best-effort.
      }
    }
  }

  route(ROUTES.status, ['GET'], () => service.status())
  route(ROUTES.sessions, ['GET'], (query) => service.sessions({
    limit: query.limit,
    cwd: query.cwd,
  }))
  route(ROUTES.search, ['POST'], (body) => service.search(body))
  route(ROUTES.context, ['GET'], (query) => service.context({
    sessionId: query.sessionId,
    seq: Number(query.seq),
  }))
  route(ROUTES.turn, ['GET'], (query) => service.turn({
    sessionId: query.sessionId,
    seq: Number(query.seq),
  }))
  // One exact path serves both settings verbs: the Web server rejects duplicate
  // (kind, path) registrations, so a second route for the same path would fail
  // the whole plugin.
  route(ROUTES.settings, ['GET', 'POST'], async (body, request) => {
    if (String(request.method ?? 'GET').toUpperCase() === 'GET') {
      return { ok: true, settings: await readSettings() }
    }
    return { ok: true, settings: await updateSettings(body ?? {}) }
  })
  route(ROUTES.timeline, ['POST'], (body) => service.timeline(body))
  route(ROUTES.calendar, ['GET'], (query) => service.calendar({ month: query.month }))
  route(ROUTES.history, ['GET', 'POST'], (body, request) => {
    if (String(request.method ?? 'GET').toUpperCase() === 'GET') return service.history({})
    return service.history(body ?? {})
  })

  const cleanup = () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // Route removal after teardown is best-effort.
      }
    }
    if (globalThis[CLEANUP_KEY] === cleanup) delete globalThis[CLEANUP_KEY]
  }
  globalThis[CLEANUP_KEY] = cleanup

  ctx.effect(() => () => {
    cleanup()
  }, 'dsh-search-chat: routes')
}

export default { name, inject, apply }
