# CoComment — 嘉立创EDA 团队评论批注扩展

> 版本：v0.4.1
> 适用：嘉立创EDA专业版 / EasyEDA Pro (EDA 引擎 ^3.0.0)
> 状态：本地评论 MVP + 手动协同（导出/导入工作流）已开发完成；实时多人协同等待嘉立创开放 API

在原理图和 PCB 画布上直接圈选区域、添加评论、追踪解决状态，类似 Figma 的评论协作能力。**每个工程有独立的评论区**，通过工程 UUID 自动隔离。团队协作通过 JSON 导出/导入工作流实现手动协同（A 导出 → 发给同事 → B 导入）。

---

## 一、功能列表

### 已实现

| 功能 | 说明 |
|---|---|
| 批注绘制 | 打开绘制 Dialog，手绘/粘贴截图/上传图片作为批注 |
| 评论线程管理 | 增删改查、未解决/已解决状态切换 |
| 评论 CRUD | 在线程下添加、删除评论（仅作者可删） |
| 视图自动跟随 | 缩放/平移画布时批注框自动跟随（sys_Timer 轮询） |
| 点击定位 | 在列表点线程卡片 → 画布定位到批注位置 + 闪烁高亮 |
| 按工程隔离 | 通过工程 UUID 自动隔离评论区，每个工程独立互不干扰 |
| 本地存储 | 评论数据存到 `eda.sys_Storage`，按工程 UUID 分区，刷新不丢 |
| JSON 导入导出 | 把当前工程所有评论导出为 JSON（文件名含工程名），或从 JSON 导入（跨工程导入时弹窗确认归属） |
| 用户设置 | 修改昵称 + 选择批注颜色（8 色可选） |
| 搜索过滤 | 按评论内容/作者名搜索，按状态（全部/未解决/已解决）过滤 |
| 显示/隐藏批注 | 一键切换画布上所有批注框的显隐 |
| 多行文字批注 | textarea 多行输入，6 档字号选择，Enter 换行 / Ctrl+Enter 提交 / Esc 取消 |

### 未实现

- ❌ 原理图批注（`SCH_Document` 坐标转换 API 未暴露）
- ❌ 实时多人协同（等待嘉立创开放协作者列表、在线状态、实时光标、跨用户消息广播等 API，详见 [DEV_DOC.md](./docs/DEV_DOC.md) 阶段 3）
- ❌ 评论附件（图片/文件上传，EDA 无附件上传 API）
- ❌ @ 提及

---

## 二、编译

### 环境要求

- Node.js >= 20.17.0
- npm

### 编译命令

在 `pro-api-sdk/` 目录下：

```powershell
# 方式 1：仅编译到 dist/（开发调试用）
npm run compile

# 方式 2：编译 + 打包成 .eext（发布用）
npm run build
```

### 编译产物

**`npm run compile` 产物**（位于 `pro-api-sdk/dist/`）：

```
dist/
├── index.js              # 扩展主入口（esbuild 打包为 IIFE）
└── iframe/
    ├── panel.html        # 评论面板
    ├── annotation.html   # 批注渲染层
    └── draw.html         # 绘制 Dialog
```

**`npm run build` 额外产物**（位于 `pro-api-sdk/build/dist/`）：

```
build/dist/
└── cocomment_v0.4.1.eext   # 嘉立创EDA扩展包（zip 格式，按 .edaignore 过滤）
```

`.eext` 是嘉立创EDA扩展的官方打包格式，本质是 zip 压缩包，内部按 [.edaignore](./.edaignore) 规则过滤掉 `node_modules`、`src`、`.npm-cache` 等开发文件，只保留运行时所需文件。

编译流程包含两步校验：
1. TypeScript 编译（esbuild）
2. HTML 内联 `<script>` 语法检查（`esbuild.transformSync`，防止 HTML 直接复制导致 JS 语法错误不被发现）

---

## 三、安装

### 方式 A：本地开发加载（推荐调试用）

1. 打开嘉立创EDA专业版
2. 顶部菜单 → **扩展** → **扩展管理**（或类似入口）
3. 选择 **加载本地扩展** / **开发模式加载**
4. 选择目录：`pro-api-sdk` 项目根目录（**不是 dist**，因为 [extension.json](./extension.json) 中 `entry: "./dist/index"` 已指向 dist）
5. 加载成功后，打开任意 PCB 工程，顶部菜单栏会出现 **CoComment** 菜单

### 方式 B：安装 .eext 包（发布用）

1. 执行 `npm run build` 生成 `build/dist/cocomment_v0.4.1.eext`
2. 在嘉立创EDA专业版的扩展管理页面选择 **从文件安装**
3. 选择 `cocomment_v0.4.1.eext` 文件

---

## 四、使用方法

### 4.1 菜单功能

在原理图或 PCB 编辑器中，顶部 **CoComment** 菜单提供 6 个操作：

| 菜单项 | 功能 |
|---|---|
| 显示评论面板 | 切换右侧评论列表面板的显隐 |
| 添加批注 | 打开绘制 Dialog，手绘/粘贴截图/上传图片作为批注 |
| 显示/隐藏批注 | 切换画布上所有批注框的显隐 |
| 导出评论 | 导出当前工程所有评论为 JSON（**手动协同**：发给同事） |
| 导入评论 | 从 JSON 文件导入评论（**手动协同**：接收同事的 JSON） |
| 关于 CoComment | 显示版本信息 |

> Home 页面只有"关于"一个菜单。

### 4.2 面板交互

右侧评论面板内：

- **+** 按钮：添加批注（同菜单）
- **⚙** 设置：修改昵称和批注颜色
- **👁** 显隐：切换批注框显隐
- **⬇ / ⬆**：导出 / 导入
- **搜索框**：实时搜索评论内容和作者名
- **状态过滤**：全部 / 未解决 / 已解决
- **点线程卡片**：画布定位到批注位置 + 闪烁高亮
- **展开线程**：发新评论、删除自己的评论、解决/重开线程

### 4.3 典型工作流（添加一条评论）

```
1. 点菜单 "添加批注"
2. 弹出"绘制批注" Dialog，可用画笔/矩形/箭头/文字手绘，或 Ctrl+V 粘贴截图，或上传本地图片
3. 点"确认"关闭 Dialog
4. 右侧面板自动出现新线程，输入框聚焦
5. 输入评论内容，回车提交
6. 画布上出现批注图像 + 序号徽章
```

### 4.4 团队协作工作流（手动协同）

```
A 同事：
1. 在自己的 EDA 客户端打开工程 X，添加/修改评论
2. 点菜单 "导出评论" → 生成 cocomment_<工程X>_<时间戳>.json 文件
3. 把 JSON 文件发给同事（微信/邮件/共享文件夹均可）

B 同事：
1. 收到 JSON 文件
2. 在自己的 EDA 客户端点菜单 "导入评论" → 选择 JSON 文件
3. 系统校验工程归属：
   - 如果 B 当前正好打开工程 X → 直接导入，面板刷新显示评论
   - 如果 B 打开的是工程 Y → 弹窗提示"该评论属于工程X，是否导入？"
     → 确认后评论挂到工程 X 分区下，B 需切换到工程 X 才能看到
```

⚠️ 注意：这是手动协同（非实时），需要 A 主动导出、B 主动导入。导入会覆盖目标工程的评论。实时多人协同（看到对方光标、评论即时推送）等待嘉立创开放 API。

> **为什么不用工程文档同步？** v0.2.0 曾尝试用 `eda.sys_FileManager.setDocumentSource` 把评论序列化进工程文档源码搭便车同步，但 PoC 验证 EDA 拒绝修改文档源码（返回 false）。EDA 也没有附件上传 API。因此团队协作只能走 JSON 文件交换。

---

## 五、项目结构

```
pro-api-sdk/
├── extension.json               # 扩展清单（菜单注册 + entry 指向 dist/index）
├── package.json                 # npm 脚本和依赖
├── tsconfig.json                # TypeScript 配置
├── .edaignore                   # .eext 打包过滤规则
│
├── src/                         # 扩展源码（TypeScript）
│   ├── index.ts                 # 入口：注册菜单、装配各模块
│   │
│   ├── core/                    # 业务核心层
│   │   ├── CommentEngine.ts     # 评论引擎（总控入口）
│   │   ├── ThreadManager.ts     # 评论线程管理
│   │   ├── CommentManager.ts    # 评论管理
│   │   ├── AnnotationRenderer.ts # 批注渲染器（视图轮询 + 坐标换算）
│   │   └── Navigator.ts         # 定位导航
│   │
│   ├── ui/                      # UI 控制层
│   │   ├── PanelController.ts   # 业务编排 + 消息路由 + 方案B同步入口
│   │   ├── IframeManager.ts     # sys_IFrame 窗口管理（panel/overlay/draw）
│   │   └── MessageBridge.ts     # sys_MessageBus 跨 context 通信桥
│   │
│   ├── iframe/                  # iframe 承载的 UI
│   │   ├── panel.html           # 评论面板（右侧列表）
│   │   ├── annotation.html      # 批注渲染层
│   │   └── draw.html            # 绘制 Dialog（手绘/粘贴/上传图片）
│   │
│   ├── sync/                    # 存储同步层
│   │   ├── SyncProvider.ts      # 同步接口（阶段切换时换实现）
│   │   └── LocalSync.ts         # 本地存储实现（基于 sys_Storage）
│   │
│   ├── types/                   # 类型定义
│   │   ├── comment.ts           # CommentThread / Comment / BBox
│   │   ├── user.ts              # User
│   │   ├── sync.ts              # SyncOp / ProjectData / LocalData
│   │   └── messages.ts          # 跨 iframe 消息协议
│   │
│   └── utils/                   # 工具函数
│       ├── coord.ts             # 坐标换算（逻辑坐标 ↔ 屏幕坐标）
│       ├── id.ts                # UUID 生成
│       ├── i18n.ts              # 多语言（zh-Hans）
│       └── ProjectContext.ts    # 工程上下文获取（工程 UUID / 名称 / 页面类型）
│
├── config/                      # 构建配置
│   ├── esbuild.common.ts        # esbuild 公共配置
│   ├── esbuild.dev.ts           # 开发模式（watch）
│   └── esbuild.prod.ts          # 生产编译（含 HTML 语法检查 + iframe 复制）
│
├── build/
│   └── packaged.ts              # .eext 打包脚本
│
├── dist/                        # 编译产物（compile 后生成）
│   ├── index.js
│   └── iframe/
│       ├── panel.html
│       ├── annotation.html
│       └── draw.html
│
└── build/dist/                  # 打包产物（build 后生成）
    └── cocomment_v0.4.1.eext
```

---

## 六、技术原理（简述）

扩展本质 = 被嘉立创EDA加载到主进程 JS 上下文里的一段代码：

1. **EDA 读取 extension.json** → 用户点菜单时反射调用 `dist/index.js` 中对应的导出函数
2. **`eda` 全局对象** = 扩展调用宿主能力的唯一通道（`sys_*` / `pcb_*` / `sch_*` 命名空间 API）
3. **批注渲染** = 通过 `eda.sys_IFrame.openIFrame` 打开 iframe 窗口（panel/annotation/draw），用 `eda.sys_MessageBus` 跨 context 通信
4. **视图同步** = `eda.sys_Timer.setIntervalTimer` 轮询视图状态，检测变化时刷新批注位置
5. **坐标换算** = `eda.pcb_Document.convertDataOriginToCanvasOrigin` / `convertCanvasOriginToDataOrigin`（逻辑坐标 ↔ 画布像素坐标）
6. **通信** = `eda.sys_MessageBus.publish/subscribe`（主进程 ↔ iframe 双向，按 topic 路由，构造时清理旧订阅防泄漏）
7. **存储** = `eda.sys_Storage.getExtensionUserConfig/setExtensionUserConfig`（按用户隔离，主进程可调）
8. **工程隔离** = `eda.sys_DocumentTree.getCurrentProjectInfo()` 获取工程 UUID 作为 projectId，每个工程独立评论区
9. **团队协作** = JSON 文件导入导出（`eda.sys_FileSystem.saveFile/openReadFileDialog`），手动协同工作流

详见 [docs/DEV_DOC.md](./docs/DEV_DOC.md)。

---

## 七、首次加载必做的验证

扩展**尚未在真实 EDA 环境跑过**，第一次加载后请打开开发者工具（F12）观察控制台：

**正常日志**：
```
[CoComment] activate() called, status= onStartupFinished
[CoComment] closed stale iframes on activate
[CoComment] ensureInitialized() done
```

**重点排查 3 个可能失败的点**：

1. **`eda.sys_IFrame.openIFrame` 行为**
   预期打开的是带标题栏的 Dialog 窗口（不是透明覆盖层）。如果弹出的窗口是空白，检查 [src/iframe/draw.html](./src/iframe/draw.html) 内的 onerror 错误提示框。

2. **消息是否重复触发**
   发送一条评论后看控制台日志次数。如果每条消息触发多次，可能是旧订阅未清理，检查 `globalThis.__cocomment_messagebus_tasks__` 是否被正确维护（见 [src/ui/MessageBridge.ts](./src/ui/MessageBridge.ts)）。

3. **iframe 路径**
   控制台看 panel.html / draw.html 是否 404。当前用 `./iframe/xxx.html`（相对 index.js 所在目录）。

如果遇到问题，把 F12 控制台的 `[CoComment]` 日志和报错贴出来排查。

---

## 八、开发

### 重新编译

修改 `src/` 下任何文件后，重新执行：

```powershell
npm run compile
```

然后在 EDA 扩展管理页面重新加载扩展（或重启 EDA）。

### 开发模式（watch）

```powershell
npm run dev
```

esbuild 会监听文件变化自动重新编译到 `dist/`。

### 修改菜单

菜单注册在 [extension.json](./extension.json) 的 `headerMenus` 字段，按 `home` / `sch` / `pcb` 三个页面分别配置。

---

## 九、参考链接

- [嘉立创EDA专业版 开发文档](https://prodocs.lceda.cn/cn/api/guide/)
- [扩展 API 参考](https://prodocs.lceda.cn/cn/api/reference/pro-api.html)
- [扩展广场](https://ext.lceda.cn/)
- [pro-api-sdk 脚手架](https://github.com/easyeda/pro-api-sdk)
- [本项目仓库](https://github.com/ZZC43013/jlceda-cocomment)
- [详细开发文档](./docs/DEV_DOC.md)
- [更新日志](./CHANGELOG.md)
