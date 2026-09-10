# AGENTS.md

本文件适用于 `Ringo-Deng/Journal-app / 拾光手帐` 全仓库的 Agent、自动化脚本及协作开发。

**决策顺序：用户数据安全 → 现有功能稳定 → 向后兼容 → 交互一致 → 可维护性 → 性能 → 代码整洁。选择改动更小、状态更少、容易验证和回滚的方案。**

## 1. 适用范围与执行原则

- 用户当前明确要求优先于本文件的一般规则；子目录 `AGENTS.md` 可补充具体约束，不得削弱数据安全要求。
- 本文件已纳入 [PROJECT_RELEASE_RULES.md](PROJECT_RELEASE_RULES.md) 的强制要求：**任何实际仓库修改都升版本、页面只保留一个左下角版本标签、自动推送 GitHub**。文档、测试和配置调整也适用，不以改动小为由豁免。
- 仅讨论、分析或审查且没有修改文件时，不产生版本与提交。用户明确要求只做方案、不改代码、不推送或只保留本地修改时，按其限定执行。
- 已授权且路径明确的低风险工作，完成预检后继续实施，不把预检变成例行审批。只有缺少必要信息，或方案显著增加数据丢失、稳定性风险、需要超出需求的大范围重构时，才暂停相关步骤说明原因。
- 保护用户和其他 Agent 的已有修改，不得擅自覆盖、回退、删除或混入本次提交。发现与任务无关的问题只报告，不顺手修复。

## 2. 开工流程与强制预检

### 2.1 先确认当前实现

1. 读取本文件及目标目录规则，核对工作区、当前分支、远程地址与未提交修改。
2. 获取 GitHub 目标分支最新状态；默认以 `main` 为基线，用户指定其他分支或 PR 时遵从。先确认已有改动归属，再安全同步，禁止用旧压缩包、备份或强制重置代替最新源码。
3. 读取 `package.json` 的版本、脚本、依赖及运行环境要求；沿下方架构地图找到入口、状态 owner、操作入口，再追到相关保存或 AI 链路。
4. 确认对应测试及实际验证环境。只调查本次涉及的链路，不因小改动触发全仓重构或无关架构整理。

### 2.2 实施前向用户说明

每项开发需求、UI 调整、重构或修复都必须基于当前代码做预检，不能凭需求描述或旧聊天印象直接承诺。文档任务核查现行规则和引用事实。

| 预检项 | 必须回答 |
| --- | --- |
| 可行性 | 当前架构、状态、数据模型、依赖及运行环境是否支持？ |
| 影响范围 | 会改哪些组件、状态 owner、数据流、缓存、持久化或渲染链路？ |
| 回归风险 | 最可能破坏什么：选择同步、坐标、交互、旧数据、缓存、保存恢复或性能？ |
| 最小方案 | 原方案是否必要，是否有更小、更稳定的实现？ |
| 验证能力 | 用哪些测试、实际交互或数据回读验证？关键结果有哪些环境限制？ |

用简短说明给出结论、主要风险和推荐方案；极小改动可用一两句话。关键结果无法实测时必须提前说明。不要在查看实现前说“没问题”，不要把推测或代码检查说成已验证效果。若不建议原方案，应说明依据和替代方案；高风险原方案须经用户知情明确要求后再实施。

## 3. 当前架构与常用命令

### 3.1 定位入口

以下是定位线索，修改前仍须读当前代码。路径或职责变化时，在同次提交中更新对应行；只记录已确认事实，不写猜测或重复保留“首次导入源码”任务。

| 模块 | 权威入口与职责 |
| --- | --- |
| 应用入口 | `app/layout.tsx`：全局布局、样式与版本显示；`app/page.tsx`：`Home` 编辑器根组件 |
| 书本与页面 | `app/page.tsx` 的 `books` / `bookId` / `page`：书本、跨页和当前页面状态，`page === -1` 为扉页 |
| 画布与选择 | `app/page.tsx`：`canvas`、`pointerDown/pointerMove` 控制渲染与操作；`selected` / `multiIds` 是画布选择 owner，`activePieces` 派生实际选择；外观复用 `components/piece-appearance.tsx` |
| 页面素材侧栏 | `app/page.tsx` 的 `panel === 'elements'`、`pageElementRows`：图层面板复用画布选择；`components/layer-row-actions.tsx` 提供行操作按钮 |
| 素材模型与插入 | `lib/journal.ts`：素材库条目 `Asset`、页面素材 `Piece`，页面内容存于 `Spread.elements`；`app/page.tsx` 的 `insertLibraryAssets` 经 `change/changeSpread` 写入 |
| 素材库 | `components/material-library.tsx`：库内筛选及待插入素材，通过 `onInsert` 进入编辑器；库内待插入选择与画布选择用途不同 |
| 素材处理台 | `components/material-studio.tsx`：处理和候选预览；`local/server.mjs`：素材 API 与选定结果保存 |
| 素材识别 | `local/server-bootstrap.mjs` 先安装 `local/material-segment-router.mjs` 的自动候选路由，再载入 `local/server.mjs`；路由通过 `execFile` 的自定义 promisify 接入 `local/segment` 调用 |
| AI 创作 | `app/page.tsx` 的 `generate` → `/api/generate` → `local/server.mjs`；短文由 `local/paper-group.mjs` 提供实图选材与彩色底纸，`local/paper-group-layout.mjs` 负责组合叠贴和空位检查；其他内容由 `local/ai-response.mjs` / `local/design-plan.mjs` 解析校验，`local/layout-composition.mjs` / `local/collage-layout.mjs` 排版；`lib/journal.ts` 的 `appendDay/regenerateSpread` 转换数据，重设计经 `designPreview/applyDesignPreview` 预览应用 |
| 照片蒙版与回收站 | `app/page.tsx` 的 `photoMaskDraft` 仅供编辑画布预览；`lib/photo-mask.mjs` 共用轮廓与取景几何；`local/photo-mask.mjs` 经原保存队列生成透明图、登记回收引用及检查安全删除；`components/photo-trash.tsx` 提供恢复与手动清理 |
| 本地服务 | `local/server-bootstrap.mjs`：初始化原生工具和请求适配后载入 `local/server.mjs`；开发、正式启动均使用 bootstrap 入口 |
| 保存 | `app/page.tsx` 的 `books` → `pending/flush` → `/api/state` → `local/server.mjs` 的校验、写入队列、revision 冲突检查及 JSON 原子写入；`JOURNAL_DATA_DIR` 指定数据目录 |
| 数据兼容 | `lib/journal.ts` 的默认值与 `ensureFlyleaf`、`local/server.mjs` 的 `validateState`：兼容及校验入口；当前没有统一手帐 schema migration，`revision` 是写入并发号 |
| 专项迁移 | `local/material-catalog.mjs` 的 `createMaterialCatalog`：素材目录迁移；`local/ai-config.mjs` 的 `migrateLegacyConfig`：旧 AI 配置兼容 |
| 备份与撤销 | `local/server.mjs` 保留 `journal.previous.json`，经同一保存队列调用 `local/journal-history.mjs` 留存每日首份及删除前快照，保留最近 30 份健康快照；`components/journal-history.tsx` 提供预览，恢复副本交回 `app/page.tsx` 原保存流；`app/page.tsx` 管理会话撤销与导入导出，`lib/journal-backup.ts` 复制本子并收集、重映射图片引用 |
| 3D 阅读 | `components/reading-deck.tsx` → `components/reading-book3d.tsx` → `components/book3d/Book3DView.tsx`；`lib/book3d-motion.ts` 控制翻页几何；`app/three-test/page.tsx` 为独立测试入口 |
| 阅读图片缓存 | `lib/reading-jpg.ts`：内页/封面渲染版本；`components/book3d/reading-textures.tsx`：纹理生成及预加载；修改渲染时核查对应缓存版本 |
| 应用版本 | `package.json.version` 为权威来源，`package-lock.json` 同步；`app/layout.tsx`、`local/server-bootstrap.mjs` 与 `local/stamp-dist.mjs` 读取该值 |

### 3.2 修改前要追清的相关数据流

- **选择**：画布 / 侧栏 / 快捷键 → `selected` / `multiIds` → 共用选中状态与渲染。
- **素材**：添加或处理结果 → `Asset` / `Piece` → 跨页元素与画布 → 保存。
- **页面**：切换本子或跨页 → `bookId` / `page` → 清理旧页面的临时状态。
- **保存**：编辑 → 内存 `books` → `/api/state` → 原子写入 → 刷新或重启后读取。
- **AI**：用户指令 → API → 解析与校验 → 数据转换、预览或应用 → 原有书本状态与保存流。

只需追清本次涉及的链路；不得绕开已有 owner 另建平行状态或保存链路。

### 3.3 命令与环境

在仓库根目录执行，Node.js 版本遵从 `package.json.engines`。脚本变化时同步本表。

| 用途 | 命令及范围 |
| --- | --- |
| 安装依赖 | `npm ci`：按锁文件安装，仅在依赖缺失或需要重装时执行 |
| 开发 | `npm run dev`：`local/dev.mjs` 启动本地 API 与 vinext；默认 API `4329`、网页 `4330` |
| 构建 | `npm run build`：vinext 构建后由 `local/stamp-dist.mjs` 写入构建版本标记 |
| 正式服务 | `npm start` / `npm run service`：均使用 `local/server-bootstrap.mjs` |
| 类型检查 | `npx tsc --noEmit` |
| 静态检查 | `npm run lint`：仅检查 `package.json` 脚本列明的目录和组件，不代表所有模板已检查 |
| 全部单测 | `npm test`：运行 `tests/*.test.mjs` |
| 指定回归 | `node --experimental-strip-types --test tests/<对应文件>.test.mjs`：按改动选择现有测试 |

端口可通过 `JOURNAL_API_PORT` / `JOURNAL_WEB_PORT`（开发）及 `JOURNAL_PORT`（服务）调整。测试副本使用隔离的 `JOURNAL_DATA_DIR`；涉及配置还须隔离 `JOURNAL_CONFIG_DIR`，不要让测试服务写入用户正式数据或配置。

## 4. 修改范围与状态约束

- 优先修改现有组件、工具和数据结构；同一业务状态只保留一个明确 owner。派生值优先计算，不以多个互相同步的 `useEffect` 维护副本。
- 画布、侧栏和快捷键操作同一份选择状态；切换页面或文档时显式清理旧页临时状态。
- 新功能兼容现有交互与数据流；删除代码前检查调用者及依赖。
- 未经明确要求，不重做 UI、不重构整个编辑器、不替换技术栈或存储、不删除兼容代码、不批量重命名、不改变操作习惯，也不扩展成未要求的平台或高级功能。
- 不为未来假设引入新状态体系、重复 store/cache、复杂抽象或依赖。增加依赖前核对现有能力、收益、包体积、维护成本与构建兼容性；小功能优先原生 API 或现有依赖。

## 5. 数据安全与原生工具

- 禁止把清空 localStorage、IndexedDB 或本地文件作为普通修复手段；未经用户明确要求，不删除用户内容、历史数据或手动编辑结果。
- 保存结构变化必须兼容旧数据；必要迁移应可重复执行或有明确版本判断。字段缺失应提供合理默认值或局部容错，不能导致整个手帐无法打开。
- 不把应用版本、保存并发号和 schema 版本混为一谈；修改保存链路要回归冲突处理及保存恢复。
- 备份必须保留图片等素材引用。自动历史快照、单份 previous 和会话撤销用途不同；历史快照只引用本机原图，迁移或独立保全需使用包含原图的导出备份。Git 历史不能替代用户数据备份。
- 不提交密钥、Token、密码、真实 `.env`、私有设置、用户手帐数据、本地缓存、构建产物或临时文件。以 `.gitignore` 与 `git ls-files` 共同确认边界，不能仅凭路径名判断。
- `data/` 仅保留已受控说明文件；`node_modules/`、`.next/`、`.vinext/`、`dist/`、`build/` 等运行产物保持排除。
- **`local/segment`、`local/cutout`、`local/clean-paper`、`local/material-palette` 是已受 Git 管理的可执行文件。** `.gitignore` 中同名且带尾随 `/` 的规则匹配目录，不代表这些文件可以删除或忽略。
- 修改 `local/segment.swift` 后，必须重新编译、验证并同步受控的 `local/segment`；其他原生工具同样保持源码与交付程序一致。需在支持的 macOS/架构上验证真实素材输入及结果，不能仅提交源码或以语法检查代替原生行为验证。
- 任何可能造成数据丢失的变更，须在预检与最终交付中单独说明风险及保护措施。

## 6. UI、样式与命名

- 沿用现有字号、间距、圆角、阴影、按钮和 design token；高频编辑优先侧栏、工具栏或浮层，谨慎增加模态框。
- 保持画布操作和侧栏状态一致、行为可预期；不要因点击画布素材无理由关闭侧栏，也不要为新增面板吞掉原有指针事件。
- CSS 限制在所属组件范围，避免全局选择器、大量 `!important` 或 magic number；确需固定尺寸时说明含义。
- 改动坐标、尺寸、缩放或 transform，必须核对选中框、拖拽、缩放与素材位置；3D 改动必须核对视觉与真实几何、翻页与缩放/平移交互。

命名约束主要用于新增文件，遵循所在模块已有惯例，不为统一风格批量改名：

| 对象 | 规则 |
| --- | --- |
| 组件 / Hook | `PascalCase.tsx` / `useXxx.ts` |
| 普通模块 | `camelCase.ts` 或 `kebab-case.ts`；类型、工具、服务可用 `.types` / `.utils` / `.service` |
| 测试 / 样式 | 对应所属模块，测试使用 `.test` / `.spec`，沿用项目现有测试入口 |
| 目录 | 英文小写或 `kebab-case`，按功能归类 |
| 素材 | `类别-内容-变体.ext`，如 `sticker-coffee-cup-01.png`；来源与授权另存 metadata 或清单 |
| 安装脚本 | `setup-journal-vX.Y.Z-平台[-用途].ext`；同版本修复原正式脚本，历史版本移入明确归档目录 |

不使用 `new`、`final2`、`copy`、`最新版`、`1.png` 等无法表达用途的长期名称；不用复制整个源码目录管理版本。

## 7. 内部验证与 Review

**任何改动都要先内部验证，再 Review；Review 后有修改，重跑受影响检查。验证必须覆盖最终待提交状态，包括版本和配置。**

### 7.1 按变更类型选择必要检查

多类改动叠加对应检查；不是任选其中一项。检查通过后，仅在新修改、失败或未解决风险出现时扩大或重复验证。

| 改动 | 最低验证要求 |
| --- | --- |
| 纯文档 / 规则 | 核对引用路径、命令、链接、事实、前后约束及 diff；内部 Review；仍需版本同步检查，不因只改 Markdown 跳过 QA |
| 代码 / 测试 | 相关单元与回归测试、类型或语法检查、适用的 lint；涉及打包、入口或运行链路时执行 build/start 检查 |
| UI / CSS / 3D | 适用的代码检查与构建；环境允许时实际检查主要界面和交互；样式变更用新页面或强制刷新避免旧热更新缓存干扰 |
| 数据 / 保存 / migration | 新建、编辑保存、刷新、重新打开、切换页面；旧数据读取、缺失字段及迁移重复执行；用隔离测试数据 |
| AI / 素材处理 | 请求 → 解析校验 → 候选或转换结果 → 应用保存；覆盖失败、缺失或无效结果，确认不会覆盖已有手动内容 |
| 原生工具 / 启动脚本 / 依赖 | 相关测试与语法检查、重新编译或安装核验、支持环境下实际启动/执行；涉及生产构建时检查 build |
| 版本同步 | 包与锁文件版本一致；运行现有版本显示/依赖清单检查；生成交付构建时核对构建版本标记 |

纯文档验证不需要无关的应用全量测试；若同时修改了代码、配置或构建逻辑，按实际影响追加检查。

### 7.2 编辑器选择功能的必测路径

单选、多选、取消选择、画布 → 侧栏同步、侧栏 → 画布同步、删除选中项、移动多选项、锁定项行为，以及切换页面后的临时状态清理，九项均须覆盖。

### 7.3 结果与环境限制

- 内部 Review 要检查需求覆盖、边界情况、交互/视觉、数据兼容及不必要的复杂度，并回看预检列出的回归风险。
- 用户手动测试是最终验收，不是 Agent 的第一轮 QA；不交付未经自检的中间版本让用户反复试错。
- 代码阅读、测试、构建、HTTP 响应与真实 UI 操作证明的范围不同，不能互相冒充。
- 分别报告通过、失败、既有失败和未验证项；未验证须写具体原因和残留风险。遇到失败先判断与本次修改的关系，不把部分通过说成全部通过，也不绕过检查。
- 环境受限时完成可执行检查和后续交付步骤，明确保留验证缺口，不宣称受限部分已通过；若缺口使数据安全或核心行为无法判断，暂停相关高风险交付。

## 8. 版本、GitHub 与完成条件

### 8.1 版本唯一来源

- 每次实际仓库更新至少增加一次 patch；文档、文案、测试、配置、素材、小 UI 与修复均适用。明显新功能可升 minor，重大不兼容升级才考虑 major。
- `package.json.version` 是唯一权威来源，`package-lock.json` 顶层与根包版本必须同步；不得新增手写可见版本常量。
- 网页长期只在现有左侧功能栏底部显示一个 `v{package.json.version}` 标签，不新增第二个或浮动版本标签；现有显示由 `app/layout.tsx` 读取包版本。
- 安装、导出及构建版本从同一来源取得；`local/stamp-dist.mjs` 写入 `dist/client/.shiguang-version`。未重新构建的旧产物不能作为新版本交付。
- 应用版本与阅读图像缓存版本用途不同；渲染变化时另行检查 `lib/reading-jpg.ts` 中对应的内页或封面版本，不以清缓存数据代替兼容处理。

### 8.2 唯一交付流水线

**确认最新基线并预检 → 最小实现及版本同步 → 内部测试 → 内部 Review / 优化 → 有改动则重测 → Git commit → GitHub push → 远程确认 → 最终汇报。**

提交与推送要求：

1. 查看完整 diff 和暂存范围，确认没有私有数据、密钥、临时文件或他人无关修改；按明确文件暂存。
2. 每个提交只处理一个逻辑主题，使用 `feat:` / `fix:` / `docs:` / `chore:` 等简短明确的信息。
3. 默认同步到 `Ringo-Deng/Journal-app` 的 `main`，用户明确指定其他分支/PR 时遵从；无需再次询问是否提交或推送。
4. 推送前再次核对远端；远端已前进时，保护已有工作，安全同步、Review 冲突及版本号并重跑受影响检查。禁止强推或覆盖远端历史，不为通过提交绕过 hooks。
5. 推送后读取远端提交或文件，确认本次内容确已存在；仅本地 commit、仅生成 zip、推送返回不明或无法确认远端都不算完整交付。

### 8.3 最终汇报与 Definition of Done

只有需求实现、相关内部 QA 与 Review 已执行、版本处理正确、无无关或敏感文件入库，且 GitHub 同步已确认，才能报告交付完成；数据与核心交互必须保持兼容。未验证部分须保留明确限制，不能称为全部验证通过。

最终回复简洁说明：

- 改了什么及主要文件；
- 新版本号；
- 实际测试/检查结果，预检风险哪些已验证；
- 未验证项、具体原因、残留风险及数据兼容影响；
- GitHub 同步状态与 commit SHA，尽量附链接。

推送失败或远程无法确认时明确写 **“GitHub 推送未完成”**，说明原因，不回答“全部完成”。用户明确限制为仅分析或本地修改时，按其范围汇报并说明未执行的交付步骤。
