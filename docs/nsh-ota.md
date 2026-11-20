# NSH OTA 与全量更新

Ear 桌面客户端通过 `nsh/updater` 做自动更新。本文说明 OTA（`.nshpkg`）能改什么、不能改什么，以及发版时如何区分增量与全量。

官方参考：[OTA Updates](https://nsh.dev/docs/ota-updates.md)、[App Updates](https://nsh.dev/docs/app-updates.md)。

---

## 1. OTA 能改什么

`.nshpkg` 只更新已安装 app 里的 **TSX 包**（界面、逻辑、样式，以及 TSX `import` 的图片/字体）。客户端下载到用户数据目录，校验签名后下次启动（或 `restartToPackage()`）跑新包，带 10 秒试运行与自动回滚。

| 变更 | OTA | 需完整安装包 |
| :--- | :-: | :----------: |
| 界面、逻辑、样式、import 的图片/字体 | ✅ | |
| 更新 NSH runtime | | ✅ |
| Rust / 原生代码 | | ✅ |
| 平台元数据：name、**icon**、URL schemes、`ios`/`android`/`macos`、权限 | | ✅ |
| 超出已安装 app 的 capabilities | | ✅ |
| `updater` 配置（manifest 源、trusted roots） | | ✅ |

**结论：换 app icon 等壳层内容，OTA 做不到，必须发完整安装包。**

---

## 2. 客户端检查顺序

`app/updater.ts` 与官方建议一致：

1. `checkForPackage()` → 有则走增量（`isIncremental: true`）
2. 否则 `checkForUpdate()` → 全量安装包（`isIncremental: false`）

`UpdateModal` 会标「增量热更 / 全量更新」，按钮分别为「立即更新并重启」「安装并重启」或「下载安装包」。

同一次 release 的 `latest.json` 若**同时**带 `package` 与平台安装包，用户只会走 OTA，**不会**再装完整包。换 icon 时若仍发布 OTA，客户端永远换不了图标。

---

## 3. 发版策略

`release.yml` always builds the three platform archives. It now selects OTA or full delivery before generating the signed manifest; see [Release delivery modes](./release-modes.md).

| 类型 | 何时用 | Manifest | 用户看到 |
| :--- | :----- | :------- | :------- |
| **增量**（默认） | 只改 TSX/UI | 带 `--package`（安装包可仍上传作备份） | 增量热更 → 重启 |
| **全量** | icon、name、capabilities、Rust、升 runtime | **不要**把 `.nshpkg` 写进 manifest | 全量更新 → 安装并重启 / 下载安装包 |

Implemented full-update controls:

- Automatic detection compares all changes since the latest version tag: `app/icon.*`, `app/nsh.json`, `cli/**`, `mise.toml`, `scripts/linux-launcher.sh`, and `.github/workflows/release.yml` require full delivery.
- `workflow_dispatch` with `full_update: true` forces full delivery for other shell-affecting changes. `false` keeps automatic selection; it does not force OTA.
- Full delivery skips OTA publication, never passes `--package`, and verifies that the generated manifest has no `package` field before publication. UI-only releases retain signed OTA when signing material is available.
- Commit markers and PR labels are not implemented controls.

---

## 4. 全量时如何提示用户

走现有全量通道即可，不必另做「请去 GitHub 手动下」旁路：

- `canInstall: true` → 弹窗「全量更新」→「安装并重启」
- `canInstall: false` →「下载安装包」打开浏览器

建议全量弹窗加一句说明（例如「本次含应用图标/底座变更，需安装完整应用」），changelog 写明原因。

不要在「同版本已能 OTA」时再提示装完整包——用户已热更到同版本 TSX，只会困惑；壳层变更靠**该次 release 不提供 package**，让 check 落到全量。

---

## 5. 实操清单

1. 只改业务 UI：照常合入 `main`，自动 OTA。
2. 换 icon / 改 capabilities / 升 runtime：该次发版走**全量**（manifest 不含 package）。
3. 客户端文案区分增量与全量即可；无需在 check 里「检测是否改了 icon」。

相关实现：[`app/updater.ts`](../app/updater.ts)、[`app/ui/UpdateModal.tsx`](../app/ui/UpdateModal.tsx)、[`.github/workflows/release.yml`](../.github/workflows/release.yml)、[`docs/release-design.md`](./release-design.md)。
