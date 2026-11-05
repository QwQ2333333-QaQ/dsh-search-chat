/**
 * Client half of dsh-search-chat.
 *
 * Registers a right-sidebar tab type plus its body, renders the literal search
 * panel, and jumps the main conversation to a matched message. Optional
 * services (`sidebarRightTabs`, `sidebarRight`, `uiWorkspace`, `sessions`) are
 * resolved lazily so the plugin stays inert instead of parking on hosts that
 * do not expose them.
 */

window.__ModuleLoader__.load({
  id: 'dsh-search-chat',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback } = React

    const TAB_ID = 'dsh-search-chat'
    const TAB_KIND = 'dsh-search-chat'
    const ROUTES = {
      status: '/dsh-search-chat/status',
      sessions: '/dsh-search-chat/sessions',
      search: '/dsh-search-chat/search',
      context: '/dsh-search-chat/context',
      turn: '/dsh-search-chat/turn',
    }
    const DEFAULT_LIMIT = 40
    const STYLE_ID = 'dsh-search-chat-style'

    const ZH = {
      title: '会话搜索',
      'guide.description': '跨全部工作区按字面匹配查找聊天记录，点击跳到原消息',
      placeholder: '输入要查找的文字（支持中文、英文、代码片段）',
      'mode.phrase': '整段匹配',
      'mode.all-terms': '全部词',
      'mode.any-term': '任一词',
      'scope.all': '全部工作区',
      'scope.current': '当前工作区',
      'order.desc': '时间倒序',
      'order.asc': '时间正序',
      search: '搜索',
      loading: '搜索中…',
      empty: '没有匹配结果',
      'empty.hint': '换个词试试；短词、专有名词、代码片段通常更容易命中',
      'result.total': '共 {total} 条',
      'result.took': '{ms} ms',
      'result.source.index': '索引',
      'result.source.scan': '扫描',
      'result.truncated': '（仅扫描了前 {n} 个会话）',
      'result.more': '加载更多',
      'result.more.done': '已经到底了',
      'status.checking': '正在检查搜索服务…',
      'status.unavailable': '搜索服务不可用：需要 DSH 0.2.2+ 的会话索引服务',
      'status.ready': '{sessions} 个会话 · {workspaces} 个工作区',
      'jump.jumping': '正在跳转…',
      'jump.ok': '已跳转到第 {turn} 轮附近',
      'jump.notFound': '已打开会话，但没有定位到那条消息；请确认当前是聊天视图',
      'jump.unavailable': '当前宿主没有提供会话导航能力',
      'jump.sessionMissing': '会话已不存在或无法打开',
      role: '用户',
      'role.assistant': '助手',
      'role.tool': '工具',
      'role.system': '系统',
      'role.meta': '元信息',
      'date.today': '今天',
      'date.yesterday': '昨天',
      'error.NOT_LOOPBACK': '只允许本机访问',
      'error.NO_SESSION_QUERY': '搜索服务不可用（需要 DSH 0.2.2+）',
      'error.BAD_REQUEST': '请求参数不正确',
      'error.INTERNAL': '搜索出错了',
      'error.NETWORK': '无法连接宿主搜索服务',
      dismiss: '关闭',
    }

    const EN = {
      title: 'Session search',
      'guide.description': 'Literal search across every workspace; click a hit to open it',
      placeholder: 'Type text to find (Chinese, English, or a code fragment)',
      'mode.phrase': 'Phrase',
      'mode.all-terms': 'All terms',
      'mode.any-term': 'Any term',
      'scope.all': 'All workspaces',
      'scope.current': 'This workspace',
      'order.desc': 'Newest first',
      'order.asc': 'Oldest first',
      search: 'Search',
      loading: 'Searching…',
      empty: 'No matches',
      'empty.hint': 'Try another word; short words, names, and code fragments match best',
      'result.total': '{total} hits',
      'result.took': '{ms} ms',
      'result.source.index': 'index',
      'result.source.scan': 'scan',
      'result.truncated': '(scanned the first {n} sessions only)',
      'result.more': 'Load more',
      'result.more.done': 'No more results',
      'status.checking': 'Checking the search service…',
      'status.unavailable': 'Search unavailable: needs the DSH 0.2.2+ session index',
      'status.ready': '{sessions} sessions · {workspaces} workspaces',
      'jump.jumping': 'Jumping…',
      'jump.ok': 'Jumped near turn {turn}',
      'jump.notFound': 'Opened the session but could not locate that message; make sure the Chat view is active',
      'jump.unavailable': 'This host does not expose session navigation',
      'jump.sessionMissing': 'The session is gone or cannot be opened',
      role: 'User',
      'role.assistant': 'Assistant',
      'role.tool': 'Tool',
      'role.system': 'System',
      'role.meta': 'Meta',
      'date.today': 'Today',
      'date.yesterday': 'Yesterday',
      'error.NOT_LOOPBACK': 'Local access only',
      'error.NO_SESSION_QUERY': 'Search unavailable (needs DSH 0.2.2+)',
      'error.BAD_REQUEST': 'Invalid request',
      'error.INTERNAL': 'Search failed',
      'error.NETWORK': 'Cannot reach the host search service',
      dismiss: 'Close',
    }

    const CSS = `
      .dsc-root{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;padding:10px;box-sizing:border-box;color:inherit;font-size:13px}
      .dsc-head{display:flex;flex-direction:column;gap:6px}
      .dsc-title{font-weight:600;font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px}
      .dsc-count{opacity:.6;font-weight:400;font-size:11px}
      .dsc-input{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:8px;border:1px solid rgba(127,127,127,.35);background:rgba(127,127,127,.08);color:inherit;font:inherit;outline:none}
      .dsc-input:focus{border-color:#2f6fed;box-shadow:0 0 0 2px rgba(47,111,237,.18)}
      .dsc-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .dsc-chip{appearance:none;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;border-radius:999px;padding:3px 9px;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}
      .dsc-chip[data-on="1"]{background:rgba(47,111,237,.16);border-color:rgba(47,111,237,.55);color:inherit}
      .dsc-spacer{flex:1}
      .dsc-status{font-size:11px;opacity:.65;min-height:14px}
      .dsc-status[data-error="1"]{color:#d9534f;opacity:1}
      .dsc-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:2px;scrollbar-width:thin}
      .dsc-day{position:sticky;top:0;z-index:1;font-size:11px;opacity:.7;padding:6px 2px 4px;background:var(--dsc-bg,transparent);backdrop-filter:blur(4px)}
      .dsc-hit{appearance:none;text-align:left;color:inherit;background:transparent;border:1px solid transparent;border-radius:8px;padding:7px 8px;cursor:pointer;display:flex;flex-direction:column;gap:3px;font:inherit}
      .dsc-hit:hover,.dsc-hit:focus-visible{background:rgba(127,127,127,.1);border-color:rgba(127,127,127,.28);outline:none}
      .dsc-hit[data-busy="1"]{opacity:.6}
      .dsc-hit-top{display:flex;gap:6px;align-items:baseline;font-size:11px;opacity:.72}
      .dsc-hit-title{font-weight:600;font-size:12px;opacity:.95;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsc-badge{font-size:10px;border-radius:4px;padding:0 5px;border:1px solid rgba(127,127,127,.3);opacity:.8;white-space:nowrap}
      .dsc-snippet{font-size:12px;line-height:1.5;opacity:.9;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .dsc-mark{background:rgba(47,111,237,.25);border-radius:3px;padding:0 1px;font-weight:600}
      .dsc-empty{opacity:.65;font-size:12px;padding:18px 6px;text-align:center;line-height:1.6}
      .dsc-more{align-self:center;margin:6px 0;font-size:11px;padding:4px 12px;border-radius:999px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;cursor:pointer}
      .dsc-foot{display:flex;align-items:center;gap:8px;font-size:11px;opacity:.65;min-height:16px}
      .dsc-flash{animation:dsc-flash 2.4s ease-out;border-radius:8px;outline:2px solid rgba(47,111,237,.75);outline-offset:2px}
      @keyframes dsc-flash{0%{background:rgba(47,111,237,.32)}100%{background:transparent}}
    `

    function localeId(ctx) {
      try {
        const locale = ctx?.get?.('locale')
        const snapshot = locale?.getLocale?.() ?? locale?.getSnapshot?.()
        const raw = snapshot?.locale ?? snapshot?.id ?? snapshot?.language
        if (typeof raw === 'string' && raw.length > 0) return raw.toLowerCase().startsWith('en') ? 'en' : 'zh'
      } catch {
        // Locale discovery is best-effort; Chinese is the author's default.
      }
      return 'zh'
    }

    function makeTranslate(ctx) {
      return (key, params) => {
        const id = localeId(ctx)
        const dict = id === 'en' ? EN : ZH
        let text = dict[key] ?? ZH[key] ?? key
        if (params !== undefined) {
          for (const [name, value] of Object.entries(params)) {
            text = text.replaceAll(`{${name}}`, String(value))
          }
        }
        return text
      }
    }

    function api(path, options = {}) {
      const { body, signal, method = 'GET' } = options
      const init = {
        method,
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        signal,
      }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      return fetch(path, init).then(async (response) => {
        let data = null
        try {
          data = await response.json()
        } catch {
          data = null
        }
        if (!response.ok || data?.ok === false) {
          const error = new Error(data?.error?.message ?? `HTTP ${response.status}`)
          error.code = data?.error?.code ?? 'INTERNAL'
          error.status = response.status
          throw error
        }
        return data
      })
    }

    function nowDayKey(time) {
      const date = new Date(typeof time === 'number' ? time : Date.now())
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function dayLabel(key, t) {
      const today = nowDayKey(Date.now())
      const yesterday = nowDayKey(Date.now() - 86_400_000)
      if (key === today) return t('date.today')
      if (key === yesterday) return t('date.yesterday')
      return key
    }

    function clock(time) {
      try {
        return new Date(time).toLocaleTimeString()
      } catch {
        return ''
      }
    }

    function escapeRegExp(text) {
      return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }

    function Highlighted({ text, query, match }) {
      const terms = useMemo(() => {
        const trimmed = String(query ?? '').trim()
        if (trimmed === '') return []
        const list = match === 'phrase' ? [trimmed] : trimmed.split(/\s+/).filter(Boolean)
        return [...new Set(list)].sort((left, right) => right.length - left.length)
      }, [query, match])
      if (terms.length === 0) return h(React.Fragment, null, text)
      const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
      const parts = String(text ?? '').split(pattern)
      const folded = new Set(terms.map((term) => term.toLowerCase()))
      return h(React.Fragment, null, parts.map((part, index) => (
        folded.has(String(part).toLowerCase())
          ? h('mark', { key: index, className: 'dsc-mark' }, part)
          : h(React.Fragment, { key: index }, part)
      )))
    }

    function waitFor(probe, timeoutMs, intervalMs = 120) {
      return new Promise((resolve) => {
        const started = Date.now()
        const tick = () => {
          let value
          try {
            value = probe()
          } catch {
            value = undefined
          }
          if (value) {
            resolve(value)
            return
          }
          if (Date.now() - started >= timeoutMs) {
            resolve(null)
            return
          }
          window.setTimeout(tick, intervalMs)
        }
        tick()
      })
    }

    function findMessageNode(hit, query) {
      const flow = document.querySelector('[data-chat-flow]')
      if (flow === null) return null
      const nodes = [...flow.querySelectorAll('[data-chat-node-key]')]
      const fragments = []
      const snippet = String(hit.snippet ?? '').replace(/^…|…$/g, '').trim()
      if (snippet !== '') fragments.push(snippet.slice(0, 24))
      if (typeof query === 'string' && query.trim() !== '') fragments.push(query.trim())
      for (const fragment of fragments) {
        const needle = fragment.replace(/\s+/g, ' ')
        for (const node of nodes) {
          const text = String(node.textContent ?? '').replace(/\s+/g, ' ')
          if (text.includes(needle)) return node
        }
      }
      if (typeof hit.turn === 'number') {
        const byTurn = flow.querySelector(`[data-chat-turn="${hit.turn}"]`)
        if (byTurn !== null) return byTurn
      }
      return null
    }

    function flash(node) {
      if (node === null) return
      node.classList.add('dsc-flash')
      window.setTimeout(() => {
        try {
          node.classList.remove('dsc-flash')
        } catch {
          // The row may have been replaced while the highlight was showing.
        }
      }, 2600)
    }

    async function jumpTo(ctx, hit, query, t) {
      const uiWorkspace = ctx.get('uiWorkspace')
      const sessions = ctx.get('sessions')
      if (typeof uiWorkspace?.openSession !== 'function' || typeof sessions?.binding !== 'function') {
        throw new Error(t('jump.unavailable'))
      }
      let target = hit
      if (typeof target.turn !== 'number') {
        try {
          const resolved = await api(`${ROUTES.turn}?sessionId=${encodeURIComponent(hit.sessionId)}&seq=${hit.seq}`)
          if (typeof resolved?.turn === 'number') target = { ...hit, turn: resolved.turn, step: resolved.step }
        } catch {
          // The text probe below can still land without a turn number.
        }
      }
      uiWorkspace.openSession(hit.sessionId)
      const binding = await waitFor(() => sessions.binding(hit.sessionId), 9000)
      if (binding === null || binding === undefined) throw new Error(t('jump.sessionMissing'))
      try {
        await binding.session.loadThrough(hit.seq)
      } catch {
        // The row may already be loaded; the DOM probe below decides.
      }
      const node = await waitFor(() => findMessageNode(target, query), 9000)
      if (node === null) throw new Error(t('jump.notFound'))
      node.scrollIntoView({ block: 'center', behavior: 'smooth' })
      flash(node)
      return target.turn
    }

    function SearchPanel(props) {
      const { t, ctx, sessionId, useSessions } = props
      const currentCwd = typeof useSessions === 'function'
        ? useSessions((state) => state?.byId?.[sessionId]?.cwd ?? null)
        : null
      const [query, setQuery] = useState('')
      const [match, setMatch] = useState('phrase')
      const [order, setOrder] = useState('desc')
      const [scope, setScope] = useState('all')
      const [status, setStatus] = useState(null)
      const [result, setResult] = useState(null)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState(null)
      const [jumpState, setJumpState] = useState({ busy: false, error: null, hitKey: null })
      const abortRef = useRef(null)
      const queryRef = useRef(query)
      queryRef.current = query

      useEffect(() => {
        let alive = true
        api(ROUTES.status).then((data) => {
          if (alive) setStatus(data)
        }).catch((cause) => {
          if (alive) setStatus({ ok: false, sessionQuery: false, error: cause })
        })
        return () => {
          alive = false
        }
      }, [])

      useEffect(() => {
        const text = query.trim()
        if (abortRef.current !== null) abortRef.current.abort()
        if (text === '') {
          setResult(null)
          setError(null)
          setLoading(false)
          return undefined
        }
        const controller = new AbortController()
        abortRef.current = controller
        setLoading(true)
        setError(null)
        const timer = window.setTimeout(() => {
          api(ROUTES.search, {
            method: 'POST',
            signal: controller.signal,
            body: {
              query: text,
              match,
              order,
              limit: DEFAULT_LIMIT,
              offset: 0,
              ...(scope === 'current' && typeof currentCwd === 'string' ? { cwd: currentCwd } : {}),
            },
          }).then((data) => {
            if (!controller.signal.aborted) setResult(data)
          }).catch((cause) => {
            if (controller.signal.aborted || cause?.name === 'AbortError') return
            setError(cause?.code === 'NO_SESSION_QUERY' ? new Error(t('error.NO_SESSION_QUERY')) : cause)
          }).finally(() => {
            if (!controller.signal.aborted) setLoading(false)
          })
        }, 300)
        return () => {
          window.clearTimeout(timer)
          controller.abort()
        }
      }, [query, match, order, scope, currentCwd, t])

      const loadMore = useCallback(() => {
        if (result === null || result.nextOffset === null || loading) return
        setLoading(true)
        api(ROUTES.search, {
          method: 'POST',
          body: {
            query: queryRef.current.trim(),
            match,
            order,
            limit: DEFAULT_LIMIT,
            offset: result.nextOffset,
            ...(scope === 'current' && typeof currentCwd === 'string' ? { cwd: currentCwd } : {}),
          },
        }).then((page) => {
          setResult((previous) => previous === null ? page : {
            ...page,
            items: [...previous.items, ...page.items],
          })
        }).catch((cause) => setError(cause)).finally(() => setLoading(false))
      }, [result, loading, match, order, scope, currentCwd])

      const onJump = useCallback(async (hit) => {
        const key = `${hit.sessionId}:${hit.seq}`
        setJumpState({ busy: true, error: null, hitKey: key })
        try {
          const turn = await jumpTo(ctx, hit, queryRef.current, t)
          setJumpState({
            busy: false,
            error: null,
            hitKey: key,
            message: typeof turn === 'number' ? t('jump.ok', { turn }) : t('jump.ok', { turn: '?' }),
          })
          window.setTimeout(() => {
            setJumpState((state) => state.hitKey === key ? { ...state, message: null } : state)
          }, 3200)
        } catch (cause) {
          setJumpState({ busy: false, error: cause?.message ?? String(cause), hitKey: key })
        }
      }, [ctx, t])

      const groups = useMemo(() => {
        if (result === null) return []
        const rows = []
        let current = null
        for (const hit of result.items) {
          const day = nowDayKey(hit.time)
          if (current === null || current.day !== day) {
            current = { day, hits: [] }
            rows.push(current)
          }
          current.hits.push(hit)
        }
        return rows
      }, [result])

      const unavailable = status !== null && status.sessionQuery === false
      const statusText = status === null
        ? t('status.checking')
        : unavailable
          ? t('status.unavailable')
          : t('status.ready', { sessions: status.sessions ?? '?', workspaces: status.workspaces ?? '?' })

      return h('div', { className: 'dsc-root' },
        h('div', { className: 'dsc-head' },
          h('div', { className: 'dsc-title' },
            h('span', null, t('title')),
            h('span', { className: 'dsc-count' }, statusText),
          ),
          h('input', {
            className: 'dsc-input',
            type: 'search',
            value: query,
            placeholder: t('placeholder'),
            autoFocus: true,
            disabled: unavailable,
            onChange: (event) => setQuery(event.target.value),
          }),
          h('div', { className: 'dsc-row' },
            h('button', { type: 'button', className: 'dsc-chip', 'data-on': match === 'phrase' ? '1' : '0', onClick: () => setMatch('phrase') }, t('mode.phrase')),
            h('button', { type: 'button', className: 'dsc-chip', 'data-on': match === 'all-terms' ? '1' : '0', onClick: () => setMatch('all-terms') }, t('mode.all-terms')),
            h('button', { type: 'button', className: 'dsc-chip', 'data-on': match === 'any-term' ? '1' : '0', onClick: () => setMatch('any-term') }, t('mode.any-term')),
            h('span', { className: 'dsc-spacer' }),
            h('button', { type: 'button', className: 'dsc-chip', 'data-on': scope === 'current' ? '1' : '0', disabled: typeof currentCwd !== 'string', onClick: () => setScope((value) => value === 'current' ? 'all' : 'current') }, scope === 'current' ? t('scope.current') : t('scope.all')),
            h('button', { type: 'button', className: 'dsc-chip', onClick: () => setOrder((value) => value === 'desc' ? 'asc' : 'desc') }, order === 'desc' ? t('order.desc') : t('order.asc')),
          ),
        ),
        h('div', { className: 'dsc-status', 'data-error': error === null ? '0' : '1' },
          unavailable
            ? t('status.unavailable')
            : error !== null
              ? (error?.code === 'NO_SESSION_QUERY' ? t('error.NO_SESSION_QUERY') : (error.message || t('error.INTERNAL')))
              : loading
                ? t('loading')
                : result === null
                  ? ''
                  : result.total === 0
                    ? t('empty')
                    : [
                      t('result.total', { total: result.total }),
                      t('result.took', { ms: result.tookMs }),
                      result.source === 'scan' ? t('result.source.scan') : t('result.source.index'),
                      result.truncated ? t('result.truncated', { n: result.sessions }) : '',
                    ].filter(Boolean).join(' · '),
        ),
        jumpState.error !== null
          ? h('div', { className: 'dsc-status', 'data-error': '1' }, jumpState.error)
          : jumpState.message
            ? h('div', { className: 'dsc-status' }, jumpState.message)
            : null,
        h('div', { className: 'dsc-list' },
          result !== null && result.items.length === 0 && !loading
            ? h('div', { className: 'dsc-empty' }, t('empty'), h('br'), t('empty.hint'))
            : null,
          groups.map((group) => h(React.Fragment, { key: group.day },
            h('div', { className: 'dsc-day' }, dayLabel(group.day, t)),
            group.hits.map((hit) => {
              const key = `${hit.sessionId}:${hit.seq}`
              const busy = jumpState.busy && jumpState.hitKey === key
              const roleLabel = hit.role === 'assistant'
                ? t('role.assistant')
                : hit.role === 'tool'
                  ? t('role.tool')
                  : hit.role === 'system'
                    ? t('role.system')
                    : hit.role === 'meta'
                      ? t('role.meta')
                      : t('role')
              return h('button', {
                key,
                type: 'button',
                className: 'dsc-hit',
                'data-busy': busy ? '1' : '0',
                title: `${hit.workspaceTitle ?? ''}${hit.cwd ? ` · ${hit.cwd}` : ''}`,
                onClick: () => { if (!busy) void onJump(hit) },
              },
                h('div', { className: 'dsc-hit-top' },
                  h('span', { className: 'dsc-hit-title' }, hit.sessionTitle || hit.sessionId.slice(0, 12)),
                  h('span', { className: 'dsc-spacer' }),
                  h('span', { className: 'dsc-badge' }, roleLabel),
                  h('span', null, clock(hit.time)),
                ),
                h('div', { className: 'dsc-snippet' },
                  h(Highlighted, { text: hit.snippet, query: queryRef.current, match }),
                ),
                h('div', { className: 'dsc-hit-top' },
                  h('span', null, hit.workspaceTitle || ''),
                  h('span', { className: 'dsc-spacer' }),
                  busy ? h('span', null, t('jump.jumping')) : null,
                ),
              )
            }),
          )),
          result !== null && result.nextOffset !== null
            ? h('button', { type: 'button', className: 'dsc-more', onClick: loadMore, disabled: loading }, loading ? t('loading') : t('result.more'))
            : null,
        ),
      )
    }

    function LocaleBound(props) {
      const [, force] = useState(0)
      useEffect(() => {
        const locale = props.ctx.get('locale')
        if (typeof locale?.subscribe !== 'function') return undefined
        return locale.subscribe(() => force((value) => value + 1))
      }, [props.ctx])
      const t = useMemo(() => makeTranslate(props.ctx), [props.ctx, force])
      return h(SearchPanel, { ...props, t })
    }

    function SearchIcon(props) {
      const size = props?.size ?? 20
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
        h('line', { x1: 15.4, y1: 15.4, x2: 21, y2: 21 }),
      )
    }

    function installStyle(ctx) {
      if (typeof document === 'undefined') return
      if (document.getElementById(STYLE_ID) === null) {
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = CSS
        document.head.appendChild(style)
      }
      ctx.effect(() => () => {
        try {
          document.getElementById(STYLE_ID)?.remove()
        } catch {
          // Teardown after navigation is best-effort.
        }
      }, 'dsh-search-chat: styles')
    }

    function installSidebarTab(ctx) {
      if (typeof ctx.slots?.inject !== 'function') return null
      return ctx.slots.inject('sidebar.right.pane.tab', () => {
        let disposed = false
        let poll = 0
        let teardown = null
        const attempt = () => {
          if (disposed) return
          const tabs = ctx.get('sidebarRightTabs')
          const controller = ctx.get('sidebarRight')
          if (typeof tabs?.register !== 'function' || typeof controller?.openTab !== 'function') {
            poll = window.setTimeout(attempt, 250)
            return
          }
          let disposeType = null
          let disposeBody = null
          const t = makeTranslate(ctx)
          try {
            disposeType = tabs.register({
              id: TAB_ID,
              kind: TAB_KIND,
              keepMounted: true,
              title: () => t('title'),
              guide: [{
                id: 'search',
                order: 6,
                title: () => t('title'),
                description: () => t('guide.description'),
                icon: SearchIcon,
              }],
            })
            disposeBody = ctx.slots.register({
              name: 'sidebar.right.pane.tab',
              key: TAB_ID,
            }, (props) => h(LocaleBound, { ...props, ctx }))
          } catch {
            try { disposeBody?.() } catch { /* ignore */ }
            try { disposeType?.() } catch { /* ignore */ }
            return
          }
          teardown = () => {
            try { disposeBody?.() } catch { /* ignore */ }
            try { disposeType?.() } catch { /* ignore */ }
          }
        }
        attempt()
        return () => {
          disposed = true
          if (poll !== 0) window.clearTimeout(poll)
          try { teardown?.() } catch { /* ignore */ }
        }
      })
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        installStyle(ctx)
        ctx.effect(() => {
          const dispose = installSidebarTab(ctx)
          return () => {
            if (typeof dispose === 'function') dispose()
          }
        }, 'dsh-search-chat: right sidebar tab')
      },
    }
  },
})
