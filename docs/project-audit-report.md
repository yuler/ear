# Ear 项目深度审计报告（Bug · 安全 · 设计）

> 审计范围：`cli/` (Rust)、`app/` (Native Shell TSX)、`www/` (Cloudflare Worker & 官网)、`.github/workflows/` 与 `scripts/`。  
> 基线测试状态：`cargo test --manifest-path cli/Cargo.toml`（19/19 通过）、`nsh check app`（打包通过，存在 2 条告警）、`nsh test app`（125/125 通过）。

---

## 一、总览与优先级摘要

| 类别     | 严重程度 | 问题摘要                                                                 | 主要影响位置                                                          |
| :------- | :------- | :----------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| Bug      | P0       | 下载协议字段不匹配：`cli` 输出 `type: "done"`，前端期待 `type: "result"` | [mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L505-L511), [earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts#L284-L286) |
| Bug      | P0       | 暂停或失败的下载仍触发 100% 完成动画与提示音                             | [download.ts](file:///home/yule/Projects/ear/app/library/download.ts#L295-L324), [App.tsx](file:///home/yule/Projects/ear/app/App.tsx#L380-L450) |
| Bug      | P1       | 发布产物命名不一致导致 Worker 回退链接与 manifest 脚本 404               | [release.yml](file:///home/yule/Projects/ear/.github/workflows/release.yml#L174-L192), [worker.js](file:///home/yule/Projects/ear/www/worker.js#L69-L71), [generate_manifest.sh](file:///home/yule/Projects/ear/scripts/generate_manifest.sh#L102-L115) |
| Bug      | P1       | Windows 平台 `openExternalUrl` / `openSystemPath` 调用未授权命令         | [updater.ts](file:///home/yule/Projects/ear/app/updater.ts#L332-L339), [paths.ts](file:///home/yule/Projects/ear/app/library/paths.ts#L90-L98), [nsh.json](file:///home/yule/Projects/ear/app/nsh.json#L48-L62) |
| Bug      | P1       | `ffmpeg` 混流失败后未更新库条目状态，导致条目永久卡在 `downloading`      | [mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L455-L460) |
| Bug      | P1       | Rust 字幕分句计算存在无符号整数下溢 panic 风险                           | [library_sync.rs](file:///home/yule/Projects/ear/cli/src/commands/download/library_sync.rs#L330) |
| Bug      | P2       | `AbortSignal` 已提前中止时无法拦截，且失败会遍历重试所有候选二进制       | [earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts#L94-L152), [earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts#L247-L256) |
| Bug      | P2       | `loadLessonFromParsed` 未复用日语优先字幕选择逻辑                        | [parse.ts](file:///home/yule/Projects/ear/app/youtube/parse.ts#L237-L242) |
| Bug      | P2       | 路径含单引号 `'` 时 Linux `gdbus` ShowItems 调用失败                     | [open.rs](file:///home/yule/Projects/ear/cli/src/commands/open.rs#L119-L120), [paths.ts](file:///home/yule/Projects/ear/app/library/paths.ts#L160-L175) |
| 安全     | P1       | `nsh.json` 网络权限放开为通配符 `["*"]`，且白名单包含高危通用进程        | [nsh.json](file:///home/yule/Projects/ear/app/nsh.json#L20-L63) |
| 安全     | P1       | Windows `cmd /c start "" <url>` 存在命令注入风险                         | [updater.ts](file:///home/yule/Projects/ear/app/updater.ts#L334) |
| 安全     | P1       | CLI `--video-id` 未经字符集校验即拼接文件路径，存在路径遍历隐患          | [mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L80-L82), [library_sync.rs](file:///home/yule/Projects/ear/cli/src/commands/download/library_sync.rs#L93-L95) |
| 安全     | P2       | `captions` 命令未限制 `curl` URL 协议（可触发 `file://` 或内网请求）     | [captions.rs](file:///home/yule/Projects/ear/cli/src/commands/captions.rs#L134-L181), [youtube.rs](file:///home/yule/Projects/ear/cli/src/youtube.rs#L106-L128) |
| 设计     | P1       | Rust CLI 与 TS 前端双写同一套 `library/` 元数据，存在竞态与目录分歧      | [library_sync.rs](file:///home/yule/Projects/ear/cli/src/commands/download/library_sync.rs#L28-L61), [download.ts](file:///home/yule/Projects/ear/app/library/download.ts#L174-L212) |
| 设计     | P2       | `PartCheckpoint::completed_chunks` 未去重，且多线程同时刷新过期 URL      | [checkpoint.rs](file:///home/yule/Projects/ear/cli/src/commands/download/checkpoint.rs#L110-L143), [transfer.rs](file:///home/yule/Projects/ear/cli/src/commands/download/transfer.rs#L228-L236) |
| 设计     | P2       | 目标文件已存在即直接跳过下载，无法覆盖损坏文件或切换清晰度               | [download.ts](file:///home/yule/Projects/ear/app/library/download.ts#L247-L262) |

---

## 二、Bug 详细分析

### 1. [P0] 下载完成事件类型不匹配（`done` vs `result`）
- **位置**：[cli/src/commands/download/mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L505-L511)、[app/youtube/earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts#L284-L286)
- **现象**：Rust CLI 在下载与 `ffmpeg` 混流完成后输出 `"type": "done"`，同时携带真实的 `path` 与 `sizeBytes`；但前端 `earDownload()` 仅监听 `msg.type === "result"`。
- **后果**：前端永远接收不到 CLI 返回的最终 `path` 和 `sizeBytes`，`doneSize` 恒为 `0`，只能依赖调用方预先猜测的路径和估算大小。

### 2. [P0] 暂停或失败的下载仍触发「100% 完成」动画与提示音
- **位置**：[app/library/download.ts](file:///home/yule/Projects/ear/app/library/download.ts#L295-L324)、[app/App.tsx](file:///home/yule/Projects/ear/app/App.tsx#L380-L450)
- **现象**：当 `earDownload()` 抛出异常（包括用户点击暂停触发 `AbortController.abort()` 或网络失败）时，`downloadLesson()` 在内部 `catch` 后**吞掉异常并正常返回** `{ entry, audioNote }`（`entry.state` 为 `"paused"` 或 `"error"`）。而调用方 `App.tsx` 的 `downloadTargetLesson()` 未检查 `entry.state` 或 `audioNote`，直接继续执行后续成功分支：将任务状态设为 `percent: 100, stage: "done"`、播放 `playDingSound()` 完成音效、延迟 380ms 后从活动列表移除并自动切换 Tab。
- **并发叠加**：`handlePauseDownload()`（[App.tsx](file:///home/yule/Projects/ear/app/App.tsx#L465-L482)）在调用 `ctrl.abort()` 的同时，又独立执行 `readEntry(vid)` + `upsertEntry({ state: "paused" })`，与 `downloadLesson` 的 `catch` 块及 Rust `sync_entry_paused` 形成三方并发写竞争。

### 3. [P1] 发布产物命名不一致导致下载回退链路 404
- **位置**：[.github/workflows/release.yml](file:///home/yule/Projects/ear/.github/workflows/release.yml#L174-L192)、[www/worker.js](file:///home/yule/Projects/ear/www/worker.js#L69-L105)、[scripts/generate_manifest.sh](file:///home/yule/Projects/ear/scripts/generate_manifest.sh#L102-L115)
- **现象**：
  - `release.yml` 实际打包出的文件名使用完整架构名：`Ear-${VERSION}-linux-x86_64.tar.gz`、`Ear-${VERSION}-macos-aarch64.zip`、`Ear-${VERSION}-windows-x86_64.zip`。
  - `www/worker.js` 的回退路径以及 `scripts/generate_manifest.sh` 使用的是简写架构名：`Ear-${version}-linux-x64.tar.gz`、`Ear-${version}-macos-arm64.zip`、`Ear-${version}-windows-x64.zip`。
- **后果**：Cloudflare Worker 共享出口 IP 在触发 GitHub API 未认证限流（60 req/h）或网络异常时，会回退到 `v0.0.1` + `arm64/x64` 命名，导致官网下载链接直接 404；若手动运行 `scripts/generate_manifest.sh`，也会因找不到文件而生成空的 `sha256` 和 `null` 的 `size`。

### 4. [P1] Windows 平台 `openExternalUrl` / `openSystemPath` 调用未授权进程
- **位置**：[app/updater.ts](file:///home/yule/Projects/ear/app/updater.ts#L332-L339)、[app/library/paths.ts](file:///home/yule/Projects/ear/app/library/paths.ts#L90-L156)、[app/nsh.json](file:///home/yule/Projects/ear/app/nsh.json#L48-L62)
- **现象**：`app/nsh.json` 的 `capabilities.process.execute` 白名单中并未包含 `cmd` 和 `explorer`。但在 Windows 上：
  - `openExternalUrl()` 直接调用 `process.run("cmd", ["/c", "start", "", url])`。
  - `openSystemPath()` / `revealInFileManager()` 在 `ear` 失败后回退调用 `process.run("explorer", ...)`。
- **后果**：在启用 `nsh` 能力沙箱的正式打包环境中，Windows 上调用这些函数会因权限拒绝而直接失败。

### 5. [P1] `ffmpeg` 混流失败或 `yt-dlp` 回退导致状态异常
- **位置**：[cli/src/commands/download/mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L160-L195), [L450-L460](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L450-L460), [L515-L536](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L515-L536)
- **现象**：
  1. `ffmpeg` 混流失败返回 `Err` 时，前面已经将库条目写为 `state: "downloading"`，但失败分支没有调用 `sync_entry_error()` 更新状态，导致库条目永远停留在 `downloading`。
  2. `download` 命令仅请求 `fetch_visionos_player`，未像 `parse` 命令那样在失败时回退到 `watch_player`，直接跳到 `yt-dlp`；而 `fallback_yt_dlp` 成功后传入 `captions_path = None`，完全跳过了字幕下载。

### 6. [P1] Rust 字幕合并存在无符号整数下溢 Panic 风险
- **位置**：[cli/src/commands/download/library_sync.rs](file:///home/yule/Projects/ear/cli/src/commands/download/library_sync.rs#L330)
- **现象**：`let too_long = (sent_end - sent_start) >= 6000;` 直接使用无符号减法。若 YouTube `json3` 字幕中出现时间戳乱序或重叠（即后一条字幕 `end_ms` 小于首条 `start_ms`），debug 构建会直接 `panic` 崩溃，release 构建则会回绕为极大整数导致错误截断。应改为 `sent_end.saturating_sub(sent_start) >= 6000`。

### 7. [P2] 其它功能性 Bug
- **失败遍历所有候选二进制**：[app/youtube/earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts#L94-L152) 中 `earParse`、`earCaptions`、`earDownload` 用 `for (const bin of bins)` 包裹整个执行逻辑。当第一个找到的 `ear` 因网络错误、无效链接或用户主动取消而失败时，代码会继续尝试列表中的其余 7 个候选路径，导致同一错误请求被重复发送多次。
- **`AbortSignal` 边界遗漏与监听泄漏**：[app/youtube/earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts#L247-L256) 未检查 `params.signal.aborted` 初始状态，且 `abort` 监听器在子进程退出后未移除。
- **`loadLessonFromParsed` 忽略日语视频**：[app/youtube/parse.ts](file:///home/yule/Projects/ear/app/youtube/parse.ts#L242) 未传入 `trackId` 时调用的是 `preferEnglishTrack` 而非 `preferBestCaptionTrack(updatedVideo.captionTracks, updatedVideo.title)`，导致 Discover 中的日语视频在不指定轨道时无法优先选中日文字幕。
- **路径含单引号导致 Linux `gdbus` 失败**：[cli/src/commands/open.rs](file:///home/yule/Projects/ear/cli/src/commands/open.rs#L119-L120) 与 [app/library/paths.ts](file:///home/yule/Projects/ear/app/library/paths.ts#L160-L175) 构造 GVariant 参数 `['${fileUri}']` 时未转义单引号（`encodeURI` 不会编码 `'`），路径包含 `'` 时 `gdbus` 解析报错。
- **编译器/框架告警**：`nsh check app` 报告 `app/ui/ActiveDownloadRow.tsx:302` 使用了未知类名 `hover:bg-hover`，且部分代码访问了未在 `nsh.json` 声明的 `statusBar` 能力。

---

## 三、安全问题分析

### 1. [P1] `nsh.json` 权限配置过于宽泛
- **位置**：[app/nsh.json](file:///home/yule/Projects/ear/app/nsh.json#L20-L63)
- **问题**：
  - `capabilities.network.hosts` 设置为 `["*"]`，允许应用渲染层向任意域名/内网 IP 发起网络请求，违反最小权限原则。建议收敛为实际需要的域名（如 `*.youtube.com`、`*.googlevideo.com`、`*.ytimg.com`、`api.github.com`、`github.com`、`objects.githubusercontent.com`、`raw.githubusercontent.com` 等）。
  - `capabilities.process.execute` 包含 `"curl"`、`"cp"` 等通用系统工具，若前端存在逻辑缺陷或依赖链被污染，攻击面较大。既然网络与下载已由 Rust `ear` 承担，建议移除前端不必要的通用命令。

### 2. [P1] Windows 外部链接打开存在命令注入风险
- **位置**：[app/updater.ts](file:///home/yule/Projects/ear/app/updater.ts#L332-L339)
- **问题**：`process.run("cmd", ["/c", "start", "", url])` 将 `url` 交给 `cmd.exe` 解析。`cmd.exe` 会解释 `&`、`|`、`^`、`"` 等元字符；一旦 `url` 来源被污染（例如恶意构建的 manifest 或回调 URL），即可导致任意命令执行。应改为校验 `https://` 协议后交由 `ear open` 或直接调用 `explorer.exe`（不经过 `cmd /c`）。

### 3. [P1] CLI `--video-id` 缺乏合法性校验导致路径遍历隐患
- **位置**：[cli/src/commands/download/mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs#L80-L82)、[cli/src/commands/download/library_sync.rs](file:///home/yule/Projects/ear/cli/src/commands/download/library_sync.rs#L93-L95)
- **问题**：`download` 命令接收 `--video-id <val>` 或无法匹配 YouTube URL 的位置参数时，直接将其原样存入 `video_id`，随后 `LibraryEntrySync::entry_file(library_dir, video_id)` 拼接 `library_dir.join(format!("{video_id}.json"))`，`fetch_and_save_captions` 拼接 `library_dir.join(video_id)`。若传入 `../../foo`，将读写 `library_dir` 之外的路径。应在入口处强制校验 `is_valid_id(&video_id)`（11 位 `[A-Za-z0-9_-]`）。

### 4. [P2] `captions` 与 `curl` 调用未限制 URL 协议（SSRF / 本地文件读取）
- **位置**：[cli/src/commands/captions.rs](file:///home/yule/Projects/ear/cli/src/commands/captions.rs#L134-L181)、[cli/src/youtube.rs](file:///home/yule/Projects/ear/cli/src/youtube.rs#L106-L128)
- **问题**：`ear captions` 当检测到输入包含 `"timedtext"` 时，直接将用户输入作为 URL 传给 `curl -L`；配合 `--format raw` 会直接将响应原文打印到 stdout。由于 `curl` 默认支持 `file://`、`http://` 等多种协议，且未传 `--proto '=https'`，存在读取本地文件或探测内网服务的风险。此外 `fetch_visionos_player` 将从网页提取的 `visitor_data` 直接拼入 `-H "X-Goog-Visitor-Id: ..."`，建议过滤 `\r` / `\n` 防止 HTTP 头注入。

---

## 四、架构与设计问题

### 1. [P1] Rust CLI 与 TS 前端双写 `library/` 元数据（状态不同步与竞态）
- **现状**：
  - 前端 `app/library/download.ts` 在调用 `ear download` 前写入 `library/<id>.json`（`pending`）和 `<id>/captions.json`，结束后再次写入 `ready` 并重写 `archive.jsonl`。
  - 后端 `cli/src/commands/download/library_sync.rs` 在下载过程中每 150ms 读写一次 `library/<id>.json`，结束时也写 `<id>/captions.json` 并追加 `archive.jsonl`。
  - 两者路径解析还不完全一致：前端使用 `nsh` 的 `process.dataDir`，而 CLI 自行按 `EAR_LIBRARY_DIR` / `XDG_DATA_HOME` 推导（且前端调用 `earDownload` 时并未传递 `EAR_LIBRARY_DIR` 环境变量）。
- **建议**：明确单一数据源（Single Source of Truth）。推荐由 Rust CLI 仅负责媒体流与字幕文件的纯下载及 stdout 进度事件流（JSONL），将 `library/<id>.json` 与 `archive.jsonl` 的状态机管理统一收口到 TS 前端（或反之，由 CLI 统一管理并通过环境变量接收 `dataDir`），消除双写竞态。

### 2. [P2] 分片断点续传与并发刷新设计缺陷
- **位置**：[cli/src/commands/download/checkpoint.rs](file:///home/yule/Projects/ear/cli/src/commands/download/checkpoint.rs#L110-L143)、[cli/src/commands/download/transfer.rs](file:///home/yule/Projects/ear/cli/src/commands/download/transfer.rs#L228-L236)
- **问题**：
  - `PartCheckpoint.completed_chunks` 使用 `Vec<usize>` 存储，但 `downloaded_bytes()` 和 `is_complete()` 均未对其去重；若同一分片索引被重复记录，会导致进度百分比和完成判定失真。
  - 当 YouTube 流 URL 过期返回 403 时，最多 16 个工作线程会各自独立调用 `refresh_fn()`，同时向 YouTube 发起多次 `watch` + `youtubei/v1/player` 请求（惊群效应），容易触发风控。应使用 `Mutex` + 时间戳/版本号做单飞（single-flight）刷新。
  - 每个分片每次请求都通过 `Command::new("curl")` 派生外部进程，进程创建与 TLS 握手开销较高；长期可考虑引入轻量 Rust HTTP 客户端（如 `ureq` / `reqwest`）复用连接池。

### 3. [P2] 本地文件已存在即直接跳过下载
- **位置**：[app/library/download.ts](file:///home/yule/Projects/ear/app/library/download.ts#L247-L262)
- **问题**：只要 `~/Downloads/<videoId>.mp4` 存在，无论文件大小是否为 0、是否已损坏、或者用户本次切换了更高清晰度（如从 `360p` 切换到 `1080p`），`downloadLesson` 都会直接跳过下载并标记为 `ready`。应至少校验文件非空及清晰度是否匹配，或支持显式覆盖。

### 4. [P2] 密钥目录管理规范性
- **现状**：`keys/` 目录下存在 `release.secret`、`root.secret`、`update.secret`（已通过 `.gitignore` 忽略，未被 git 追踪）。
- **建议**：虽然当前未被提交到仓库，但将私钥长期留在开发工作区根目录存在误操作（如打包脚本误包含或 `git add -f`）风险，建议移至 `~/.config/ear/keys/` 等项目外路径。

---

## 五、按 PR 维度拆分的修复任务

为符合仓库 PR-first 与 Worktree 开发规范，将上述问题拆分为 4 个独立、可评审的 PR 任务：

### PR 1：`🐛 [app] Fix download completion protocol and pause/error state handling`（PR #15，已合并）
- **优先级**：P0（直接影响下载完成、暂停、失败反馈与字幕选择）
- **涉及文件**：
  - [app/youtube/earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts)：`earDownload` 同时兼容 `"done"` 与 `"result"`；检查 `signal.aborted` 初始状态并在退出时移除监听；仅在二进制无法启动时回退下一个候选路径，业务错误不再重复请求。
  - [app/library/download.ts](file:///home/yule/Projects/ear/app/library/download.ts)：本地已存在文件时校验非空且清晰度一致，避免损坏文件或切换清晰度时误跳过下载。
  - [app/App.tsx](file:///home/yule/Projects/ear/app/App.tsx)：`downloadTargetLesson` 根据 `entry.state`（`paused` / `error`）分流处理，禁止在暂停或失败时触发 100% 完成动画与提示音；消除 `handlePauseDownload` 并发写竞争。
  - [app/youtube/parse.ts](file:///home/yule/Projects/ear/app/youtube/parse.ts)：`loadLessonFromParsed` 未指定 `trackId` 时改用 `preferBestCaptionTrack`。
- **验收标准**：`nsh check app` 与 `nsh test app` 全通过，新增针对 `"done"` 事件、暂停/错误状态分流及日语字幕回退的单测。

### PR 2：`🔒 [app] Harden nsh capabilities and fix Windows/Linux external opener`（PR #16，已合并）
- **优先级**：P1（安全权限收口与跨平台兼容性）
- **涉及文件**：
  - [app/nsh.json](file:///home/yule/Projects/ear/app/nsh.json)：将 `capabilities.network.hosts` 从 `["*"]` 收紧为实际业务域名列表；从 `capabilities.process.execute` 移除 `curl`、`cp` 等高危通用工具。
  - [app/updater.ts](file:///home/yule/Projects/ear/app/updater.ts)：`openExternalUrl` 校验 `http(s)://` 协议，Windows 平台改用 `ear open` / `explorer` 替代 `cmd /c start`，消除命令注入与未授权进程调用。
  - [app/library/paths.ts](file:///home/yule/Projects/ear/app/library/paths.ts)：修复 Linux `gdbus` 参数中单引号 `'` 未编码的问题。
  - [app/ui/ActiveDownloadRow.tsx](file:///home/yule/Projects/ear/app/ui/ActiveDownloadRow.tsx)：修复 `hover:bg-hover` 未知样式告警。
- **验收标准**：`nsh check app` 无样式告警，`nsh test app` 全通过，补充 `openExternalUrl` 协议校验单测。

### PR 3：`🛡️ [cli] Harden input validation, mux error recovery, and chunk checkpointing`（PR #17，已合并）
- **优先级**：P1 / P2（CLI 安全性、稳定性与断点续传健壮性）
- **涉及文件**：
  - [cli/src/commands/download/mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs)：校验 `video_id` 格式防止路径遍历；`visionos` 失败时回退 `watch_player`；`ffmpeg` 混流失败时调用 `sync_entry_error`；`yt-dlp` 回退路径补充字幕抓取。
  - [cli/src/commands/download/library_sync.rs](file:///home/yule/Projects/ear/cli/src/commands/download/library_sync.rs)：使用 `sent_end.saturating_sub(sent_start)` 防止整数下溢 panic；修正 `fmt=json3` URL 拼接。
  - [cli/src/commands/download/checkpoint.rs](file:///home/yule/Projects/ear/cli/src/commands/download/checkpoint.rs) & [transfer.rs](file:///home/yule/Projects/ear/cli/src/commands/download/transfer.rs)：`completed_chunks` 去重；URL 过期刷新增加 single-flight 协调锁。
  - [cli/src/commands/captions.rs](file:///home/yule/Projects/ear/cli/src/commands/captions.rs)、[cli/src/youtube.rs](file:///home/yule/Projects/ear/cli/src/youtube.rs)、[cli/src/commands/open.rs](file:///home/yule/Projects/ear/cli/src/commands/open.rs)：限制 `curl` 仅允许 `https://`、过滤 `visitor_data` 换行符、转义 `gdbus` 单引号。
- **验收标准**：`cargo test --manifest-path cli/Cargo.toml` 全通过，新增路径遍历拦截、字幕乱序时间戳与分片去重单测。

### PR 4：`🔧 [release] Align artifact filenames across release workflow, worker, and manifest script`（PR #18，已合并）
- **优先级**：P1（发布链路与官网下载一致性）
- **涉及文件**：
  - [.github/workflows/release.yml](file:///home/yule/Projects/ear/.github/workflows/release.yml)、[www/worker.js](file:///home/yule/Projects/ear/www/worker.js)、[scripts/generate_manifest.sh](file:///home/yule/Projects/ear/scripts/generate_manifest.sh)：统一三端的平台安装包命名（`linux-x86_64` / `macos-aarch64` / `windows-x86_64`）。
- **验收标准**：`node --check www/worker.js` 通过，Worker 回退链接与 `release.yml`、`generate_manifest.sh` 产物名完全一致。

### PR 5：`✨ [core] Unify library metadata ownership, add statusBar capability, and harden player fallback`
- **优先级**：P1（消除双写竞态、消除框架能力告警、完善播放器/字幕回退）
- **涉及文件**：
  - [app/nsh.json](file:///home/yule/Projects/ear/app/nsh.json)：补充 `"statusBar": true` 声明，彻底消除 `nsh check app` 框架能力告警。
  - [app/youtube/earClient.ts](file:///home/yule/Projects/ear/app/youtube/earClient.ts)：`earDownload` 默认传递 `--no-library-sync` 与 `--no-captions`，将 `library/` 元数据管理职责完全收口至 TS 前端单一数据源。
  - [cli/src/commands/download/mod.rs](file:///home/yule/Projects/ear/cli/src/commands/download/mod.rs)：支持 `--no-library-sync` 参数；在 `visionos` 缺少 `streamingData` 时回退至 `watch_player`；在提取字幕/yt-dlp 回退时优先保留含字幕轨道的 player。
  - [cli/src/commands/download/library_sync.rs](file:///home/yule/Projects/ear/cli/src/commands/download/library_sync.rs)：`fetch_and_save_captions` 检测到本地已存在非空 `captions.json` 时直接复用，避免重复请求网络与覆盖。
- **验收标准**：`cargo test`（25/25 通过）、`nsh check app`（0 告警）、`nsh test app`（162/162 通过）。
