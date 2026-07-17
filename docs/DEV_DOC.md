# CoComment — 嘉立创EDA团队协作评论扩展 开发文档

> 版本：v0.1.0 (MVP 规划中)
> 最后更新：2026-07-17
> 项目路径：`pro-api-sdk/`（基于嘉立创EDA pro-api-sdk 脚手架开发）

---

## 一、项目概述

**CoComment** 是一款嘉立创EDA专业版扩展，旨在为硬件设计团队提供类似 Figma 的评论批注协作能力。用户可以在原理图和 PCB 画布上直接圈选区域、添加文字评论、追踪解决状态，并最终演进到多人实时协同。

### 1.1 目标用户
- 硬件设计团队（原理图工程师、PCB Layout 工程师）
- 硬件项目经理 / 评审人员
- 需要跨地域协作的设计团队

### 1.2 核心价值
- **可视化评论**：直接在画布上圈选，所见即所得
- **设计评审**：替代传统邮件/截图反馈，减少沟通成本
- **问题追踪**：评论状态管理（未解决 / 已解决）
- **多人协同**：实时看到同事的评论和光标

---

## 二、技术路线（三阶段演进）

```
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│  阶段 1      │ →  │  阶段 2      │ →  │  阶段 3          │
│  本地评论    │    │  云同步       │    │  实时多人协同     │
│  (MVP)      │    │  (准协同)    │    │  (WebSocket)    │
└─────────────┘    └──────────────┘    └──────────────────┘
```

| 阶段 | 名称 | 核心能力 | 预计工作量 | 状态 |
|---|---|---|---|---|
| 1 | 本地评论 MVP | 批注框 + 评论 CRUD + 本地存储 + 跳转定位 + JSON 导入导出 | 约 3-5 天 | 🚧 进行中 |
| 2 | 云同步 | 后端 REST API + 评论上云 + 手动/自动同步 + 用户系统 | 约 3-5 天 | ⏳ 规划中 |
| 3 | 实时协同 | WebSocket 推送 + 多人光标 + 实时评论 + 操作冲突处理 | 约 5-7 天 | ⏳ 规划中 |

### 阶段 1 — 本地评论 MVP（当前目标）
- ✅ 原理图/PCB 批注框绘制（透明 iframe 覆盖层）
- ✅ 评论线程管理（增删改查、未解决/已解决状态）
- ✅ 本地数据存储（sys_Storage）
- ✅ JSON 文件导入导出
- ✅ 点击评论跳转到对应位置并高亮
- ✅ 右侧评论列表面板
- ✅ 批注工具栏

### 阶段 2 — 云同步（后续）
- 后端 Node.js 服务 + SQLite/PostgreSQL
- REST API：评论的增删改查同步
- 用户系统（昵称 + UUID）
- 手动/定时同步（拉模式）

### 阶段 3 — 实时协同（最终目标）
- WebSocket 双向通信
- 房间机制（工程 = 房间）
- 多人光标可见
- 实时评论推送
- 操作日志 + 冲突解决

---

## 三、系统架构

### 3.1 扩展端架构（阶段1 MVP）

```
┌─────────────────────────────────────────────────────────────┐
│                     嘉立创EDA 专业版                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   CoComment 扩展                     │   │
│  │                                                      │   │
│  │  ┌───────────┐    ┌────────────┐    ┌───────────┐   │   │
│  │  │   UI 层   │    │  业务核心层  │    │  存储同步层│   │   │
│  │  │           │    │            │    │           │   │   │
│  │  │PanelCtrl  │◀──▶│CommentEngine│◀──▶│SyncProvider│   │   │
│  │  │IframeMgr  │    │ThreadManager│    │  (接口)   │   │   │
│  │  └─────┬─────┘    └──────┬─────┘    └─────┬─────┘   │   │
│  │        │                 │                  │         │   │
│  │  ┌─────┴─────────────────┴──────────┐       │         │   │
│  │  │          批注渲染层               │       │         │   │
│  │  │     AnnotationRenderer           │       │         │   │
│  │  │   (透明 iframe 覆盖层 + 坐标换算)  │       │         │   │
│  │  │   通过回调注入 onSendToOverlay     │       │         │   │
│  │  └──────────────────────────────────┘       │         │   │
│  └─────────────────────────────────────────────┼─────────┘   │
│                                                │             │
│         消息协议: types/messages.ts            │             │
│         (PanelMessage/OverlayMessage)          │             │
│                                                │             │
│         iframe 创建: IframeManager             │             │
│         (探测 sys_PanelControl/sys_IFrame      │             │
│          → 降级原生 HTMLIFrameElement)          │             │
│                                                │             │
│         存储: window.localStorage              │             │
│         (sys_Storage 不存在，改用浏览器原生)     │             │
└─────────────────────────────────────────────────────────────┘
```

**职责分层（解耦后）**：
- `index.ts` — 入口，装配 IframeManager + AnnotationRenderer + PanelController
- `IframeManager` — iframe 创建/显隐/销毁/postMessage（从 PanelController 抽离）
- `AnnotationRenderer` — 视图轮询 + 坐标换算 + 通过回调发渲染指令（不依赖 ISyncProvider，不发 CustomEvent）
- `PanelController` — 业务编排 + 消息路由（瘦身，不再管 iframe 实现细节）
- `types/messages.ts` — 统一消息协议类型定义（PanelMessage / OverlayMessage / Inbound）

### 3.2 完整架构（阶段3）

见项目根目录架构图。核心思路：面向 `ISyncProvider` 接口编程，阶段切换只换实现，业务层零修改。

---

## 四、目录结构

```
pro-api-sdk/
├── docs/
│   └── DEV_DOC.md               # 本文档
│
├── src/
│   ├── index.ts                 # 入口：注册菜单、初始化
│   ├── bootstrap.ts             # 启动引导
│   │
│   ├── core/                    # 业务核心层
│   │   ├── CommentEngine.ts     # 评论引擎（总控入口）
│   │   ├── ThreadManager.ts     # 评论线程管理
│   │   ├── AnnotationRenderer.ts # 批注渲染器
│   │   └── Navigator.ts         # 定位导航
│   │
│   ├── ui/                      # UI 控制层
│   │   ├── PanelController.ts   # 业务编排 + 消息路由（已瘦身）
│   │   ├── IframeManager.ts     # iframe 创建/显隐/消息（从 PanelController 抽离）
│   │   └── ToolbarManager.ts    # 工具栏管理（规划中）
│   │
│   ├── iframe/                  # iframe 承载的复杂 UI
│   │   ├── panel.html           # 评论面板（主 UI）
│   │   ├── panel.css
│   │   └── panel.ts             # 面板交互逻辑（规划中）
│   │
│   ├── sync/                    # 存储同步层
│   │   ├── SyncProvider.ts      # 同步提供者接口
│   │   └── LocalSync.ts         # 本地存储实现（阶段1）
│   │
│   ├── types/                   # 类型定义
│   │   ├── comment.ts
│   │   ├── user.ts
│   │   ├── sync.ts
│   │   └── messages.ts          # 跨 iframe 消息协议（解耦后新增）
│   │
│   └── utils/                   # 工具函数
│       ├── coord.ts             # 坐标换算
│       ├── id.ts                # ID 生成
│       └── i18n.ts              # 多语言
│
├── extension.json               # 扩展清单
├── package.json
└── tsconfig.json
```

---

## 五、数据模型

### 5.1 CommentThread（评论线程）

```typescript
interface CommentThread {
    id: string;                          // 线程ID（UUID v4，无连字符）
    projectId: string;                   // 工程ID
    pageId: string;                      // 文档ID（原理图页/PCB）
    pageType: 'schematic' | 'pcb';       // 页面类型

    // 定位锚点
    anchor: {
        type: 'box' | 'arrow';           // 批注类型
        bbox?: {                         // 框选（画布逻辑坐标）
            x: number; y: number;
            w: number; h: number;
        };
    };

    // 关联图元（辅助语义）
    relatedPrimitives: Array<{
        type: string;
        id: string;
        label?: string;
    }>;

    // 状态
    status: 'open' | 'resolved';
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    resolvedBy?: string;
    resolvedAt?: number;

    // 版本号（同步用）
    version: number;
}
```

### 5.2 Comment（评论）

```typescript
interface Comment {
    id: string;
    threadId: string;

    authorId: string;
    authorName: string;

    content: string;
    mentions: string[];

    attachments: Array<{
        id: string;
        type: 'image' | 'file';
        name: string;
        dataUrl?: string;    // 本地阶段用base64
        url?: string;        // 云端阶段用URL
    }>;

    createdAt: number;
    updatedAt: number;

    action?: 'create' | 'resolve' | 'reopen' | 'edit';
}
```

### 5.3 User（用户）

```typescript
interface User {
    id: string;           // UUID
    name: string;         // 昵称
    color: string;        // 批注颜色（自动分配）
}
```

### 5.4 本地存储格式

```typescript
interface LocalData {
    schemaVersion: 1;
    currentUser: User;
    projects: {
        [projectId: string]: {
            threads: CommentThread[];
            comments: { [threadId: string]: Comment[] };
            lastSyncedAt?: number;
        };
    };
}
```

---

## 六、核心模块设计

### 6.1 CommentEngine（评论引擎）

**职责**：统一对外的业务入口，协调各模块工作。

```typescript
class CommentEngine {
    // 生命周期
    init(): Promise<void>;
    destroy(): void;

    // 线程操作
    createThread(pageType, anchor, firstComment): Promise<CommentThread>;
    updateThread(threadId, patch): Promise<void>;
    deleteThread(threadId): Promise<void>;
    resolveThread(threadId): Promise<void>;
    reopenThread(threadId): Promise<void>;
    getThreads(filters?): Promise<CommentThread[]>;

    // 评论操作
    addComment(threadId, content, attachments?): Promise<Comment>;
    updateComment(commentId, content): Promise<void>;
    deleteComment(commentId): Promise<void>;
    getComments(threadId): Promise<Comment[]>;

    // 导航
    jumpToThread(threadId): Promise<void>;

    // 导入导出
    exportToJson(): string;
    importFromJson(jsonStr: string): Promise<void>;
}
```

### 6.2 AnnotationRenderer（批注渲染器）

**职责**：在画布上绘制批注框，处理坐标换算和视图同步。

```typescript
class AnnotationRenderer {
    init(): Promise<void>;
    destroy(): void;

    // 渲染控制
    show(): void;
    hide(): void;

    // 批注框管理
    addThread(thread: CommentThread): void;
    updateThread(thread: CommentThread): void;
    removeThread(threadId: string): void;
    clearAll(): void;

    // 绘制模式
    startDrawing(type: 'box' | 'arrow'): Promise<CommentThread['anchor'] | null>;
    cancelDrawing(): void;

    // 交互
    onThreadClick(callback: (threadId: string) => void): () => void;
    highlightThread(threadId: string): void;
    flashThread(threadId: string): void;
}
```

### 6.3 ISyncProvider（同步接口）

**职责**：数据持久化的抽象接口，阶段切换时替换实现。

```typescript
interface ISyncProvider {
    // 线程
    getThreads(projectId: string): Promise<CommentThread[]>;
    createThread(thread: CommentThread): Promise<void>;
    updateThread(threadId: string, patch: Partial<CommentThread>): Promise<void>;
    deleteThread(threadId: string): Promise<void>;

    // 评论
    getComments(threadId: string): Promise<Comment[]>;
    createComment(comment: Comment): Promise<void>;
    updateComment(commentId: string, patch: Partial<Comment>): Promise<void>;
    deleteComment(commentId: string): Promise<void>;

    // 事件（实时同步用）
    onThreadChange?(callback: (op: SyncOp) => void): () => void;
    onCommentChange?(callback: (op: SyncOp) => void): () => void;

    // 用户
    getCurrentUser(): Promise<User>;
    setCurrentUser(user: User): Promise<void>;

    // 导入导出
    exportAll(projectId: string): Promise<LocalData['projects'][string]>;
    importAll(projectId: string, data: LocalData['projects'][string]): Promise<void>;
}
```

---

## 七、批注渲染技术方案

### 7.1 方案：透明 iframe 覆盖层

使用 `eda.sys_IFrame` 创建一个全屏透明的 iframe，作为批注绘制层。

### 7.2 坐标系统

```
画布逻辑坐标 (mil/mm)
    │
    │  zoom, offset
    ▼
屏幕像素坐标 (px)
    │
    │  CSS position
    ▼
iframe 内 DOM 元素位置
```

### 7.3 坐标换算工具（utils/coord.ts）

- `logicToScreen(x, y, view)` — 逻辑坐标 → 屏幕像素
- `screenToLogic(x, y, view)` — 屏幕像素 → 逻辑坐标
- `logicBBoxToScreen(bbox, view)` — 逻辑矩形 → 屏幕矩形

### 7.4 视图同步

- 监听视图变化事件（或轮询）获取当前 zoom / offset
- 视图变化时，批量更新所有批注框的 CSS transform
- 使用 `requestAnimationFrame` 合并更新，保证 60fps

### 7.5 绘制交互流程

```
点击工具栏「添加批注」
    ↓
进入绘制模式（鼠标变十字）
    ↓
mousedown → 记录起点（屏幕 → 逻辑）
    ↓
mousemove → 实时更新预览框（iframe 层内完成）
    ↓
mouseup → 确认批注框
    ↓
弹出评论输入（面板新增输入框）
    ↓
提交 → 创建 Thread + Comment
    ↓
渲染批注标记
```

### 7.6 鼠标穿透

- 默认状态：iframe `pointer-events: none`（不拦截画布操作）
- 绘制模式：iframe `pointer-events: auto`（捕获绘制操作）
- 批注框标记：始终 `pointer-events: auto`（可点击）

---

## 八、UI 设计

### 8.1 评论面板（右侧 iframe）

```
┌──────────────────────┐
│ CoComment    [⚙] [+] │    ← 标题 + 工具栏
├──────────────────────┤
│ 🔍 搜索...            │    ← 搜索框
│ ○ 全部  ○ 未解决  ○已 │    ← 状态过滤
├──────────────────────┤
│ ┌─┐  #1  标题...      │
│ │▢│  3 条评论 · 未解决 │    ← 线程卡片
│ └─┘  用户 · 2小时前    │
├──────────────────────┤
│ ┌─┐  #2  ...         │
│ │▢│  已解决 ✓         │
│ └─┘                   │
├──────────────────────┤
│ 共 N 条评论           │
└──────────────────────┘
```

### 8.2 批注框样式

- 未解决：红色虚线框 + 序号标记（带用户颜色）
- 已解决：绿色实线框 + ✓ 标记（半透明）
- hover 时：高亮 + 显示操作按钮（删除、解决）
- 选中状态：加粗边框 + 评论气泡预览

### 8.3 工具栏入口

- 顶部菜单：`CoComment → 显示评论面板 / 添加批注 / 导入 / 导出 / 设置`
- 右侧面板常驻开关

---

## 九、关键 API 使用清单

> 以下 API 名称均来自 `@jlceda/pro-api-types/index.d.ts` 真实类型定义文件，
> 不再使用任何猜测的 API 名。`eda` 是 EDA 宿主注入的全局对象。

### 9.1 真实存在的 API（类型定义文件收录）

| EDA API | 类型定义位置 | 用途 | 本项目模块 |
|---|---|---|---|
| `eda.pcb_Document.zoomTo(x?, y?, scaleRatio?, tabId?)` | L4358 / L1123 | 视图区域查询与缩放定位 | AnnotationRenderer（视图轮询）、Navigator（跳转） |
| `eda.pcb_Document.navigateToCoordinates(x, y)` | L4502 | 坐标导航 | Navigator 备选 |
| `eda.pcb_Document.getCanvasOrigin()` | L4464 | 获取画布原点偏移 | coord 换算（PoC 验证） |
| `eda.pcb_Document.convertCanvasOriginToDataOrigin(x, y)` | L4432 | 画布原点→数据原点 | coord 换算 |
| `eda.pcb_Document.convertDataOriginToCanvasOrigin(x, y)` | L4445 | 数据原点→画布原点 | coord 换算 |
| `eda.pcb_Event.addMouseEventListener(id, eventType, callFn, onlyOnce?)` | L5156 / L5174 | 鼠标事件监听（绘制用） | AnnotationRenderer（绘制模式，PoC 替换 iframe 内捕获） |
| `eda.pcb_Event.addPrimitiveEventListener(id, eventType, callFn, onlyOnce?)` | L5156 | 图元事件监听 | SelectionLinker（规划中） |
| `eda.sys_FileManager.getProjectFile(...)` | L5381 / L5396 | 获取工程文件 | 导入导出（备选方案） |
| `eda.sys_FileManager.getDocumentFile(...)` | L5410 | 获取文档文件 | 导入导出（备选方案） |
| `eda.sys_Unit` | L1725 | 单位枚举（MIL/INCH/MM/CM/M） | coord 换算单位判断 |
| `eda.dmt_EditorControl` | L980 | 文档树编辑控制（打开/切换文档） | Navigator（页面切换，PoC 验证） |
| `eda.dmt_Event` | L1211 | 文档树事件 | 监听页面切换以重载批注 |
| `eda.pcb_Drc` | L4677 | 自定义 DRC 规则 | 规划中（评论→DRC 标记联动） |
| `eda.pcb_ManufactureData.getBomFile(...)` | L5653 / L5911 | BOM 文件导出 | 规划中（BOM 联动） |

### 9.2 在示例注释中真实出现但类型未收录的 API

| EDA API | 出现位置 | 用途 | 备注 |
|---|---|---|---|
| `eda.sys_FileSystem.saveFile(file, fileName?)` | L5683/L5735/L5800 等 21 处 | 保存文件到本地 | 类型未收录但官方示例频繁使用 |
| `eda.sys_FileSystem.openReadFileDialog(ext)` | L5848 | 打开文件读取对话框 | 类型未收录但官方示例使用 |

### 9.3 本项目使用的非 EDA API（浏览器原生）

| API | 用途 | 模块 |
|---|---|---|
| `window.localStorage` | 本地数据持久化（评论数据） | LocalSync |
| `window.requestAnimationFrame` | 视图轮询（60fps 合并渲染） | AnnotationRenderer |
| `document.createElement('iframe')` | iframe 兜底方案 | PanelController（当 `sys_IFrame` 不存在时） |
| `window.postMessage` / `MessageEvent` | 跨 iframe 通信 | PanelController / Renderer |
| `Blob` + `URL.createObjectURL` | JSON 文件导出 | index.ts / PanelController |
| `crypto.randomUUID()` | UUID 生成 | utils/id.ts |

### 9.4 菜单注册（声明式，无需调 API）

菜单注册通过 `extension.json` 的 `headerMenus` 字段静态配置，
`registerFn` 指向入口文件 `src/index.ts` 导出的函数名，由 EDA 宿主在加载时反射调用。
本项目不需要在代码里调 `eda.sys_HeaderMenu.create()` 之类的 API（该 API 也不存在于类型定义中）。

### 9.5 ⚠️ 不存在的 API（早期文档中误用，已剔除）

以下 API 名是早期开发文档中猜测的，在 `index.d.ts` 中均无定义，已全部移除：

- ❌ `eda.sys_Storage.getItem/setItem` → 改用 `window.localStorage`
- ❌ `eda.sys_IFrame.create` / `eda.sys_Iframe.create` → 改为 `(eda as any)` 运行时探测 + 浏览器 iframe 兜底
- ❌ `eda.sys_PanelControl.create` → 同上，运行时探测
- ❌ `eda.sys_Dialog.showInformationMessage` → 运行时探测，无则 `console.log`
- ❌ `eda.sys_I18n.text` / `eda.sys_I18n.getLocale` → 改用自带 i18n 字典，默认 zh-Hans
- ❌ `eda.sys_HeaderMenu` → 不需要，用 `extension.json` 静态注册
- ❌ `eda.sys_Window` → 不存在，改用浏览器原生 DOM
- ❌ `eda.sys_ToastMessage` → 不存在，用 `console.warn` 替代
- ❌ `eda.pcb_document.getViewState()` → 小写 `pcb_document` 错误，正确为 `eda.pcb_Document`；且无 `getViewState` 方法，改用 `zoomTo()` 返回值推算视图
- ❌ `eda.sch_document` / `eda.sch_event` → 原理图相关 API 在类型定义中未暴露，原理图批注暂不支持（阶段 2 PoC 验证）

---

## 十、开发进度追踪

### 10.1 阶段 1 — 本地评论 MVP

| 子任务 | 状态 | 完成日期 | 说明 |
|---|---|---|---|
| 📝 开发文档编写 | ✅ 已完成 | 2026-07-17 | 本文档 |
| 🏗️ 项目骨架搭建 | ✅ 已完成 | 2026-07-17 | 目录结构 + 类型定义 |
| 🔧 工具层实现 | ✅ 已完成 | 2026-07-17 | coord.ts / id.ts / i18n.ts |
| 💾 存储层实现 | ✅ 已完成 | 2026-07-17 | ISyncProvider 接口 + LocalSync |
| 🧠 核心业务层 | ✅ 已完成 | 2026-07-17 | ThreadManager + CommentManager + CommentEngine |
| 🎨 批注渲染层 | ✅ 已完成 | 2026-07-17 | AnnotationRenderer + annotation.html |
| 🖥️ UI 面板层 | ✅ 已完成 | 2026-07-17 | panel.html + PanelController |
| 🧭 导航定位 | ✅ 已完成 | 2026-07-17 | Navigator（跳转 + 高亮 + 面板闪烁联动） |
| 🚪 入口集成 | ✅ 已完成 | 2026-07-17 | index.ts + extension.json 菜单 |
| ✅ 编译验证 | ✅ 已完成 | 2026-07-17 | esbuild 编译通过，dist 产出正确 |

#### 10.1.1 本地批注功能完善（2026-07-17 第二轮）

| 修复项 | 优先级 | 说明 |
|---|---|---|
| 🐛 annotation.html 语法错误 | P0 | 第 222 行 forEach 括号不匹配会导致 overlay 脚本崩 |
| 🐛 ThreadManager.createThread 崩溃 | P0 | 动态 new CommentManager 未 init 导致 currentUser 为 undefined；改为引擎初始化时注入 CommentManager 引用 |
| 🐛 i18n t() 占位符替换失效 | P0 | 字典用 `{count}` 命名占位符但代码替换 `{1}` 索引；改为成对取参数替换命名占位符 |
| ✨ addAnnotation 流程统一 | P0 | 由 index.ts 委托给 PanelController.startDrawing()，创建空 thread 后自动 focus 输入框让用户输入正文 |
| ✨ 序号一致性 | P1 | PanelController 计算稳定序号（按 createdAt 升序），下发给 annotation 徽章和 panel 卡片标题，两边对齐 |
| ✨ thread 标题改为首条评论内容 | P1 | 不再用 relatedPrimitives.label（创建时为空），改用第一条评论内容，无评论时显示"(待输入评论)" |
| ⚡ refresh 合并 | P1 | refreshThreads 和 refreshRenderer 合并为一次 getThreads 调用，避免重复请求 |
| ✨ togglePanel 真正显隐 | P1 | 兼容官方 setVisible/show/hide 方法和 HTMLIFrameElement.style.display |
| ✨ flashThread 接通 | P1 | 跳转 thread 时通知面板闪烁对应卡片，形成"点击列表→画布定位→列表高亮"闭环 |
| ✨ 单条评论删除 | P2 | 评论项加删除按钮（仅作者可删），PanelController 新增 action:delete-comment 处理 |
| ✨ 搜索增强 | P2 | 搜索同时匹配评论内容和作者名 |
| ✨ 用户设置弹窗 | P2 | 头部 ⚙ 按钮打开设置，可改昵称和 8 色批注颜色，通过 action:set-user 持久化 |
| ✨ destroy 清理 iframe | P2 | 卸载时移除兜底 iframe DOM，避免泄漏 |
| 🧪 PoC 验证 | 🟡 进行中 | 待在实际 EDA 环境中安装验证 |

### 10.2 阶段 2 — 云同步

| 子任务 | 状态 | 完成日期 | 说明 |
|---|---|---|---|
| 后端服务骨架 | ⚪ 待开始 | - | Node.js + Fastify + SQLite |
| REST API | ⚪ 待开始 | - | 评论 CRUD + 用户 |
| RestSync 实现 | ⚪ 待开始 | - | 扩展端同步适配器 |
| 部署方案 | ⚪ 待开始 | - | Docker + VPS |

### 10.3 阶段 3 — 实时协同

| 子任务 | 状态 | 完成日期 | 说明 |
|---|---|---|---|
| WebSocket 服务 | ⚪ 待开始 | - | ws 库 + 房间管理 |
| WsSync 实现 | ⚪ 待开始 | - | 扩展端 WebSocket 客户端 |
| 多人光标 | ⚪ 待开始 | - | Presence 系统 |
| 冲突处理 | ⚪ 待开始 | - | 操作日志 + 版本号 |
| 心跳 & 重连 | ⚪ 待开始 | - | 稳定性保障 |

---

## 十一、风险 & 注意事项

| 风险 | 等级 | 应对 |
|---|---|---|
| 坐标换算不准确 | 🔴 高 | PoC 阶段重点验证，准备轮询兜底方案 |
| iframe 影响画布操作 | 🟡 中 | pointer-events 穿透控制 |
| 部分 EDA API 不可用 | 🟡 中 | 准备替代方案（轮询代替事件等） |
| 大数据量性能问题 | 🟢 低 | 虚拟滚动 + Canvas 渲染（后续优化） |
| 扩展审核被拒 | 🟡 中 | 严格遵守扩展开发规范，不修改用户设计数据 |

---

## 十二、参考链接

- [嘉立创EDA专业版 开发文档](https://prodocs.lceda.cn/cn/api/guide/)
- [扩展 API 参考](https://prodocs.lceda.cn/cn/api/reference/pro-api.html)
- [扩展广场](https://ext.lceda.cn/)
- [pro-api-sdk 脚手架](https://github.com/easyeda/pro-api-sdk)
