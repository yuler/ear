# Incremental Update & Dynamic Switching Design

面向 Ear 桌面客户端（Linux 优先）的增量热更新与手动/自动切换架构设计。

---

## 1. 目标与背景

当前客户端更新逻辑依赖全量安装包下载（检查更新后调用系统浏览器打开 GitHub Releases 页面，需下载 ~35MB–50MB 的完整平台安装包重新解压覆盖）。

本设计建立面向生产环境的**增量更新（Incremental Update）机制**：
1. **直接对接生产环境**：客户端直连远程生产环境（GitHub Releases 或静态 CDN）托管的 `latest.json` 清单与增量文件。
2. **极速增量体验**：业务逻辑与 UI 变更仅下载 Native Shell QuickJS 字节码（`bundle.nshc`，约 160KB–200KB），带宽消耗与传输耗时降低 99% 以上。
3. **双模切换支持**：
   - **手动切换（Manual Mode）**：遵循经典桌面软件更新交互。用户主动点击检查更新、查看版本差异与 Changelog、点击确认更新并平滑重启。
   - **自动切换（Auto Mode）**：后台空闲时静默检测与增量下载，校验完整性后自动就绪，下次启动无缝切入新版本（亦可点右上角 Toast 立即重启）。
4. **Linux 原生兼容与高可靠性**：利用 POSIX 原子重命名与 Linux 开放句柄解耦特性，保证热更绝不锁死正在运行的进程，提供只读路径自适应与故障自动回滚。

---

## 2. 远程生产环境产物与架构分级

| 层级   | 产物名称         | 典型大小      | 适用变更场景           | 更新方式                |
| :----- | :--------------- | :------------ | :--------------------- | :---------------------- |
| **L1** | `bundle.nshc`    | ~180 KB       | UI、视图、TSX 业务逻辑 | **秒级增量热更 (OTA)**  |
| **L2** | `ear` (CLI)      | ~6 MB         | 核心流媒体协议与下载器 | 独立模块增量替换        |
| **L3** | `Ear.tar.gz`     | ~35 MB        | GTK 底座或 WebKit 引擎 | 引导下载全量平台安装包  |

### 2.1 生产环境清单规范 (`latest.json`)

远程生产环境根目录维护 `latest.json`：

```json
{
  "version": "0.1.2",
  "build": 12,
  "minRunnerVersion": "0.0.1",
  "releaseDate": "2026-11-11T12:00:00Z",
  "changelog": "✨ [player] 优化 3D 滚动字幕与增量更新体验",
  "bundleUrl": "https://github.com/yuler/ear/releases/download/v0.1.2/bundle.nshc",
  "bundleSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bundleSize": 184320,
  "platforms": {
    "linux-x86_64": {
      "fileName": "Ear-0.1.2-linux-x64.tar.gz",
      "url": "https://github.com/yuler/ear/releases/download/v0.1.2/Ear-0.1.2-linux-x64.tar.gz",
      "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
      "size": 36700160
    }
  }
}
```

---

## 3. 手动与自动切换工作流

更新模式可通过「设置 - 关于与更新」自由切换：`updateMode: "manual" | "auto"`。

```
                    ┌─────────────────────────┐
                    │      检查远程更新       │
                    │   (fetch latest.json)   │
                    └────────────┬────────────┘
                                 │
                     [存在新版本 & 兼容底座?]
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       【手动模式 (Manual)】             【自动模式 (Auto)】
                 │                               │
                 ▼                               ▼
      界面显示发现新版本徽标            后台静默下载 bundle.nshc
                 │                               │
        用户点击「立即更新」             校验 SHA-256 完整性
                 │                               │
       显示进度条拉取增量包                      ▼
                 │                      原子写入暂存更新区
                 ▼                               │
        校验 SHA-256 完整性                      ▼
                 │                      右下角轻量提示/徽标
                 ▼                      「新版本已就绪, 重启生效」
        原子替换 bundle.nshc                     │
                 │                               ▼
                 ▼                      下次冷启动自动切入 /
        提示「重启应用生效」              用户点击「立即重启」
                 │
                 ▼
          无缝重启至新版本
```

### 3.1 手动切换流程（常规软件更新体验）
1. **触发与呈现**：用户在「关于」或侧边栏点击更新徽标，或应用启动后提示「发现新版本 vX.Y.Z (增量更新 ~180KB)」。
2. **下载确认**：展示更新日志（Changelog）与包大小，操作按钮为 `[ 立即增量更新 ]`。
3. **进度与校验**：界面展示百分比进度条。下载完成后实时计算 SHA-256 哈希比对。
4. **生效切换**：校验通过后，替换当前字节码，按钮变更为 `[ 重启应用生效 ]`。用户确认后重启。

### 3.2 自动切换流程（静默增量更新）
1. **后台周期轮询**：应用冷启动 5 秒后及每隔 12 小时自动静默比对 `latest.json`。
2. **静默预下载**：若检测到增量更新，直接在后台通过 `fetch` 拉取 `bundle.nshc` 写入本地数据暂存区 `${dataDir}/updates/staged/`。
3. **校验与就绪**：哈希校验一致后，标记 `pendingUpdate` 状态，侧边栏或设置页面出现就绪提示。
4. **无感切换**：用户关闭并重新打开应用时，启动器自动以新字节码启动；亦可在提示卡片中点击 `[ 立即重启 ]` 随心生效。

---

## 4. Linux 平台可靠性与原子更新机制

在 Linux 环境下，软件更新主要面对文件锁定、权限不足与异常崩溃变砖问题。本方案采用如下针对性机制：

### 4.1 POSIX 原子重命名与无锁热更
- **Linux 文件句柄特性**：Linux 内核采用 inode 引用计数。当应用正在执行旧版 `bundle.nshc` 时，文件已被打开并映射至内存。此时对磁盘文件执行写入或替换**绝不会报错**，更不会导致运行中应用崩溃。
- **原子替换（Atomic Rename）**：
  1. 下载新文件至同一文件系统的临时文件：`${bundlePath}.download`。
  2. 验证哈希通过后，调用 `rename(download, bundlePath)`。
  3. POSIX 标准保证 `rename` 在同文件系统内是单一系统调用的**原子操作**（Atomic Operation）。即使断电或强制杀进程，也不会留下损坏的半成品文件。

### 4.2 路径与权限自适应方案 (Dual-Mode Location)

```
                检查安装目录是否可写 (isInstallDirWritable)
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       【用户级便携目录】               【系统级只读目录】
    (~/.local/share/Ear, ~/Apps)          (/opt/Ear, Flatpak)
                 │                               │
                 ▼                               ▼
      就地原子替换 (In-Place)          用户数据目录覆盖 (Overlay)
   Ear/nsh/bundle.nshc ──> 新包     ${dataDir}/updates/current/bundle.nshc
                 │                               │
                 ▼                               ▼
     备份至 bundle.nshc.bak            通过 NSH_APP_DIR 环境变量启动
```

1. **便携式安装（推荐，当前 tar.gz 默认）**：
   - 安装目录位于用户主目录下（如 `~/.local/share/` 或 `~/Apps/`），拥有完全写权限。
   - 直接在应用同级的 `nsh/` 目录下完成就地替换。
2. **系统级只读安装（如 `/opt/`）**：
   - Native Shell 原生支持通过环境变量 `NSH_APP_DIR` 指定加载路径。
   - 若检测到 `nsh/` 不可写，增量包写入用户专属的数据目录 `${dataDir}/updates/active/`，并更新桌面快捷方式启动参数或启动辅助器。

### 4.3 故障防御与自动回滚 (Rollback Guard)

1. **写前自动备份**：替换前将旧版保留为 `bundle.nshc.bak`。
2. **健康检测看门狗（Crash Watchdog）**：
   - 切换新版本后，在 `${dataDir}/updates/health.json` 中标记 `status: "canary"`。
   - 若新版本启动后 10 秒内未发生致命崩溃，健康检测通过，标记为 `status: "healthy"`。
   - 若在 10 秒内异常退出并在下次启动被捕获，自动还原 `bundle.nshc.bak`，并提示「检测到新版本启动异常，已自动回滚至上一稳定版」。

---

## 5. 代码层设计与接口契约

### 5.1 状态与设置扩展 (`app/store.ts`)

```ts
export type UpdateMode = "manual" | "auto";

export interface UpdateSettings {
  updateMode: UpdateMode;         // "manual" | "auto"
  lastCheckTime?: number;         // 上次检查时间戳
  autoDownload: boolean;          // 是否自动下载增量包 (默认 true)
}
```

### 5.2 核心更新器接口 (`app/updater.ts`)

```ts
/** 增量更新下载进度 */
export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  percentage: number;
}

/** 执行增量更新下载与校验 */
export async function downloadIncrementalBundle(
  bundleUrl: string,
  expectedSha256: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<Uint8Array>;

/** 原子应用增量更新包到本地 */
export async function applyIncrementalUpdate(
  bundleBytes: Uint8Array,
  expectedSha256: string,
  newVersion: string,
): Promise<{ success: boolean; requiresRestart: boolean; error?: string }>;

/** 回滚至上一稳定版本 */
export async function rollbackIncrementalUpdate(): Promise<boolean>;

/** 触发客户端重启以载入新版本 */
export async function restartApplication(): Promise<void>;
```

### 5.3 启动辅助与能力补齐 (`app/nsh.json`)

在 `app/nsh.json` 中开放进程退出与自重启调用：
```json
{
  "capabilities": {
    "process": {
      "exit": true,
      "execute": [
        "ear",
        "Ear",
        "cp",
        "mv"
      ]
    }
  }
}
```
