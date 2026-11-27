# Ear iOS 原生（SwiftUI）架构与实施计划

状态：已对齐决策，准备分 PR 落地。旧版 Native Shell iOS 已归档至 `ios-legacy/`（`mise run ios:legacy:{dev,check,test}`），桌面端 `desktop/` 继续保持 Native Shell 跨端方案。

## 1. 迁移背景与收益

旧版 `ios-legacy/`（约 10,690 行代码）暴露了两个核心痛点：
1. **UI 与交互落后**：无法直接享受 Xcode 新 SDK 的系统级原生材质与控件（如 iOS 26+ Liquid Glass 导航栏、原生 Sheet、原生左滑手势与触感反馈）。
2. **大量框架适配胶水代码**：
   - `ios-legacy/ext/ear-scanner/` 用约 1,284 行 Rust 手写 Objective-C runtime FFI，仅用于实现相机扫码与文件拼接。
   - 受限于 NSH `fs/promises.writeFile` 的 8 MiB 单次写入上限，被迫将媒体切成 4 MiB `.part` 分片后再调用 Rust 拼回完整文件。

切到纯原生 **Swift + SwiftUI**（复用 `yuler/dustlight` 工程体系）后，核心业务代码预计缩减约 **60%**（约 **3,400 行 Swift 业务代码 + ~1,200 行单元测试**），并原生获得系统级外观、流式写盘与后台音频能力。

## 2. 已锁定的设计决策

| 维度           | 决策结论                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Legacy 归档    | `ios/` 重命名为 `ios-legacy/`；`mise` 任务改为 `ios:legacy:{dev,check,test}` 并从默认 CI/发布解耦 |
| 首版产品边界   | 1:1 聚焦「局域网镜像伴侣 + 离线精听」，补齐锁屏/控制中心后台播放与耳机线控；手机端不做 YouTube 下载 |
| 系统与视觉语言 | `iOS 17.0+` 部署目标 + `Xcode 27` 编译；原生 SwiftUI 系统控件优先（iOS 26/27 自动呈现 Liquid Glass） |
| 设备与方向     | iPhone 竖屏为主（`TARGETED_DEVICE_FAMILY: "1"`），视频播放器支持点击全屏按钮横屏观看          |
| 锁屏与耳机控制 | `MPNowPlayingInfoCenter` + `MPRemoteCommandCenter`，「上一曲 / 下一曲」映射为「上一句 / 下一句」 |
| 后台同步策略   | 前台 `URLSession` 流式 `Range` 追加 + `beginBackgroundTask` 切后台宽限 + 后台播放音频时自然保活  |
| 数据与凭证存储 | Clean Slate（不迁移 NSH 旧沙盒）；Bearer Token 存系统 Keychain，状态与媒体存 `Application Support/EarMirror/` |
| 发布与标识     | 沿用 Bundle ID `dev.yuler.ear`（App Store Connect App ID `6839099514`）与 Flightdeck Webhook   |

> 注：Bonjour (`_ear._tcp`) 局域网自动发现与灵动岛 Live Activity 留作 v1.1 独立迭代（需桌面端 `cli` 同步增加 mDNS 广播）。

## 3. 工程脚手架与工具链（对标 Dustlight）

目录结构与构建方式直接对齐 `yuler/dustlight`：

```text
ios/
├── project.yml                  # XcodeGen 工程声明（唯一真相，xcodeproj 不手改）
├── Signing.xcconfig.example     # 本地开发签名模板（Signing.xcconfig 保持 gitignored）
├── Ear/
│   ├── EarApp.swift             # 入口、URL Scheme (ear://pair)、全局生命周期
│   ├── Info.plist               # 相机/本地网络权限、NSAllowsLocalNetworking、后台音频 UIBackgroundModes
│   ├── PrivacyInfo.xcprivacy
│   ├── Assets.xcassets/
│   ├── Resources/
│   │   └── Localizable.xcstrings # zh-Hans / en 多语言
│   ├── Models/
│   │   ├── MirrorModels.swift   # PairedMac, RemoteCatalogItem, LocalItemRecord, MirrorSettings
│   │   ├── CaptionModels.swift  # CaptionCue, Sentence, SentenceLengthMode
│   │   └── CaptionSegmentation.swift # 纯函数分句与播放进度推进算法
│   ├── Services/
│   │   ├── KeychainTokenStore.swift  # Security.framework 持久化 Bearer Token
│   │   ├── MirrorAPIClient.swift     # /v1/pair, /v1/library, /v1/videos/:id/{media,captions}, /v1/unpair
│   │   ├── MirrorFileStore.swift     # FileHandle 流式 206 Range 追加 + CryptoKit SHA-256 校验 + 原子重命名
│   │   ├── MirrorEngine.swift        # Swift actor：3 并发调度、多电脑去重、优先插队、4 秒撤销删除
│   │   ├── AudioSessionController.swift # AVAudioSession(.playback) + MPNowPlayingInfoCenter + 线控上下句
│   │   └── LanguageManager.swift
│   └── Views/
│       ├── LibraryView.swift         # 状态横幅、视频列表、原生 swipeActions + 撤销提示、空态配对入口
│       ├── PairSheetView.swift       # 扫码 / 权限引导 / 手动输入 IP+端口+4 位码
│       ├── QRScannerView.swift       # VisionKit DataScannerViewController / AVCaptureSession 封装
│       ├── SettingsSheetView.swift   # 外观、强调色、语言、后台同步开关、已配对电脑列表
│       ├── VideoDetailView.swift     # AVPlayer 16:9 舞台、全屏横屏、硬字幕遮挡条、音频封面
│       ├── PlayerControlsView.swift  # 进度条、盲听遮罩、单句暂停、倍速、短/中/长分句切换
│       ├── SubtitleStudioView.swift  # 跟随滚动字幕列表、点击单句播放、单句显隐、长按复制
│       └── VideoInfoSheetView.swift  # 媒体元信息与原始字幕查看弹窗
└── EarTests/
    ├── CaptionSegmentationTests.swift
    ├── MirrorAPIClientTests.swift
    ├── MirrorEngineTests.swift
    └── MirrorFileStoreTests.swift
```

### 3.1 `mise` 与脚本复用
待原生脚手架落地后，在 `mise.toml` 启用以下任务（复用 Dustlight 同款脚本）：
- `ios:gen`：`./scripts/ios-xcodegen.sh`（按 `scripts/resolve-version.sh` 注入 `APP_VERSION` / `APP_BUILD`）
- `ios:open`：生成并用 Xcode 打开 `ios/Ear.xcodeproj`
- `ios:test`：`./scripts/ios-test.sh`（自动挑选可用 iPhone 模拟器运行 `xcodebuild test`）
- `ios:testflight:check`：`./scripts/setup-testflight.sh check`

## 4. 关键技术实现要点

### 4.1 协议兼容（零改动桌面端）
原生客户端完全复用现有桌面端 LAN Mirror HTTP 协议（见 `ios-legacy/mirror/client.ts`）：
- `POST /v1/pair`：提交 `{ code, deviceName, deviceId }`，校验响应并保存 Token 至 Keychain。
- `GET /v1/library`：携带 `Authorization: Bearer <token>` 轮询各已配对电脑目录，按 `videoId` 去重合并来源标签。
- `GET /v1/videos/:id/media`：发送 `Range: bytes=<offset>-<end>` 与 `If-Match: "sha256:<digest>"`，严格校验 `206 Partial Content`、`Content-Range` 与 `ETag`，流式写入 `media.<ext>.part`；完成后用 `CryptoKit.SHA256` 流式校验并原子 `moveItem` 为 `media.<ext>`。
- `GET /v1/videos/:id/captions`、`POST /v1/device/status`、`POST /v1/unpair` 与旧协议一致。

### 4.2 精听播放与锁屏控制
- `AVPlayer` + `addPeriodicTimeObserver`（~80ms 精度）驱动字幕高亮与单句暂停（`clipEndMs`）。
- 激活 `AVAudioSession.Category.playback`（并在 `Info.plist` 开启 `UIBackgroundModes: audio`），切后台与锁屏不中断播放。
- `MPRemoteCommandCenter` 绑定 `playCommand` / `pauseCommand` / `previousTrackCommand`（上一句）/ `nextTrackCommand`（下一句），锁屏封面与当前句信息实时更新至 `MPNowPlayingInfoCenter`。

## 5. 分步 PR 实施路线

| 阶段 | PR 范围                            | 核心交付与验收标准                                                               |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------- |
| PR 0 | 归档旧版与设计文档（本 PR）        | `ios` -> `ios-legacy`，`mise` 改 `ios:legacy:*`，解耦旧 CI/发布，沉淀本设计文档  |
| PR 1 | 原生 XcodeGen 工程脚手架与 CI 接入 | `ios/project.yml`、空 SwiftUI 壳、`ios:gen`/`ios:test` 脚本、`ci.yml` 跑通模拟器测试 |
| PR 2 | 局域网镜像引擎与字幕核心层         | `MirrorAPIClient` / `MirrorFileStore` / `KeychainTokenStore` / `MirrorEngine` / `CaptionSegmentation` + 完整单测 |
| PR 3 | 媒体库、扫码配对与设置界面         | `LibraryView`、`QRScannerView`、`PairSheetView`、`SettingsSheetView`、`Localizable.xcstrings` |
| PR 4 | 精听播放器、锁屏控制与 TestFlight  | `VideoDetailView` + `AudioSessionController` + 重建原生 `ios-release.yml` 并完成真机联调（验收后删除 `ios-legacy/`） |
