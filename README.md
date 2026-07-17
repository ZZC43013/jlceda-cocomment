# CoComment — 嘉立创EDA 团队评论批注扩展

> 版本：v0.1.0
> 适用：嘉立创EDA专业版 / EasyEDA Pro (EDA 引擎 ^3.0.0)
> 状态：阶段 1（本地评论 MVP）已开发完成，待真实 EDA 环境 PoC 验证

在原理图和 PCB 画布上直接圈选区域、添加评论、追踪解决状态，类似 Figma 的评论协作能力。当前为单机本地版，后续将演进到多人协同。

---

## 一、功能列表

### 已实现（阶段 1 本地版）

| 功能 | 说明 |
|---|---|
| PCB 批注框绘制 | 在 PCB 画布上拖框圈选区域，创建批注 |
| 评论线程管理 | 增删改查、未解决/已解决状态切换 |
| 评论 CRUD | 在线程下添加、删除评论（仅作者可删） |
| 视图自动跟随 | 缩放/平移画布时批注框自动跟随（requestAnimationFrame 轮询） |
| 点击定位 | 在列表点线程卡片 → 画布定位到批注位置 + 闪烁高亮 |
| 本地存储 | 评论数据存到 localStorage，刷新不丢 |
| JSON 导入导出 | 把当前工程所有评论导出为 JSON，或从 JSON 导入 |
| 用户设置 | 修改昵称 + 选择批注颜色（8 色可选） |
| 搜索过滤 | 按评论内容/作者名搜索，按状态（全部/未解决/已解决）过滤 |
| 显示/隐藏批注 | 一键切换画布上所有批注框的显隐 |

### 未实现（后续阶段）

- ❌ 原理图批注（`SCH_Document` API 未在类型定义中暴露）
- ❌ 多人协同（阶段 2 后端 REST + 阶段 3 WebSocket）
- ❌ 评论附件（图片/文件上传）
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
    └── annotation.html   # 透明批注覆盖层
```

**`npm run build` 额外产物**（位于 `pro-api-sdk/build/dist/`）：

```
build/dist/
└── cocomment_v0.1.0.eext   # 嘉立创EDA扩展包（zip 格式，按 .edaignore 过滤）
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

1. 执行 `npm run build` 生成 `build/dist/cocomment_v0.1.0.eext`
2. 在嘉立创EDA专业版的扩展管理页面选择 **从文件安装**
3. 选择 `cocomment_v0.1.0.eext` 文件

---

## 四、使用方法

### 4.1 菜单功能

在原理图或 PCB 编辑器中，顶部 **CoComment** 菜单提供 6 个操作：

| 菜单项 | 功能 |
|---|---|
| 显示评论面板 | 切换右侧评论列表面板的显隐 |
| 添加批注 | 进入绘制模式，在画布拖框圈选区域 |
| 显示/隐藏批注 | 切换画布上所有批注框的显隐 |
| 导出评论 | 导出当前工程所有评论为 JSON |
| 导入评论 | 从 JSON 文件导入评论（覆盖当前工程） |
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
2. 鼠标移到 PCB 画布，光标变十字
3. 按住鼠标拖一个矩形框，松开
4. 右侧面板自动出现新线程，输入框聚焦
5. 输入评论内容，回车提交
6. 画布上出现红色虚线框 + 序号徽章
```

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
│   │   ├── PanelController.ts   # 业务编排 + 消息路由
│   │   └── IframeManager.ts     # iframe 创建/显隐/消息（官方 API 探测 + 原生降级）
│   │
│   ├── iframe/                  # iframe 承载的 UI
│   │   ├── panel.html           # 评论面板（右侧列表）
│   │   └── annotation.html      # 透明批注覆盖层
│   │
│   ├── sync/                    # 存储同步层
│   │   ├── SyncProvider.ts      # 同步接口（阶段切换时换实现）
│   │   └── LocalSync.ts         # 本地存储实现（localStorage）
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
│       └── i18n.ts              # 多语言（zh-Hans）
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
│       └── annotation.html
│
└── build/dist/                  # 打包产物（build 后生成）
    └── cocomment_v0.1.0.eext
```

---

## 六、技术原理（简述）

扩展本质 = 被嘉立创EDA加载到页面 JS 上下文里的一段代码：

1. **EDA 读取 extension.json** → 用户点菜单时反射调用 `dist/index.js` 中对应的导出函数
2. **`eda` 全局对象** = 扩展调用宿主能力的唯一通道（如 `eda.pcb_Document.zoomTo()`）
3. **批注框原理** = 透明 iframe 覆盖画布（`position: fixed` + `pointer-events` 穿透控制）+ 逻辑坐标 ↔ 屏幕坐标换算
4. **视图同步** = requestAnimationFrame 轮询 `eda.pcb_Document.zoomTo()` 拿当前视图区域，推算 zoom/offset
5. **通信** = parent ↔ iframe 用 `window.postMessage` 双向通信（消息协议见 [src/types/messages.ts](./src/types/messages.ts)）
6. **存储** = `window.localStorage`（EDA 未提供 sys_Storage，改用浏览器原生）

详见 [docs/DEV_DOC.md](./docs/DEV_DOC.md)。

---

## 七、首次加载必做的验证

扩展**尚未在真实 EDA 环境跑过**，第一次加载后请打开开发者工具（F12）观察控制台：

**正常日志**：
```
[cocomment] HTML script 语法检查通过
[cocomment] Copied iframe assets to dist/iframe
```

**重点排查 3 个可能失败的点**：

1. **`eda.pcb_Document.zoomTo()` 返回值**
   在 F12 控制台执行：
   ```javascript
   await eda.pcb_Document.zoomTo()
   ```
   预期返回 `{left, right, top, bottom}`。如果返回其他结构，[src/core/AnnotationRenderer.ts](./src/core/AnnotationRenderer.ts) 的视图推算逻辑要调整。

2. **iframe 是否创建成功**
   控制台看有无 `sys_PanelControl.create failed` 或 `sys_IFrame.create failed` 警告。如果官方 API 不存在，会降级到原生 iframe。

3. **iframe 路径**
   控制台看 panel.html 是否 404。当前用 `./iframe/panel.html`（相对 index.js 所在目录）。

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
- [pro-api-sdk 脚手架](https://gitee.com/jlceda/pro-api-sdk)
- [详细开发文档](./docs/DEV_DOC.md)
