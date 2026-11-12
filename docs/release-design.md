# Continuous Delivery & Automated Release Design

参考 [yetone/magpie](https://github.com/yetone/magpie) 的持续交付模型，为 Ear 建立面向 AI 驱动高频迭代的「合入即发布」发布管道。

---

## 1. 目标与背景

1. **零人工发版负担**：代码合并入主分支（`main`）即自动打包发布，无需开发者或 AI Agent 手动维护 Git Tag 或执行复杂的发版审批流程。
2. **极速闭环反馈**：支持 AI 驱动的敏捷修复流程（问题提出 → AI 编码与测试 → PR 验证合入 → CI 自动化三端构建与 Release → 客户端静默热更新）。
3. **安全严谨的质量门禁**：通过严格前置的类型检查与单元测试，杜绝半成品与缺陷构建外溢。

---

## 2. 核心设计决策

| 维度             | 规则与机制                                                                                                                        |
| :--------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| **触发范围**     | 仅限 `main` 主干分支的直接 push 或 PR 合并事件。特性分支与待合入 PR 仅运行 CI 校验，不打 Tag、不发布 Release。                       |
| **路径过滤**     | 排除纯文档提交（`docs/**`、`*.md`、`.gitignore`）。涉及业务源码（`app/**`、`cli/**`、配置文件等）时触发全流程。                     |
| **版本控制**     | 纯 Git Tag 驱动（无静态 VERSION 文件）：日常 CI 读取最新 Release Tag 自动递增 Patch，动态注入产物，不回写主干。                  |
| **大版本演进**   | 跨 Milestone 或破坏性更新时，通过 GitHub Actions `workflow_dispatch`（输入目标 Tag 如 `v0.1.0`）或本地打 Tag，CI 自动顺延。       |
| **质量门禁**     | 前置强制通过 `nsh check`、`cargo test`、`nsh test` 及编译预检；任意一步失败即刻阻断流程，绝不打 Tag。                             |
| **并发调度**     | 设置 `cancel-in-progress: false` 串行排队；保证每次合入 main 的 Commit / PR 都有专属独立的版本号与 Release。                     |
| **产物形态**     | 输出 Linux x86_64、macOS aarch64、Windows x86_64 完整安装包，并同步输出签名 OTA 包（`.nshpkg`，~200KB）。          |
| **更新与元数据** | 生成官方签名清单 `latest.json` 与 `latest.json.sig`，由 `nsh/updater` 原生校验并展示更新日志。                    |

---

## 3. 工作流架构

```
[PR / Feature Branch]
         │
         ▼
  .github/workflows/ci.yml (Typecheck + Tests)
         │ (Merge to main)
         ▼
[Push to main (Non-doc changes)]
         │
         ▼
  .github/workflows/release.yml
         ├─ 1. Quality Gate (check & test)
         ├─ 2. Version & Tag Resolution (Fetch latest tag -> Auto patch + 1 -> Create git tag)
         ├─ 3. Desktop Matrix Build (Linux x86_64, macOS aarch64, Windows x86_64)
         ├─ 4. Signed OTA Package Build (nsh publish -> .nshpkg)
         ├─ 5. Signed Manifest Generation (nsh update-manifest -> latest.json + latest.json.sig)
         └─ 6. GitHub Release Publication (softprops/action-gh-release)
```

---

## 4. 客户端热更新与版本解析

- 桌面客户端使用 NSH 原生模块 `nsh/updater`，启动时静默检查更新（通过 `nsh.json` 的 `updater` 声明）。
- **增量 OTA 更新**：优先检查 `checkForPackage()`。若存在受信任根密钥认证的新版签名包（`.nshpkg`），客户端通过 `downloadPackage()` 极速下载至用户数据目录（不触碰系统目录与 macOS 代码签名），并调用 `restartToPackage()` 毫秒级重启进入新版本，自带 10 秒试运行和自动回滚保护机制。
- **全量平台升级**：当 Native Runner 底座发生变更时，回退到 `checkForUpdate()`，提示用户通过 `downloadUpdate()` / `installAndRestart()` 安装完整平台包。
