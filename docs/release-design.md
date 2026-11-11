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
| **版本控制**     | 根目录 `VERSION` 统领主次版本基准（如 `0.0.1`）；日常 CI 基于最新 Release Tag 自动自增 Patch（如 `v0.0.2`），动态注入产物，不回写主干。 |
| **大版本演进**   | 跨 Milestone 或破坏性更新时，通过 `scripts/version.sh bump [minor\|major]` 更新 `VERSION` 合入 main，CI 自动基于新基准递增。        |
| **质量门禁**     | 前置强制通过 `nsh check`、`cargo test`、`nsh test` 及编译预检；任意一步失败即刻阻断流程，绝不打 Tag。                             |
| **并发调度**     | 设置 `cancel-in-progress: false` 串行排队；保证每次合入 main 的 Commit / PR 都有专属独立的版本号与 Release。                     |
| **产物形态**     | 输出 Linux x64、macOS arm64、Windows x64 完整安装包，并同步输出 Native Shell 增量字节码（`bundle.nshc`，~200KB）。               |
| **更新与元数据** | 生成结构化 Release Notes（包含 Commit/PR 标题、详细说明、作者与对比 Diff），同步写入 `latest.json` 的 `changelog` 字段供客户端热更展示。 |

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
         ├─ 3. Desktop Matrix Build (Linux x64, macOS arm64, Windows x64)
         ├─ 4. Bytecode Bundle Build (bundle.nshc OTA)
         ├─ 5. Manifest & Checksums Generation (latest.json)
         └─ 6. GitHub Release Publication (softprops/action-gh-release)
```

---

## 4. 客户端热更新与版本解析

- 桌面客户端启动时静默请求 `https://github.com/yuler/ear/releases/latest/download/latest.json`。
- 如果当前版本低于远程版本且客户端 Native Runner 兼容，客户端优先拉取 `bundle.nshc` 秒级热更。
- 遇重大底座或 Rust CLI 变更时，提示用户下载完整平台安装包。
