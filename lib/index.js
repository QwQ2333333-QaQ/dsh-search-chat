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

/** Plugin identity used by the Loader. */
export const name = 'dsh-search-chat'

/** The Web server is the only hard dependency; `sessionQuery` is optional. */
export const inject = ['webServer']

const ALLOW = 'GET, POST, OPTIONS'

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

  async function dispatch(request, response, method, handler) {
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
      if (actual !== method) {
        sendJson(response, 405, {
          ok: false,
          error: { code: ERROR_CODES.badRequest, message: `method ${actual} is not allowed` },
        })
        response.setHeader('allow', method)
        return
      }
      const body = method === 'POST'
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

  function route(path, method, handler) {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path,
      handler: (request, response) => {
        void dispatch(request, response, method, handler)
      },
    }))
  }

  route(ROUTES.status, 'GET', () => service.status())
  route(ROUTES.sessions, 'GET', (query) => service.sessions({
    limit: query.limit,
    cwd: query.cwd,
  }))
  route(ROUTES.search, 'POST', (body) => service.search(body))
  route(ROUTES.context, 'GET', (query) => service.context({
    sessionId: query.sessionId,
    seq: Number(query.seq),
  }))
  route(ROUTES.turn, 'GET', (query) => service.turn({
    sessionId: query.sessionId,
    seq: Number(query.seq),
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // Route removal after teardown is best-effort.
      }
    }
  }, 'dsh-search-chat: routes')
}

export default { name, inject, apply }
