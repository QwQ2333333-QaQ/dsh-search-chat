# dsh-search-chat

[![npm version](https://img.shields.io/npm/v/dsh-search-chat?color=brightgreen)](https://www.npmjs.com/package/dsh-search-chat)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-%E2%89%A50.2.2-2f6fed)](https://github.com/deepseek-ai/deepseek-harness)

DeepSeek Harness（DSH）右侧栏的**会话搜索**插件：跨全部工作区、对聊天记录做**字面匹配**，结果按时间排列；点击任意一条即可打开对应会话并跳到那条消息附近。

> 当前版本 **v0.4.1**：在字面搜索基础上增加了「日期时间轴」「搜索历史」「本地缓存」。
> 仍然**不引入语料库、不下载模型、不调用外部 API**，所有检索都在本机完成。
>
> - npm：<https://www.npmjs.com/package/dsh-search-chat>
> - 仓库：<https://github.com/QwQ2333333-QaQ/dsh-search-chat>

## 功能

- 🔍 跨工作区搜索：数据来自 DSH 官方的 `sessionQuery` 会话索引，覆盖所有工作区的历史会话。
- 🧩 三种字面匹配：整段短语、全部词包含、任一词包含；中文、英文、代码片段都可以。
- ✅ 结果可信：先走索引找候选，再对每条命中**回读原文做字面校验**；索引漏检时自动退化为逐会话字面扫描。
- 🕒 按时间排序：支持时间正序/倒序，结果按天分组。
- 🎯 点击跳转：打开会话 → 加载到目标 seq → 滚动到匹配消息并高亮 2.4 秒；失败会明确提示（不会静默）。
- 🗓️ 日期时间轴：选一个日期后加载该日 ±3 天的聊天记录（时间正序），向上滚动加载更早 3 天、向下滚动加载更晚 3 天；有关键词时只在窗口内过滤。
- 📅 月历可用性：没有对话的日期变暗且不可选；有对话的日期可直接跳转。
- 🕘 搜索历史：聚焦输入框自动弹出，最近优先；点击重搜、悬停单删、清空需二次确认；刷新/重启保留。
- ⚡ 本地缓存：相同查询第二次直接读缓存，状态栏显示「缓存」；语料变化或窗口含今天时自动失效。
- 🎨 可自定义外观：关键词高亮底色/文字色/加粗、整个搜索面板背景色与不透明度、面板文字色，带预设与恢复默认；设置持久化保存。
- 🌗 主题中立：默认透明背景继承宿主主题，高亮采用高对比亮黄 + 深色文字，深/浅色皮肤与壁纸下都清晰。
- 🌐 中英文文案。

## 环境要求

- DSH **0.2.2-rc.1 及以上**（需要右侧栏扩展点与 `sessionQuery` 服务）。
- 桌面端与 `dsh web` 均可；本插件不改动任何宿主文件或其它插件。

## 安装

### 从 npm 安装（推荐）

已发布到 npm：<https://www.npmjs.com/package/dsh-search-chat>

用 DSH 的插件管理器按包名安装（建议带上版本号，便于复现）：

```text
plugin_manager install_bundle  target = dsh-search-chat@0.4.1
```

也可以先在本机查看包内容：

```bash
npm install dsh-search-chat
```

安装完成后如果右侧栏没有立即出现，重启 DSH 客户端（宿主路由与客户端模块在启动时装载）。

### 本机开发安装

在本目录（`package.json` 所在目录）用 DSH 的插件管理器安装**绝对路径**：

```text
plugin_manager install_bundle  target = D:\Deepseek Workpalcae\dsh-search-chat
```

### 卸载

```text
plugin_manager remove_bundle  target = dsh-search-chat
```

## 使用

1. 右侧栏点击「会话搜索」（或右侧栏指南页里的同名入口）。
2. 输入要查找的文字；默认「整段匹配」，也可以切「全部词 / 任一词」。
3. 需要时切换「当前工作区」范围与时间顺序。
4. 点击结果：会自动打开该会话、加载历史并滚动到匹配消息附近，同时闪烁高亮。

状态栏会显示命中总数、耗时、以及这次是用「索引」还是「扫描」得到的。

## 外观与高亮设置

点击标题右侧的 **⚙** 展开「外观设置」：

| 设置 | 默认 | 说明 |
|---|---|---|
| 高亮底色 | `#ffd54f`（亮黄） | 命中关键词的背景色，附 1px 深色描边，避免与皮肤背景混在一起 |
| 高亮文字 | 自动 | 默认按底色亮度自动取黑/白，保证对比度；也可以手动指定 |
| 关键词加粗 | 开 | 关闭后只靠底色区分 |
| 面板背景 | 透明 | 想更好读可以选一个颜色，并用滑条调整不透明度 |
| 面板文字 | 继承 | 选深色面板背景后建议改为浅色文字 |
| 预设 | 默认 / 高对比 / 柔和 | 一键切换整套高亮方案 |
| 恢复默认 | — | 回到透明背景 + 亮黄高亮 |

改动立即生效，约 0.5 秒后自动保存到 `$DSH_HOME/.dsh-search-chat.json`（刷新页面、重启客户端、重装插件都会保留）。保存失败时界面会提示「仅本次生效」，不影响搜索。

## 日期时间轴 / 搜索历史 / 本地缓存

**日期时间轴**

- 点「选择日期」打开自绘月历；没有对话的日期变暗且不可点选（依据最近 100 个会话的事件时间聚合）。
- 选中日期后加载该日 **±3 天**的聊天记录，按时间正序排列；
- 列表顶部/底部提供「加载更早 3 天 / 加载更晚 3 天」按钮，滚动到边缘也会自动加载；
- 有关键词时只在该时间窗口内做字面匹配；清空日期（✕）回到全局关键词搜索。

**搜索历史**

- 输入框聚焦时弹出，按最近使用时间排序；
- 点击任一项回填查询条件并立即搜索（相同条件会命中缓存）；
- 鼠标悬停在条目上才显示 ✕ 单条删除；
- 底部「清空历史」会先二次确认（取消 / 清空），确认后清空全部记录；
- 保存在 `$DSH_HOME/dsh-search-chat/history.json`，刷新/重启保留。

**本地缓存**

- 关键词搜索与时间窗口结果都会按「请求键 + 语料签名」缓存；
- 同一查询第二次直接读缓存，状态栏显示「缓存」；
- 语料签名（会话数 + 最新会话时间 + 当天日期）变化时自动失效；
- 窗口包含今天时只使用内存缓存，避免读到活动会话的旧快照；
- 缓存文件位于 `$DSH_HOME/dsh-search-chat/cache/`，自动做 LRU 清理（最多 200 个 / 20MB）。

## 已知限制

- **字面匹配**：不会理解同义词或语义，找「大意」请换几个关键词；语义检索在路线图 0.3.0（可选、默认关闭）。
- **长会话**：关键词搜索固定最多扫描 80 个会话、每会话 8 条命中；日期时间轴每个窗口最多 500 条、每会话 200 条，超出会截断。用日期窗口可以显著缩小扫描范围。
- **跳转精度**：优先按命中片段在聊天行里定位，其次按轮次定位；若当前会话打开的不是「聊天」视图，会提示无法定位。
- **内部 DOM 依赖**：跳转使用聊天行的 `data-chat-*` 属性（产品内部属性，非公开 API）。选择器集中在 `lib/client.js` 的跳转区，DSH 升级后只需调整这一处。详见 [docs/API-NOTES.md](docs/API-NOTES.md)。

## 隐私与安全

- 搜索、历史与缓存完全在本机完成：没有遥测、没有外部请求、不读取或返回任何凭据。
- 搜索历史与缓存写在插件私有目录 `$DSH_HOME/dsh-search-chat/`，可随时删除，不影响 DSH 会话数据。
- 宿主路由只接受**回环地址**请求，并拒绝跨站请求（`Sec-Fetch-Site: cross-site`）与异源 Origin。
- 查询内容与结果不写入日志。

## 开发

```bash
npm run validate   # 语法检查 + 清单/挂载文件检查
npm test           # node:test 单元测试（检索核心 + 服务编排 + 清单）
```

目录：

```text
lib/index.js         宿主插件：9 条本机 JSON 路由
lib/search-service.js 检索编排（索引候选 → 字面校验 → 扫描兜底）+ 时间轴/日历/历史
lib/search-core.js    纯函数：匹配/片段/排序/分页
lib/settings.js       外观设置的校验、读取与原子写入（v3）
lib/cache-store.js    本地结果缓存（内存 LRU + 磁盘 JSON + 语料签名）
lib/history-store.js  搜索历史（去重、上限、单删、清空）
lib/calendar-index.js 日期可用性与时间窗口换算
lib/paths.js          $DSH_HOME 下的插件私有目录
lib/fence.js          回环与同源校验
lib/protocol.js       路由、固定上限与时间轴常量
lib/client.js         浏览器半侧：右侧栏 tab + 搜索 + 月历时间轴 + 历史 + 外观 + 跳转
test/                 node:test
docs/                 API 备注与路线图
```

开发循环：改客户端（`lib/client.js`）→ 刷新页面；改宿主（`lib/index.js` 等）→ **重启 DSH 客户端**再验证。只重装插件而不重启时，DSH 的热重载可能在 Host 路由表里留下上一实例的注册，导致新实例的路由被判重复（插件已做自愈清理与重复容错，但首次仍建议重启一次）；版本按语义化递增并更新 `CHANGELOG.md`。

## License

MIT。见 [LICENSE](LICENSE)。

---

## English summary

A right-sidebar session search plugin for DeepSeek Harness. It searches chat
history across **all workspaces** using literal character matching (phrase,
all terms, or any term), lists hits in time order, and jumps the conversation
to the matched message with a short highlight.

- Requires DSH `>= 0.2.2-rc.1` (right-sidebar extension points + `sessionQuery`).
- No corpus, embeddings, or external API calls in v0.1.0.
- Host routes are loopback-only and reject cross-site requests; no credentials
  are read, returned, or logged.
- Jumping relies on the product's internal `data-chat-*` row attributes; the
  selectors are isolated and documented in `docs/API-NOTES.md`.
- Appearance is configurable (highlight background/text/bold, panel background
  and opacity, panel text) with presets; settings persist under `$DSH_HOME`.

Install the absolute package directory with the DSH plugin manager, restart the
client if the tab does not appear immediately.
