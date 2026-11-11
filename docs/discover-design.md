# Discover 动态化:设计与执行规划

状态:设计已确认,待开始实施。按「执行规划」一步步推进。

## 目标

- 删除写死的 `app/views/plaza/data.ts`。
- Discover 的数据放在本仓库 GitHub 上的 `api/discover/` 目录里,app 定时拉取。
- 代码里所有 `plaza` / `Plaza` / 「广场」统一改名为 `discover` / `Discover`。
- 所有网络请求和缓存都放在 Rust 的 `ear discover` 子命令里。TS 只负责 spawn、解析 JSON、筛选和展示。

## 整体流程

```
DiscoverView (TS)
  └─ spawn("ear", ["discover"])
       ├─ 缓存未过期 ──> 直接读 ~/.cache/ear/discover/
       └─ 已过期或 --refresh ──> GET raw.githubusercontent.com/yuler/ear/main/api/discover/*
  <─ stdout 一行 JSON:{ type: "result", schemaVersion: 1, items }
  └─ 在内存里按语言、等级、时长、标签、关键词筛选
```

## 数据源:`api/discover/`

放在本仓库(`yuler/ear`)根目录,通过 GitHub raw 地址读取,不需要服务器。

```
api/discover/
  index.json      # 入口:版本号、更新时间、数据文件列表
  en.json         # 英语条目
  ja.json         # 日语条目
```

`index.json`:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-11-11",
  "files": ["en.json", "ja.json"]
}
```

`en.json`(每个语言文件一个 `items` 数组):

```json
{
  "items": [
    {
      "videoId": "zmBWacJ6CQk",
      "title": "Slow English Conversations (A1+ comprehensible input)",
      "author": "Miss Honey",
      "durationMs": 2361000,
      "language": "en",
      "level": "A1",
      "tags": ["#Shadowing", "#SlowAudio"],
      "description": "可选,一两句话说明为什么推荐。"
    }
  ]
}
```

- 按语言拆文件,是为了让社区 PR 少冲突。以后条目多了,可以再按等级拆;`index.json` 里的 `files` 列表会跟着改,客户端代码不用动。
- 维护方式:直接编辑 JSON 后提交。社区推荐走 PR,或者提 issue 由维护者合并。
- 默认地址 `https://raw.githubusercontent.com/yuler/ear/main/api/discover/`,可以用环境变量 `EAR_DISCOVER_URL` 覆盖,本地调试时可以指向 `file://` 或本地服务。

## 数据结构 `DiscoverItem`

由现有 `PlazaItem` 精简而来。

| 字段           | 类型                  | 来源                                  |
| -------------- | --------------------- | ------------------------------------- |
| `videoId`      | `string`              | JSON,必填                             |
| `title`        | `string`              | JSON,必填                             |
| `author`       | `string \| null`      | JSON                                  |
| `durationMs`   | `number`              | JSON,必填                             |
| `language`     | `"en" \| "ja"`        | JSON,必填                             |
| `level`        | `DiscoverLevel`       | JSON,必填,A1–C1 或 N5–N1              |
| `tags`         | `string[]`            | JSON,可为空                           |
| `description`  | `string \| null`      | JSON                                  |
| `durationTier` | `5 \| 10 \| 20 \| 30` | `ear` 根据 `durationMs` 计算          |
| `thumbnailUrl` | `string`              | `ear` 用 `videoId` 拼 `hqdefault.jpg` |

相对 `PlazaItem` 删掉的字段:

| 字段                        | 处理                                      |
| --------------------------- | ----------------------------------------- |
| `id`                        | 用 `videoId`                              |
| `url`                       | 由 `videoId` 拼出                         |
| `levelLabel`、`formatLabel` | TS 根据 `level`、`language` 生成          |
| `format`                    | 由 `language` 推出(en → en-en,ja → ja-ja) |
| `quality`、`hasSubtitles`   | 打开视频时以 `ear parse` 的结果为准       |

`durationTier` 划分:7 分钟以内为 5,15 分钟以内为 10,25 分钟以内为 20,其余为 30。

## `ear discover` 命令

| 命令                     | 作用                                 |
| ------------------------ | ------------------------------------ |
| `ear discover`           | 输出全部条目。缓存未过期时直接读缓存 |
| `ear discover --refresh` | 跳过缓存,强制从 GitHub 拉取          |

输出沿用 `ear parse` 的风格:stdout 每行一个 JSON。

```json
{ "type": "result", "schemaVersion": 1, "updatedAt": "2026-11-11", "fromCache": false, "items": [] }
```

- 失败时输出 `{ "type": "error", "message": "..." }`,以 1 退出。
- 单个条目缺少必填字段或取值不合法时跳过,并输出一行 `{ "type": "warning", "message": "..." }`,不让整次拉取失败。
- `schemaVersion` 大于 `ear` 支持的版本时报错,提示用户升级 `ear`。

## 定时拉取与缓存

- 缓存目录:`$XDG_CACHE_HOME/ear/discover/`,未设置时用 `~/.cache/ear/discover/`。缓存内容是合并、校验后的结果 JSON。
- TTL 24 小时。数据是人工维护的,一天更新一次足够,也避免频繁请求 GitHub。
- 「定时」不做常驻定时器,在这两个时机触发:
  1. 打开 Discover 页面时调用 `ear discover`,过期了就自动拉取。
  2. 用户点「刷新」时调用 `ear discover --refresh`。
- 拉取失败但有旧缓存时,返回旧缓存,`fromCache: true`,界面不报错。
- 拉取失败又没有缓存时报错,界面显示错误和「重试」按钮。

## 搜索

搜索在 TS 里对已拉取的条目做本地筛选,不发网络请求。匹配 `title`、`author`、`tags`、`description`,不区分大小写。现有的 `PlazaFilterState.searchQuery` 和筛选逻辑可以直接沿用。

## 改名:plaza → discover

我扫过代码,`app/` 下有 10 个文件引用了 plaza 或「广场」。

| 现在                                         | 改为                                                |
| -------------------------------------------- | --------------------------------------------------- |
| `app/views/plaza/`                           | `app/views/discover/`                               |
| `PlazaView.tsx`、`PlazaCard.tsx`             | `DiscoverView.tsx`、`DiscoverCard.tsx`              |
| `PlazaFilters.tsx`、`plaza.test.tsx`         | `DiscoverFilters.tsx`、`discover.test.tsx`          |
| `PlazaItem`、`PlazaLevel`、`PlazaLanguage`   | `DiscoverItem`、`DiscoverLevel`、`DiscoverLanguage` |
| `PlazaFilterState`                           | `DiscoverFilterState`                               |
| tab id `"plaza"`                             | `"discover"`                                        |
| `plazaCount`                                 | `discoverCount`                                     |
| `handle{Practice,Inspect,Download}PlazaItem` | `handle{Practice,Inspect,Download}DiscoverItem`     |
| 标题「Discover · 听力精听广场」              | 「Discover · 精听推荐」                             |

「广场」这个概念整体去掉,中英文都不再使用。除了上表的标识符,下面这些也一起改:

- 注释:`types.ts` 的 "plaza recommendations"、`Sidebar.tsx` 的 "Plaza recommendations moved to sidebar"、`App.tsx` 的 "Media list / Plaza"。
- 测试:`App.test.tsx` 里等待和断言的标题文案;`plaza.test.tsx` 里的测试名 "Plaza filtering logic ..."。
- 常量:`PLAZA_RECOMMENDATIONS` 在第 5 步随 `data.ts` 一起删除。第 1 步先改名为 `DISCOVER_ITEMS`,保证第 1 步只改名、不改行为。
- 生成文件:`app/.nsh/test/plaza.test.tsx.run.js` 由 `nsh test` 生成,改名后删掉旧文件即可。

涉及文件:`App.tsx`、`App.test.tsx`、`ui/Sidebar.tsx`、`ui/TopBar.tsx` 和 `views/plaza/` 下的全部文件。tab id 没有写进 `store.ts` 的持久化设置,改名不需要迁移用户数据。

## 现有种子数据的问题

`data.ts` 里的 40 条数据大多不是真实视频,不能直接搬到 `api/discover/`:

- `dQw4w9WgXcQ` 是 Rick Astley 的《Never Gonna Give You Up》,不是英语课。
- `SlowEng001`、`ja-n5-01`、`v=a1-30m-demo` 之类不是合法的 YouTube ID。

所以第一版 `api/discover/` 要重新挑真实视频,每个语言先放几条,用 `ear parse` 核对标题和时长。

## 执行规划

每一步结束时运行 `mise run check` 和 `mise run test`,全部通过后再进入下一步。

| 步骤 | 内容                                                                                             | 验证方式                                            |
| ---- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1    | 改名 plaza → discover,删除「广场」,只改名,不改行为                                               | 测试全部通过;`grep -rni "plaza\|广场" app` 没有结果 |
| 2    | 新建 `api/discover/`(`index.json`、`en.json`、`ja.json`),放入少量真实视频                        | 每个 `videoId` 都能用 `ear parse` 解析成功          |
| 3    | Rust:新增 `ear discover`,包括拉取、校验、合并、缓存、`--refresh`                                 | `cargo test`;手动运行 `ear discover` 检查输出       |
| 4    | Rust 测试:用 `include_str!` 读取仓库里的 `api/discover/*.json` 并校验                            | 社区 PR 写错 JSON 时 CI 会失败                      |
| 5    | TS:新增 `views/discover/source.ts` 调用 `ear discover`;删除 `data.ts`;接入加载、错误、重试、刷新 | `discover.test.tsx` 改用 mock spawn 和 JSON fixture |
| 6    | 加社区推荐说明:README 一节,外加一个 issue 模板                                                   | 人工检查                                            |

第 3 步 Rust 的文件改动:

| 文件                       | 改动                                           |
| -------------------------- | ---------------------------------------------- |
| `src/main.rs`              | 注册 `discover` 子命令                         |
| `src/commands/discover.rs` | 新增:参数解析、读缓存或拉取、输出              |
| `src/discover.rs`          | 新增:`DiscoverItem`、校验、`durationTier` 计算 |
| `src/cache.rs`             | 新增:读写缓存文件、判断 TTL                    |

HTTP 请求复用 `youtube.rs` 里现有的 `http_get_text`(基于 curl),不引入新依赖。

## 不在本次范围内

- 用 Innertube `youtubei/v1/search` 实时搜索 YouTube,以及基于关键词的随机刷新。我已经用 curl 验证过这个接口可用(WEB client,参数 `EgIoAQ%3D%3D` 只返回带字幕的视频,一页 20 条,支持翻页)。以后可以做成 `ear discover --query`。
- 删除 TS 的 `parseYouTubeVideo` 兜底。
- 把 `cli/` 拆成 lib 和 bin。
- 在 app 里直接提交推荐。

## 已确认的决定(2026-11-11)

1. 数据放在本仓库的 `api/discover/` 目录,不单独开仓库。
2. 按语言拆成 `en.json`、`ja.json`,由 `index.json` 列出文件。
3. 这一版的搜索只在已拉取的条目里本地筛选,不搜 YouTube。
4. 缓存 TTL 24 小时,打开页面时过期自动拉取,用户可以用 `--refresh` 强制刷新。
5. 页面标题改为「Discover · 精听推荐」。「广场」这个概念整体去掉,中英文都不再使用。
