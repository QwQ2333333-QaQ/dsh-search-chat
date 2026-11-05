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
      settings: '/dsh-search-chat/settings',
      timeline: '/dsh-search-chat/timeline',
      calendar: '/dsh-search-chat/calendar',
      history: '/dsh-search-chat/history',
    }
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
      'settings.open': '外观设置',
      'settings.close': '收起设置',
      'settings.preset.default': '默认',
      'settings.preset.contrast': '高对比',
      'settings.preset.soft': '柔和',
      'settings.preset.custom': '自定义',
      'settings.markBackground': '高亮底色',
      'settings.markText': '高亮文字',
      'settings.auto': '自动',
      'settings.markBold': '关键词加粗',
      'settings.panelBackground': '面板背景',
      'settings.transparent': '透明',
      'settings.opacity': '不透明度',
      'settings.panelText': '面板文字',
      'settings.restore': '恢复默认',
      'settings.saved': '已保存',
      'settings.saving': '保存中…',
      'settings.saveFailed': '仅本次生效（保存失败）',
      'settings.loadFailed': '读取设置失败，使用默认外观',
      'date.all': '全部时间',
      'date.only': '指定日期',
      'date.today': '今天',
      'date.range': '日期 ±{days} 天',
      'date.radius': '附近 {days} 天',
      'search.scope': '搜索范围',
      'search.perSession': '每会话命中',
      'search.scanSessions': '扫描会话数',
      'search.pageSize': '每页条数',
      'search.reset': '恢复默认',
      'history.title': '搜索历史',
      'history.empty': '还没有搜索记录',
      'history.clear': '清空历史',
      'history.delete': '删除',
      'history.confirm': '确定清空全部历史？',
      'history.confirmAction': '清空',
      'history.cancel': '取消',
      'date.pick': '选择日期',
      'date.clear': '清除日期',
      'date.prevMonth': '上一月',
      'date.nextMonth': '下一月',
      'date.noData': '无对话',
      'timeline.loadOlder': '加载更早 {days} 天',
      'timeline.loadNewer': '加载更晚 {days} 天',
      'timeline.oldest': '已经到最早',
      'timeline.newest': '已经到最晚',
      'timeline.loading': '加载中…',
      'cache.hit': '缓存',
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
      'settings.open': 'Appearance',
      'settings.close': 'Hide appearance',
      'settings.preset.default': 'Default',
      'settings.preset.contrast': 'High contrast',
      'settings.preset.soft': 'Soft',
      'settings.preset.custom': 'Custom',
      'settings.markBackground': 'Highlight background',
      'settings.markText': 'Highlight text',
      'settings.auto': 'Auto',
      'settings.markBold': 'Bold keywords',
      'settings.panelBackground': 'Panel background',
      'settings.transparent': 'Transparent',
      'settings.opacity': 'Opacity',
      'settings.panelText': 'Panel text',
      'settings.restore': 'Reset to defaults',
      'settings.saved': 'Saved',
      'settings.saving': 'Saving…',
      'settings.saveFailed': 'Applied for this session only (save failed)',
      'settings.loadFailed': 'Could not read settings; using defaults',
      'date.all': 'All time',
      'date.only': 'Pick a date',
      'date.today': 'Today',
      'date.range': 'Date ±{days} days',
      'date.radius': '±{days} days',
      'search.scope': 'Search scope',
      'search.perSession': 'Hits per session',
      'search.scanSessions': 'Sessions to scan',
      'search.pageSize': 'Results per page',
      'search.reset': 'Reset search scope',
      'history.title': 'Search history',
      'history.empty': 'No searches yet',
      'history.clear': 'Clear history',
      'history.delete': 'Delete',
      'history.confirm': 'Clear the entire search history?',
      'history.confirmAction': 'Clear',
      'history.cancel': 'Cancel',
      'date.pick': 'Pick a date',
      'date.clear': 'Clear date',
      'date.prevMonth': 'Previous month',
      'date.nextMonth': 'Next month',
      'date.noData': 'No chats',
      'timeline.loadOlder': 'Load {days} earlier days',
      'timeline.loadNewer': 'Load {days} later days',
      'timeline.oldest': 'Reached the earliest day',
      'timeline.newest': 'Reached the latest day',
      'timeline.loading': 'Loading…',
      'cache.hit': 'cache',
      dismiss: 'Close',
    }

    const CSS = `
      .dsc-root{display:flex;flex-direction:column;height:100%;min-height:0;gap:8px;padding:10px;box-sizing:border-box;color:var(--dsc-panel-fg,inherit);background:var(--dsc-panel-bg,transparent);font-size:13px;border-radius:10px;transition:background .2s ease,color .2s ease}
      .dsc-head{display:flex;flex-direction:column;gap:6px;position:relative}
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
      .dsc-mark{background:var(--dsc-mark-bg,#ffd54f);color:var(--dsc-mark-fg,#111111);border-radius:3px;padding:0 2px;font-weight:var(--dsc-mark-weight,700);box-shadow:0 0 0 1px rgba(0,0,0,.35)}
      .dsc-empty{opacity:.65;font-size:12px;padding:18px 6px;text-align:center;line-height:1.6}
      .dsc-more{align-self:center;margin:6px 0;font-size:11px;padding:4px 12px;border-radius:999px;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;cursor:pointer}
      .dsc-foot{display:flex;align-items:center;gap:8px;font-size:11px;opacity:.65;min-height:16px}
      .dsc-title-actions{display:flex;align-items:center;gap:8px;min-width:0}
      .dsc-gear{appearance:none;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;border-radius:6px;width:22px;height:22px;padding:0;font-size:12px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;flex:none;opacity:.8}
      .dsc-gear:hover,.dsc-gear[aria-expanded="true"]{opacity:1;background:rgba(127,127,127,.12);border-color:rgba(127,127,127,.55)}
      .dsc-settings{border:1px solid rgba(127,127,127,.28);background:rgba(127,127,127,.06);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:7px}
      .dsc-settings-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;min-height:22px}
      .dsc-settings-label{min-width:66px;opacity:.8}
      .dsc-color{width:30px;height:22px;padding:0;border:1px solid rgba(127,127,127,.35);border-radius:4px;background:transparent;cursor:pointer;flex:none}
      .dsc-range{flex:1;min-width:70px;accent-color:#2f6fed}
      .dsc-mini{appearance:none;border:1px solid rgba(127,127,127,.3);background:transparent;color:inherit;border-radius:5px;padding:2px 7px;font:inherit;font-size:10px;cursor:pointer;white-space:nowrap}
      .dsc-mini:hover{background:rgba(127,127,127,.12)}
      .dsc-settings-note{font-size:10px;opacity:.62;margin-left:auto}
      .dsc-section{font-size:11px;font-weight:600;opacity:.85;margin-top:2px}
      .dsc-select{appearance:none;border:1px solid rgba(127,127,127,.35);background:rgba(127,127,127,.08);color:inherit;border-radius:6px;padding:3px 6px;font:inherit;font-size:11px;outline:none;cursor:pointer}
      .dsc-select:focus{border-color:#2f6fed}
      .dsc-date{width:auto;flex:none;padding:4px 6px;font-size:11px}
      .dsc-search-wrap{position:relative}
      .dsc-history{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 4px);background:var(--dsc-history-bg,#1b2030);border:1px solid rgba(127,127,127,.35);border-radius:8px;padding:4px;max-height:280px;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.25);color:inherit}
      .dsc-history-item{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px}
      .dsc-history-item:hover{background:rgba(127,127,127,.14)}
      .dsc-history-label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsc-history-meta{font-size:11px;opacity:.6;white-space:nowrap}
      .dsc-history-del{opacity:0;border:none;background:transparent;color:#e5484d;cursor:pointer;font-size:15px;line-height:1;padding:0 6px;transition:opacity .15s;border-radius:4px}
      .dsc-history-item:hover .dsc-history-del,.dsc-history-del:focus-visible{opacity:1}
      .dsc-history-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 7px;border-top:1px solid rgba(127,127,127,.25);margin-top:4px;font-size:12px}
      .dsc-history-empty{padding:8px;font-size:12px;opacity:.6;text-align:center}
      .dsc-danger{color:#e5484d}
      .dsc-calendar{position:absolute;z-index:40;top:calc(100% + 4px);left:0;background:var(--dsc-history-bg,#1b2030);border:1px solid rgba(127,127,127,.35);border-radius:10px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);width:min(240px,100%);max-height:min(60vh,420px);overflow:auto;color:inherit}
      .dsc-cal-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;font-size:12px}
      .dsc-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
      .dsc-cal-week{font-size:10px;opacity:.55;text-align:center;padding:2px 0}
      .dsc-cal-day{appearance:none;border:1px solid transparent;background:transparent;color:inherit;border-radius:6px;height:26px;font:inherit;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center}
      .dsc-cal-day:hover:not(:disabled){background:rgba(127,127,127,.16)}
      .dsc-cal-day[data-empty="1"]{opacity:.25;cursor:not-allowed}
      .dsc-cal-day[data-today="1"]{border-color:rgba(47,111,237,.55)}
      .dsc-cal-day[data-selected="1"]{background:rgba(47,111,237,.35);font-weight:700}
      .dsc-cal-actions{display:flex;justify-content:space-between;gap:6px;margin-top:8px}
      .dsc-day-sep{position:sticky;top:0;z-index:2;font-size:11px;opacity:.75;padding:7px 2px 4px;background:var(--dsc-panel-bg,transparent);backdrop-filter:blur(4px)}
      .dsc-timeline-ctl{display:flex;justify-content:center;padding:4px 0}
      .dsc-check{display:inline-flex;align-items:center;gap:4px;cursor:pointer}
      .dsc-swatch{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.25);vertical-align:-2px}
      .dsc-flash{animation:dsc-flash 2.4s ease-out;border-radius:8px;outline:2px solid rgba(47,111,237,.75);outline-offset:2px}
      @keyframes dsc-flash{0%{background:rgba(47,111,237,.32)}100%{background:transparent}}
    `

    const DEFAULT_THEME = Object.freeze({
      preset: 'default',
      markBackground: '#ffd54f',
      markText: null,
      markBold: true,
      panelBackground: null,
      panelBackgroundOpacity: 100,
      panelText: null,
    })

    const PRESET_THEMES = Object.freeze({
      default: DEFAULT_THEME,
      contrast: Object.freeze({
        ...DEFAULT_THEME,
        preset: 'contrast',
        markBackground: '#ffe14d',
        markText: '#000000',
        markBold: true,
      }),
      soft: Object.freeze({
        ...DEFAULT_THEME,
        preset: 'soft',
        markBackground: '#ffe9b8',
        markBold: false,
      }),
    })

    const PRESET_NAMES = ['default', 'contrast', 'soft']

    const FIXED_PAGE_SIZE = 40
    const TIMELINE_RADIUS_DAYS = 3
    const TIMELINE_STEP_DAYS = 3
    const DAY_MS = 86_400_000

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    function dayKeyOf(date) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    function todayKey() {
      return dayKeyOf(new Date())
    }

    function monthKeyOf(date = new Date()) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
    }

    function shiftMonthKey(monthKey, delta) {
      const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? ''))
      const date = match === null
        ? new Date()
        : new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1)
      return monthKeyOf(date)
    }

    /** Monday-first cells for one month; null marks the leading blanks. */
    function monthCells(monthKey) {
      const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? ''))
      if (match === null) return []
      const year = Number(match[1])
      const month = Number(match[2]) - 1
      const lead = (new Date(year, month, 1).getDay() + 6) % 7
      const days = new Date(year, month + 1, 0).getDate()
      const cells = Array.from({ length: lead }, () => null)
      for (let day = 1; day <= days; day += 1) cells.push(`${year}-${pad2(month + 1)}-${pad2(day)}`)
      return cells
    }

    function formatDayLabel(day) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''))
      return match === null ? String(day ?? '') : `${Number(match[2])}月${Number(match[3])}日`
    }

    function timelineGroups(items) {
      const groups = []
      let current = null
      for (const hit of items) {
        const day = dayKeyOf(new Date(hit.time))
        if (current === null || current.day !== day) {
          current = { day, hits: [] }
          groups.push(current)
        }
        current.hits.push(hit)
      }
      return groups
    }
    const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

    function isValidHex(value) {
      return typeof value === 'string' && HEX_COLOR.test(value)
    }

    function expandHex(value) {
      if (!isValidHex(value)) return null
      const lower = value.toLowerCase()
      if (lower.length === 7) return lower
      return `#${lower[1]}${lower[1]}${lower[2]}${lower[2]}${lower[3]}${lower[3]}`
    }

    /** Merge a stored/preset theme over the defaults, dropping invalid values. */
    function normalizeTheme(raw) {
      const input = raw !== null && typeof raw === 'object' ? raw : {}
      const theme = { ...DEFAULT_THEME }
      if (PRESET_NAMES.includes(input.preset) || input.preset === 'custom') theme.preset = input.preset
      const background = expandHex(input.markBackground)
      if (background !== null) theme.markBackground = background
      if (input.markText === null) theme.markText = null
      else {
        const markText = expandHex(input.markText)
        if (markText !== null) theme.markText = markText
      }
      if (typeof input.markBold === 'boolean') theme.markBold = input.markBold
      if (input.panelBackground === null) theme.panelBackground = null
      else {
        const panelBackground = expandHex(input.panelBackground)
        if (panelBackground !== null) theme.panelBackground = panelBackground
      }
      if (typeof input.panelBackgroundOpacity === 'number' && Number.isFinite(input.panelBackgroundOpacity)) {
        theme.panelBackgroundOpacity = Math.max(0, Math.min(100, Math.round(input.panelBackgroundOpacity)))
      }
      if (input.panelText === null) theme.panelText = null
      else {
        const panelText = expandHex(input.panelText)
        if (panelText !== null) theme.panelText = panelText
      }
      return theme
    }

    function hexToRgba(hex, opacity) {
      const value = expandHex(hex) ?? '#000000'
      const r = parseInt(value.slice(1, 3), 16)
      const g = parseInt(value.slice(3, 5), 16)
      const b = parseInt(value.slice(5, 7), 16)
      const alpha = Math.max(0, Math.min(1, opacity))
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }

    /** Pick a readable text color for one background color. */
    function contrastText(hex) {
      const value = expandHex(hex) ?? '#000000'
      const r = parseInt(value.slice(1, 3), 16)
      const g = parseInt(value.slice(3, 5), 16)
      const b = parseInt(value.slice(5, 7), 16)
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      return luminance > 0.55 ? '#111111' : '#ffffff'
    }

    /** CSS custom properties consumed by the panel stylesheet. */
    function themeVars(theme) {
      const markBackground = theme.markBackground
      const markText = theme.markText ?? contrastText(markBackground)
      const panelBackground = theme.panelBackground === null
        ? 'transparent'
        : hexToRgba(theme.panelBackground, theme.panelBackgroundOpacity / 100)
      return {
        '--dsc-mark-bg': markBackground,
        '--dsc-mark-fg': markText,
        '--dsc-mark-weight': theme.markBold ? 700 : 500,
        '--dsc-panel-bg': panelBackground,
        '--dsc-panel-fg': theme.panelText ?? 'inherit',
      }
    }

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

    function AppearanceSettings({ theme, t, saveState, onChange, onReset }) {
      const patch = (part) => onChange({ ...theme, ...part, preset: part.preset ?? 'custom' })
      const markTextValue = theme.markText ?? contrastText(theme.markBackground)
      const panelTextValue = theme.panelText
        ?? (theme.panelBackground === null ? '#ffffff' : contrastText(theme.panelBackground))
      const note = saveState === 'saving'
        ? t('settings.saving')
        : saveState === 'saved'
          ? t('settings.saved')
          : saveState === 'failed'
            ? t('settings.saveFailed')
            : ''
      return h('div', { className: 'dsc-settings' },
        h('div', { className: 'dsc-settings-row' },
          h('span', { className: 'dsc-settings-label' }, t('settings.open')),
          PRESET_NAMES.map((name) => h('button', {
            key: name,
            type: 'button',
            className: 'dsc-chip',
            'data-on': theme.preset === name ? '1' : '0',
            onClick: () => onChange({ ...PRESET_THEMES[name] }),
          }, t(`settings.preset.${name}`))),
        ),
        h('div', { className: 'dsc-settings-row' },
          h('span', { className: 'dsc-settings-label' }, t('settings.markBackground')),
          h('input', {
            type: 'color',
            className: 'dsc-color',
            value: theme.markBackground,
            onChange: (event) => patch({ markBackground: event.target.value }),
          }),
          h('span', { className: 'dsc-settings-label', style: { minWidth: 'auto' } }, t('settings.markText')),
          h('input', {
            type: 'color',
            className: 'dsc-color',
            value: markTextValue,
            onChange: (event) => patch({ markText: event.target.value }),
          }),
          h('button', { type: 'button', className: 'dsc-mini', onClick: () => patch({ markText: null }) }, t('settings.auto')),
        ),
        h('div', { className: 'dsc-settings-row' },
          h('label', { className: 'dsc-check' },
            h('input', {
              type: 'checkbox',
              checked: theme.markBold,
              onChange: (event) => patch({ markBold: event.target.checked }),
            }),
            t('settings.markBold'),
          ),
        ),
        h('div', { className: 'dsc-settings-row' },
          h('span', { className: 'dsc-settings-label' }, t('settings.panelBackground')),
          h('input', {
            type: 'color',
            className: 'dsc-color',
            value: theme.panelBackground ?? '#12161f',
            onChange: (event) => patch({ panelBackground: event.target.value }),
          }),
          h('button', { type: 'button', className: 'dsc-mini', onClick: () => patch({ panelBackground: null }) }, t('settings.transparent')),
          h('span', { className: 'dsc-settings-label', style: { minWidth: 'auto' } }, t('settings.opacity')),
          h('input', {
            type: 'range',
            className: 'dsc-range',
            min: 0,
            max: 100,
            step: 5,
            value: theme.panelBackgroundOpacity,
            onChange: (event) => patch({
              // Dragging the slider on a transparent panel starts from a neutral
              // surface, so the control is never a dead end.
              panelBackground: theme.panelBackground ?? '#12161f',
              panelBackgroundOpacity: Number(event.target.value),
            }),
          }),
          h('span', { className: 'dsc-settings-note', style: { minWidth: '32px', marginLeft: '2px' } }, `${theme.panelBackgroundOpacity}%`),
        ),
        h('div', { className: 'dsc-settings-row' },
          h('span', { className: 'dsc-settings-label' }, t('settings.panelText')),
          h('input', {
            type: 'color',
            className: 'dsc-color',
            value: panelTextValue,
            onChange: (event) => patch({ panelText: event.target.value }),
          }),
          h('button', { type: 'button', className: 'dsc-mini', onClick: () => patch({ panelText: null }) }, t('settings.auto')),
        ),
        h('div', { className: 'dsc-settings-row' },
          h('button', { type: 'button', className: 'dsc-mini', style: { marginLeft: 'auto' }, onClick: onReset }, t('settings.restore')),
          note === '' ? null : h('span', { className: 'dsc-settings-note' }, note),
        ),
      )
    }

    function SearchPanel(props) {
      const { t, ctx, sessionId, useSessions } = props
      const currentCwd = typeof useSessions === 'function'
        ? useSessions((state) => state?.byId?.[sessionId]?.cwd ?? null)
        : null
      const [query, setQuery] = useState('')
      const [match, setMatch] = useState('phrase')
      const [order, setOrder] = useState('desc')
      const [status, setStatus] = useState(null)
      const [result, setResult] = useState(null)
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState(null)
      const [jumpState, setJumpState] = useState({ busy: false, error: null, hitKey: null })
      const [theme, setTheme] = useState(DEFAULT_THEME)
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [saveState, setSaveState] = useState('')
      const [historyItems, setHistoryItems] = useState([])
      const [historyOpen, setHistoryOpen] = useState(false)
      const [historyConfirm, setHistoryConfirm] = useState(false)
      const [selectedDate, setSelectedDate] = useState(null)
      const [calendarOpen, setCalendarOpen] = useState(false)
      const [calendarMonth, setCalendarMonth] = useState(() => monthKeyOf())
      const [calendarDays, setCalendarDays] = useState(null)
      const [timeline, setTimeline] = useState(null)
      const [timelineLoading, setTimelineLoading] = useState(null)
      const [timelineError, setTimelineError] = useState(null)
      const settingsLoaded = useRef(false)
      const abortRef = useRef(null)
      const timelineAbortRef = useRef(null)
      const historyWrapRef = useRef(null)
      const calendarRef = useRef(null)
      const dateRowRef = useRef(null)
      const queryRef = useRef(query)
      const addedQueryRef = useRef('')
      queryRef.current = query

      const addHistory = useCallback((mode, date) => {
        const text = queryRef.current.trim()
        if (text === '') return
        const item = { query: text, match, mode, date: date ?? null, radiusDays: TIMELINE_RADIUS_DAYS }
        api(ROUTES.history, { method: 'POST', body: { action: 'add', item } }).then((data) => {
          if (Array.isArray(data?.items)) setHistoryItems(data.items)
        }).catch(() => {})
      }, [match])

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
        let alive = true
        api(ROUTES.settings).then((data) => {
          if (!alive) return
          setTheme(normalizeTheme(data?.settings?.theme ?? data?.settings))
          settingsLoaded.current = true
        }).catch(() => {
          if (alive) settingsLoaded.current = true
        })
        return () => {
          alive = false
        }
      }, [])

      useEffect(() => {
        if (!settingsLoaded.current) return undefined
        const timer = window.setTimeout(() => {
          setSaveState('saving')
          api(ROUTES.settings, { method: 'POST', body: { theme } }).then(() => {
            setSaveState('saved')
          }).catch(() => {
            setSaveState('failed')
          })
        }, 450)
        return () => window.clearTimeout(timer)
      }, [theme])

      useEffect(() => {
        if (saveState !== 'saved' && saveState !== 'failed') return undefined
        const timer = window.setTimeout(() => setSaveState(''), 2400)
        return () => window.clearTimeout(timer)
      }, [saveState])

      useEffect(() => {
        api(ROUTES.history).then((data) => {
          if (Array.isArray(data?.items)) setHistoryItems(data.items)
        }).catch(() => {})
      }, [])

      useEffect(() => {
        if (!historyOpen) return undefined
        const onDown = (event) => {
          if (historyWrapRef.current !== null && !historyWrapRef.current.contains(event.target)) {
            setHistoryOpen(false)
          }
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [historyOpen])

      useEffect(() => {
        if (!calendarOpen) return undefined
        const onDown = (event) => {
          const inCalendar = calendarRef.current !== null && calendarRef.current.contains(event.target)
          const inRow = dateRowRef.current !== null && dateRowRef.current.contains(event.target)
          if (!inCalendar && !inRow) setCalendarOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
      }, [calendarOpen])

      useEffect(() => {
        if (!calendarOpen) return undefined
        let alive = true
        api(`${ROUTES.calendar}?month=${encodeURIComponent(calendarMonth)}`).then((data) => {
          if (alive) setCalendarDays(data?.days ?? {})
        }).catch(() => {
          if (alive) setCalendarDays({})
        })
        return () => {
          alive = false
        }
      }, [calendarOpen, calendarMonth])

      const cssVars = useMemo(() => themeVars(theme), [theme])

      useEffect(() => {
        if (selectedDate !== null) return undefined
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
              limit: FIXED_PAGE_SIZE,
              offset: 0,
              ...(typeof currentCwd === 'string' ? { cwd: currentCwd } : {}),
            },
          }).then((data) => {
            if (controller.signal.aborted) return
            setResult(data)
            if (addedQueryRef.current !== `${text}|${match}`) {
              addedQueryRef.current = `${text}|${match}`
              addHistory('all', null)
            }
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
      }, [query, match, order, selectedDate, currentCwd, t, addHistory])

      useEffect(() => {
        if (selectedDate === null) return undefined
        if (timelineAbortRef.current !== null) timelineAbortRef.current.abort()
        const controller = new AbortController()
        timelineAbortRef.current = controller
        const text = query.trim()
        setTimelineLoading('initial')
        setTimelineError(null)
        const timer = window.setTimeout(() => {
          api(ROUTES.timeline, {
            method: 'POST',
            signal: controller.signal,
            body: {
              anchorDate: selectedDate,
              radiusDays: TIMELINE_RADIUS_DAYS,
              stepDays: TIMELINE_STEP_DAYS,
              direction: 'initial',
              query: text,
              match,
            },
          }).then((data) => {
            if (controller.signal.aborted) return
            setTimeline({
              items: data?.items ?? [],
              window: data?.window ?? null,
              hasOlder: data?.hasOlder === true,
              hasNewer: data?.hasNewer === true,
              cached: data?.cached === true,
              tookMs: data?.tookMs ?? null,
            })
            if (text !== '' && addedQueryRef.current !== `${text}|${match}|${selectedDate}`) {
              addedQueryRef.current = `${text}|${match}|${selectedDate}`
              addHistory('date', selectedDate)
            }
          }).catch((cause) => {
            if (!controller.signal.aborted) setTimelineError(cause)
          }).finally(() => {
            if (!controller.signal.aborted) setTimelineLoading(null)
          })
        }, 300)
        return () => {
          window.clearTimeout(timer)
          controller.abort()
        }
      }, [selectedDate, query, match, t, addHistory])

      const loadTimeline = useCallback((direction) => {
        if (timeline === null || timeline.window === null) return
        if (direction === 'older' && !timeline.hasOlder) return
        if (direction === 'newer' && !timeline.hasNewer) return
        if (timelineLoading !== null) return
        setTimelineLoading(direction)
        api(ROUTES.timeline, {
          method: 'POST',
          body: {
            direction,
            windowFrom: timeline.window.from,
            windowTo: timeline.window.to,
            stepDays: TIMELINE_STEP_DAYS,
            query: queryRef.current.trim(),
            match,
          },
        }).then((data) => {
          setTimeline((previous) => {
            if (previous === null) return previous
            const map = new Map(previous.items.map((hit) => [`${hit.sessionId}:${hit.seq}`, hit]))
            for (const hit of data?.items ?? []) map.set(`${hit.sessionId}:${hit.seq}`, hit)
            const items = [...map.values()].sort((left, right) => left.time - right.time || left.seq - right.seq)
            return {
              ...previous,
              items,
              window: direction === 'older'
                ? { ...previous.window, from: data?.window?.from ?? previous.window.from }
                : { ...previous.window, to: data?.window?.to ?? previous.window.to },
              hasOlder: direction === 'older' ? data?.hasOlder === true : previous.hasOlder,
              hasNewer: direction === 'newer' ? data?.hasNewer === true : previous.hasNewer,
              cached: data?.cached === true,
            }
          })
        }).catch((cause) => setTimelineError(cause)).finally(() => setTimelineLoading(null))
      }, [timeline, timelineLoading, match])

      const loadMore = useCallback(() => {
        if (result === null || result.nextOffset === null || loading) return
        setLoading(true)
        api(ROUTES.search, {
          method: 'POST',
          body: {
            query: queryRef.current.trim(),
            match,
            order,
            limit: FIXED_PAGE_SIZE,
            offset: result.nextOffset,
            ...(typeof currentCwd === 'string' ? { cwd: currentCwd } : {}),
          },
        }).then((page) => {
          setResult((previous) => previous === null ? page : {
            ...page,
            items: [...previous.items, ...page.items],
          })
        }).catch((cause) => setError(cause)).finally(() => setLoading(false))
      }, [result, loading, match, order, currentCwd])

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
        if (selectedDate !== null) return timeline === null ? [] : timelineGroups(timeline.items)
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
      }, [result, timeline, selectedDate])

      const unavailable = status !== null && status.sessionQuery === false
      const statusText = status === null
        ? t('status.checking')
        : unavailable
          ? t('status.unavailable')
          : t('status.ready', { sessions: status.sessions ?? '?', workspaces: status.workspaces ?? '?' }) + (selectedDate === null ? '' : ` · ${t('date.range', { days: TIMELINE_RADIUS_DAYS })}`)

      const searchStatus = selectedDate !== null
        ? timelineError !== null
          ? (timelineError.message || t('error.INTERNAL'))
          : timelineLoading === 'initial'
            ? t('loading')
            : timeline === null
              ? ''
              : [
                t('result.total', { total: timeline.items.length }),
                timeline.cached ? t('cache.hit') : '',
              ].filter(Boolean).join(' · ')
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
                  result.cached ? t('cache.hit') : '',
                ].filter(Boolean).join(' · ')

      const renderHit = (hit) => {
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
      }

      const historyPanel = historyOpen
        ? h('div', { className: 'dsc-history' },
          historyItems.length === 0
            ? h('div', { className: 'dsc-history-empty' }, t('history.empty'))
            : historyItems.map((item) => h('div', {
              key: item.id,
              className: 'dsc-history-item',
              role: 'button',
              tabIndex: 0,
              onClick: () => {
                setQuery(item.query)
                setMatch(item.match)
                setSelectedDate(item.mode === 'date' && item.date ? item.date : null)
                setHistoryOpen(false)
              },
              onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.click() },
            },
              h('span', { className: 'dsc-history-label' }, item.query),
              h('span', { className: 'dsc-history-meta' }, item.mode === 'date' ? formatDayLabel(item.date) : ''),
              h('button', {
                type: 'button',
                className: 'dsc-history-del dsc-danger',
                title: t('history.delete'),
                'aria-label': t('history.delete'),
                onClick: (event) => {
                  event.stopPropagation()
                  api(ROUTES.history, { method: 'POST', body: { action: 'delete', id: item.id } }).then((data) => {
                    if (Array.isArray(data?.items)) setHistoryItems(data.items)
                  }).catch(() => {})
                },
              }, '✕'),
            )),
          h('div', { className: 'dsc-history-foot' },
            historyConfirm
              ? h(React.Fragment, null,
                h('span', null, t('history.confirm')),
                h('button', { type: 'button', className: 'dsc-mini', onClick: () => setHistoryConfirm(false) }, t('history.cancel')),
                h('button', {
                  type: 'button',
                  className: 'dsc-mini dsc-danger',
                  onClick: () => {
                    api(ROUTES.history, { method: 'POST', body: { action: 'clear' } }).then((data) => {
                      if (Array.isArray(data?.items)) setHistoryItems(data.items)
                    }).catch(() => {})
                    setHistoryConfirm(false)
                  },
                }, t('history.confirmAction')),
              )
              : h('button', { type: 'button', className: 'dsc-mini', style: { marginLeft: 'auto' }, onClick: () => setHistoryConfirm(true) }, t('history.clear')),
          ),
        )
        : null

      const cellDays = monthCells(calendarMonth)
      const hasAvailability = calendarDays !== null && Object.keys(calendarDays).length > 0
      const calendarPanel = calendarOpen
        ? h('div', { className: 'dsc-calendar', ref: calendarRef },
          h('div', { className: 'dsc-cal-head' },
            h('button', { type: 'button', className: 'dsc-mini', onClick: () => setCalendarMonth((value) => shiftMonthKey(value, -1)) }, '‹'),
            h('span', null, calendarMonth),
            h('button', { type: 'button', className: 'dsc-mini', onClick: () => setCalendarMonth((value) => shiftMonthKey(value, 1)) }, '›'),
          ),
          h('div', { className: 'dsc-cal-grid' },
            ['一', '二', '三', '四', '五', '六', '日'].map((label) => h('span', { key: label, className: 'dsc-cal-week' }, label)),
            cellDays.map((day, index) => day === null
              ? h('span', { key: `blank-${index}` })
              : h('button', {
                key: day,
                type: 'button',
                className: 'dsc-cal-day',
                'data-empty': hasAvailability && calendarDays[day] === undefined ? '1' : '0',
                'data-today': day === todayKey() ? '1' : '0',
                'data-selected': day === selectedDate ? '1' : '0',
                disabled: hasAvailability && calendarDays[day] === undefined,
                title: hasAvailability && calendarDays[day] === undefined ? t('date.noData') : day,
                onClick: () => {
                  setSelectedDate(day)
                  setCalendarOpen(false)
                },
              }, String(Number(day.slice(8))))),
          ),
          h('div', { className: 'dsc-cal-actions' },
            h('button', {
              type: 'button',
              className: 'dsc-mini',
              onClick: () => {
                setSelectedDate(null)
                setTimeline(null)
                setCalendarOpen(false)
              },
            }, t('date.clear')),
            h('button', {
              type: 'button',
              className: 'dsc-mini',
              onClick: () => {
                const day = todayKey()
                setSelectedDate(day)
                setCalendarMonth(monthKeyOf())
                setCalendarOpen(false)
              },
            }, t('date.today')),
          ),
        )
        : null

      return h('div', { className: 'dsc-root', style: cssVars },
        h('div', { className: 'dsc-head' },
          h('div', { className: 'dsc-title' },
            h('span', null, t('title')),
            h('div', { className: 'dsc-title-actions' },
              h('button', {
                type: 'button',
                className: 'dsc-gear',
                title: t(settingsOpen ? 'settings.close' : 'settings.open'),
                'aria-label': t(settingsOpen ? 'settings.close' : 'settings.open'),
                'aria-expanded': settingsOpen ? 'true' : 'false',
                onClick: () => setSettingsOpen((value) => !value),
              }, '⚙'),
              h('span', { className: 'dsc-count' }, statusText),
            ),
          ),
          h('div', { className: 'dsc-search-wrap', ref: historyWrapRef },
            h('input', {
              className: 'dsc-input',
              type: 'search',
              value: query,
              placeholder: t('placeholder'),
              autoFocus: true,
              disabled: unavailable,
              onFocus: () => setHistoryOpen(true),
              onChange: (event) => setQuery(event.target.value),
            }),
            historyPanel,
          ),
          h('div', { className: 'dsc-row', ref: dateRowRef },
            h('button', { type: 'button', className: 'dsc-chip', 'data-on': match === 'phrase' ? '1' : '0', onClick: () => setMatch('phrase') }, t('mode.phrase')),
            h('button', { type: 'button', className: 'dsc-chip', 'data-on': match === 'all-terms' ? '1' : '0', onClick: () => setMatch('all-terms') }, t('mode.all-terms')),
            h('button', { type: 'button', className: 'dsc-chip', 'data-on': match === 'any-term' ? '1' : '0', onClick: () => setMatch('any-term') }, t('mode.any-term')),
            h('span', { className: 'dsc-spacer' }),
            h('button', {
              type: 'button',
              className: 'dsc-chip',
              'data-on': selectedDate === null ? '0' : '1',
              'aria-expanded': calendarOpen ? 'true' : 'false',
              onClick: () => {
                setCalendarOpen((value) => !value)
                setCalendarMonth(monthKeyOf())
              },
            }, selectedDate === null ? t('date.pick') : formatDayLabel(selectedDate)),
            selectedDate !== null
              ? h('button', {
                type: 'button',
                className: 'dsc-chip',
                onClick: () => {
                  setSelectedDate(null)
                  setTimeline(null)
                  setCalendarOpen(false)
                },
              }, '✕')
              : null,
            selectedDate === null
              ? h('button', { type: 'button', className: 'dsc-chip', onClick: () => setOrder((value) => value === 'desc' ? 'asc' : 'desc') }, order === 'desc' ? t('order.desc') : t('order.asc'))
              : null,
          ),
          calendarPanel,
        ),
        settingsOpen
          ? h(AppearanceSettings, {
            theme,
            t,
            saveState,
            onChange: setTheme,
            onReset: () => setTheme({ ...DEFAULT_THEME }),
          })
          : null,
        h('div', { className: 'dsc-status', 'data-error': (error !== null || timelineError !== null) ? '1' : '0' },
          unavailable ? t('status.unavailable') : searchStatus,
        ),
        jumpState.error !== null
          ? h('div', { className: 'dsc-status', 'data-error': '1' }, jumpState.error)
          : jumpState.message
            ? h('div', { className: 'dsc-status' }, jumpState.message)
            : null,
        h('div', {
          className: 'dsc-list',
          onScroll: (event) => {
            if (selectedDate === null) return
            const element = event.currentTarget
            if (element.scrollTop <= 24 && timelineLoading === null) loadTimeline('older')
            if (element.scrollHeight - element.scrollTop - element.clientHeight <= 24 && timelineLoading === null) loadTimeline('newer')
          },
        },
          selectedDate !== null && timeline !== null && timeline.hasOlder
            ? h('div', { className: 'dsc-timeline-ctl' },
              h('button', { type: 'button', className: 'dsc-more', disabled: timelineLoading !== null, onClick: () => loadTimeline('older') }, timelineLoading === 'older' ? t('timeline.loading') : t('timeline.loadOlder', { days: TIMELINE_STEP_DAYS })))
            : null,
          selectedDate !== null && timeline !== null && !timeline.hasOlder && timeline.items.length > 0
            ? h('div', { className: 'dsc-timeline-ctl' }, t('timeline.oldest'))
            : null,
          groups.map((group) => h(React.Fragment, { key: group.day },
            h('div', { className: 'dsc-day-sep' }, dayLabel(group.day, t)),
            group.hits.map(renderHit),
          )),
          selectedDate !== null && timeline !== null && timeline.items.length === 0 && timelineLoading === null
            ? h('div', { className: 'dsc-empty' }, t('empty'))
            : null,
          result !== null && selectedDate === null && result.items.length === 0 && !loading
            ? h('div', { className: 'dsc-empty' }, t('empty'), h('br'), t('empty.hint'))
            : null,
          selectedDate !== null && timeline !== null && timeline.hasNewer
            ? h('div', { className: 'dsc-timeline-ctl' },
              h('button', { type: 'button', className: 'dsc-more', disabled: timelineLoading !== null, onClick: () => loadTimeline('newer') }, timelineLoading === 'newer' ? t('timeline.loading') : t('timeline.loadNewer', { days: TIMELINE_STEP_DAYS })))
            : null,
          selectedDate !== null && timeline !== null && !timeline.hasNewer && timeline.items.length > 0
            ? h('div', { className: 'dsc-timeline-ctl' }, t('timeline.newest'))
            : null,
          selectedDate === null && result !== null && result.nextOffset !== null
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
