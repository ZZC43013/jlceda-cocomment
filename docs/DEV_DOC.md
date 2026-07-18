# CoComment — 嘉立创EDA团队协作评论扩展 开发文档

> 版本：v0.4.1
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
│  本地评论    │    │  手动协同     │    │  实时多人协同     │
│  (MVP)      │    │  (JSON导入导出)│    │  (WebSocket)    │
└─────────────┘    └──────────────┘    └──────────────────┘
  ✅ 已完成          ✅ 已完成            ⏳ 等待嘉立创开放API
```

| 阶段 | 名称 | 核心能力 | 状态 |
|---|---|---|---|
| 1 | 本地评论 MVP | 批注框 + 评论 CRUD + 本地存储 + 跳转定位 | ✅ 已完成 |
| 2 | 手动协同 | JSON 文件导入导出工作流（A 导出 → 发给同事 → B 导入） | ✅ 已完成 |
| 3 | 实时协同 | WebSocket 推送 + 多人光标 + 实时评论 + 操作冲突处理 | ⏳ 等待嘉立创开放API |

### 阶段 1 — 本地评论 MVP（已完成）
- ✅ 批注绘制（draw Dialog：手绘/粘贴截图/上传图片）
- ✅ 评论线程管理（增删改查、未解决/已解决状态）
- ✅ 本地数据存储（sys_Storage）
- ✅ 点击评论跳转到对应位置并高亮
- ✅ 右侧评论列表面板
- ✅ 多行文字批注（textarea + 6 档字号）
- ✅ **按工程隔离评论区**（v0.4.0 新增：通过 `sys_DocumentTree.getCurrentProjectInfo` 获取工程 UUID 作为 projectId）

### 阶段 2 — 手动协同 / JSON 导入导出（已完成）

**核心思路**：通过 JSON 文件交换实现跨设备、跨用户的评论共享。A 同事导出 JSON → 发给同事 → B 同事导入 JSON。

**实现**：`PanelController.exportComments()` / `importComments()`，基于：
- `eda.sys_FileSystem.saveFile(blob, fileName)` — 导出 JSON 文件
- `eda.sys_FileSystem.openReadFileDialog(['.json'])` — 导入 JSON 文件

**工作流**：
```
A 同事：添加/修改评论 → 点"导出评论" → 生成 cocomment_<时间戳>.json → 发给同事
B 同事：收到 JSON → 点"导入评论" → 选择文件 → 评论恢复到本地
```

**限制**：
- 非实时，需要 A 主动导出、B 主动导入
- 导入会覆盖当前工程的评论（无合并机制）
- 无冲突解决，多人同时修改需协调导出顺序

### ~~方案B：工程文档同步~~（已废弃）

> **v0.2.0 曾尝试，v0.3.0 移除**

**原思路**：把评论数据序列化为标记块（`%%COCOMMENT_V1:<base64>%%`）追加到 sch/pcb 文档源码末尾，靠 EDA 自身的工程同步机制传播。

**废弃原因**：PoC 验证 `eda.sys_FileManager.setDocumentSource` 返回 false，EDA 拒绝修改文档源码（标记块注入破坏源码格式解析）。方案B 不可行。

**附件上传 API 调研结论**：已查全部 `DMT_*`（Project/Folder/Board/Team/Workspace）和 `SYS_FileSystem` 类，均无云端附件上传能力。`SYS_FileSystem.saveFile` 仅保存到本地，`saveFileToFileSystem` 仅写入本地文件系统。EDA 没有附件上传 API。

### 阶段 3 — 实时协同（⏳ 等待嘉立创开放API）

**当前阻塞**：嘉立创EDA专业版暂未暴露以下实时协作 API，本阶段无法推进：

| 缺失能力 | 说明 | 当前可读但不可写的 API |
|---|---|---|
| 协作者列表 / 在线状态 | 无法获取当前工程有哪些团队成员在线 | `eda.sys_Environment.getUserInfo()` 仅返回当前用户 |
| 实时光标 / 视图同步 | 无法看到他人的鼠标位置和视图区域 | 无 |
| 实时评论推送 | 评论增删无法实时广播给在线协作者 | `eda.sys_MessageBus` 仅限本机跨 context，不跨用户 |
| 冲突解决 / 操作日志 | 多人同时编辑同一 thread 无法自动合并 | 无 |
| 共享 KV 存储 | 无工程级别的共享键值存储（仅 `sys_Storage` 按用户隔离） | `eda.sys_Storage` 是用户私有 |
| 邀请 / 移除协作者 | 无法在扩展内管理工程成员 | 无 |
| 附件上传 | 无云端附件上传 API | `SYS_FileSystem` 仅本地文件操作 |

**可用的外部通信能力**（可用于自建协作通道，但需要自建服务器）：
- `eda.sys_WebSocket` — 原生 WebSocket 客户端
- `eda.sys_ClientUrl` — 获取客户端 URL 信息

**等待清单**：待嘉立创开放上述 API 后，本扩展可演进为真正的实时多人协同评论工具。在此之前，团队协作通过阶段2的 JSON 导入导出实现手动协同。

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
│         (PanelMessage/OverlayMessage/DrawMessage)│           │
│                                                │             │
│         iframe 创建: IframeManager             │             │
│         (基于 eda.sys_IFrame.openIFrame，       │             │
│          用 id 管理 panel/overlay/draw 窗口)    │             │
│                                                │             │
│         跨 context 通信: MessageBridge          │             │
│         (基于 eda.sys_MessageBus.publish/       │             │
│          subscribe，构造时清理旧订阅防泄漏)      │             │
│                                                │             │
│         存储: eda.sys_Storage                   │             │
│         (getExtensionUserConfig/                │             │
│          setExtensionUserConfig，按用户隔离)    │             │
│                                                │             │
│         团队协作: JSON 导入导出                  │             │
│         (eda.sys_FileSystem.saveFile/           │             │
│          openReadFileDialog，手动协同工作流)     │             │
└─────────────────────────────────────────────────────────────┘
```

**职责分层（解耦后）**：
- `index.ts` — 入口，装配 IframeManager + MessageBridge + AnnotationRenderer + PanelController
- `IframeManager` — 基于 `sys_IFrame` 的窗口管理（panel/overlay/draw，用 id 管理）
- `MessageBridge` — 基于 `sys_MessageBus` 的跨 context 通信桥（构造时清理旧订阅防泄漏）
- `AnnotationRenderer` — 视图轮询 + 坐标换算 + 通过回调发渲染指令（不依赖 ISyncProvider，不发 CustomEvent）
- `PanelController` — 业务编排 + 消息路由 + 导入导出（手动协同工作流）
- `types/messages.ts` — 统一消息协议类型定义（PanelMessage / OverlayMessage / DrawMessage / Inbound）

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
│   │   ├── SyncProvider.ts      # 同步提供者接口
│   │   └── LocalSync.ts         # 本地存储实现（阶段1，基于 sys_Storage）
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
├── extension.json               # 扩展清单
├── package.json
├── tsconfig.json
├── .edaignore                   # .eext 打包过滤规则
├── .gitignore
├── CHANGELOG.md                 # 更新日志
└── README.md                    # 项目说明
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

### 7.1 方案：draw Dialog + 图像锚点

**当前实现**（已放弃早期"透明 iframe 覆盖层"方案）：
- `sys_IFrame.openIFrame` 打开的是模态 Dialog 窗口（带标题栏的独立浮窗），不是透明覆盖层，无法在画布上直接绘制
- 改为打开独立的**绘制 Dialog**（`draw.html`），用户可：
  1. 手绘（画笔、矩形、箭头、文字标注）
  2. Ctrl+V 粘贴截图（配合系统截图工具 Win+Shift+S）
  3. 上传本地图片
- 确认后画布内容保存为 base64 PNG 图像，作为 thread 的 `anchor.image`

### 7.2 坐标系统（批注渲染）

```
画布逻辑坐标 (mil/mm)
    │
    │  eda.pcb_Document.convertDataOriginToCanvasOrigin
    ▼
画布像素坐标 (px)
    │
    │  logicBBoxToScreen (utils/coord.ts)
    ▼
annotation iframe 内 DOM 元素位置
```

### 7.3 坐标换算工具（utils/coord.ts）

- `logicBBoxToScreen(bbox, view)` — 逻辑矩形 → 屏幕矩形（用于批注框定位）
- `logicToScreen(x, y, view)` — 逻辑坐标 → 屏幕像素
- `screenToLogic(x, y, view)` — 屏幕像素 → 逻辑坐标

### 7.4 视图同步

- 用 `eda.sys_Timer.setIntervalTimer` 轮询视图状态（250ms 间隔）
- 检测 viewKey（zoom + offset + 视口尺寸）变化时才触发 `renderAll()`
- 主进程无 `requestAnimationFrame`，用 `sys_Timer` 替代

### 7.5 绘制交互流程（当前实现）

```
点击菜单"添加批注" / 面板 + 按钮
    ↓
PanelController.startDrawing()
    ↓
IframeManager.openDraw() 打开 draw Dialog
    ↓
用户在 Dialog 内手绘/粘贴/上传图片
    ↓
点"确认" → draw:complete 消息（含 base64 图像）
    ↓
PanelController 收到图像 → 创建 thread（anchor.image = base64）
    ↓
AnnotationRenderer.addThread(thread) 渲染到画布
    ↓
通知面板 thread:created，focus 输入框
    ↓
用户输入评论内容，回车提交
```

### 7.6 批注渲染层（annotation.html）

- 通过 `sys_IFrame.openIFrame` 打开的独立浮窗
- 接收主进程通过 `sys_MessageBus` 发来的渲染指令（`addThread`/`updateThread`/`removeThread`/`refreshAll`）
- 根据 thread 的 `anchor.image`（base64 PNG）在对应位置渲染图像 + 序号徽章
- 视图变化时由主进程的 `AnnotationRenderer` 推算新位置并下发更新

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

- 顶部菜单（sch/pcb）：`CoComment → 显示评论面板 / 添加批注 / 显示隐藏批注 / 导出评论 / 导入评论 / 关于 CoComment`
- 顶部菜单（home）：`CoComment → 关于 CoComment`
- 右侧面板常驻开关

---

## 九、关键 API 使用清单

> 以下 API 名称均来自 easyeda-api skill 权威 API 参考文档
> (`c:\Users\ZZC18\.trae-cn\skills\easyeda-api-skill\references\classes\`)，
> 该文档比 npm 包 `@jlceda/pro-api-types/index.d.ts` 更权威、更完整
> （npm 类型定义严重滞后，仅收录 2 个 SYS_ 类，实际运行时有 27 个 SYS_ 类）。
> `eda` 是 EDA 宿主注入的全局对象，扩展主进程和 sys_IFrame 内均可直接访问。

### 9.1 本项目使用的真实 EDA API（经 easyeda-api skill 确认存在）

| EDA API | 签名 | 用途 | 本项目模块 |
|---|---|---|---|
| `eda.sys_IFrame.openIFrame` | `openIFrame(htmlFileName, width?, height?, id?, props?): Promise<boolean>` | 打开内联框架窗口（Dialog） | IframeManager（panel + overlay） |
| `eda.sys_IFrame.showIFrame` | `showIFrame(id?): Promise<boolean>` | 显示 iframe 窗口 | IframeManager |
| `eda.sys_IFrame.hideIFrame` | `hideIFrame(id?): Promise<boolean>` | 隐藏 iframe 窗口 | IframeManager |
| `eda.sys_IFrame.closeIFrame` | `closeIFrame(id?): Promise<boolean>` | 关闭 iframe 窗口 | IframeManager |
| `eda.sys_MessageBus.publish` | `publish(topic, message): void` | 跨 context 广播消息 | MessageBridge（主进程→iframe / iframe→主进程） |
| `eda.sys_MessageBus.subscribe` | `subscribe(topic, callbackFn): Task` | 订阅 topic | MessageBridge（带 `task.remove()` 取消订阅） |
| `eda.sys_Storage.getExtensionUserConfig` | `getExtensionUserConfig(key): any` (同步) | 读取扩展用户配置 | LocalSync（评论数据持久化） |
| `eda.sys_Storage.setExtensionUserConfig` | `setExtensionUserConfig(key, value): Promise<void>` (异步) | 写入扩展用户配置 | LocalSync |
| `eda.sys_Dialog.showInformationMessage` | `showInformationMessage(message, title?): Promise<void>` | 信息提示对话框 | index.ts `about()` |
| `eda.sys_FileSystem.saveFile` | `saveFile(fileData: File \| Blob, fileName?: string): Promise<void>` | 保存文件（触发浏览器下载） | PanelController `exportComments()`（手动协同导出） |
| `eda.sys_FileSystem.openReadFileDialog` | `openReadFileDialog(filenameExtensions?, multiFiles?): Promise<Array<File> \| undefined>` | 打开文件读取对话框 | PanelController `importComments()`（手动协同导入） |
| `eda.sys_DocumentTree.getCurrentProjectInfo` | `getCurrentProjectInfo(): Promise<IDMT_ProjectItem \| undefined>` | 获取当前工程的详细属性（含 uuid / friendlyName / teamUuid） | `utils/ProjectContext.ts` 工程隔离 |
| `eda.sys_Timer.setIntervalTimer` | `setIntervalTimer(id: string, timeout: number, callFn, ...args): boolean` | 循环定时器（主进程无 setInterval） | AnnotationRenderer 视图轮询 |
| `eda.sys_Timer.clearIntervalTimer` | `clearIntervalTimer(id: string): boolean` | 清除循环定时器 | AnnotationRenderer |
| `eda.sys_Window.getViewportSize` | `getViewportSize(): { width: number; height: number }` | 获取视口大小（主进程无 window.innerWidth） | AnnotationRenderer（需 EDA v3.2.162+） |
| `eda.pcb_Document.convertDataOriginToCanvasOrigin` | `convertDataOriginToCanvasOrigin(x, y): Promise<{x,y}>` | 数据坐标→画布像素坐标 | AnnotationRenderer 渲染批注框 |
| `eda.pcb_Document.convertCanvasOriginToDataOrigin` | `convertCanvasOriginToDataOrigin(x, y): Promise<{x,y}>` | 画布像素坐标→数据坐标 | AnnotationRenderer 绘制→anchor |
| `eda.pcb_Document.navigateToCoordinates` | `navigateToCoordinates(x, y): Promise<boolean>` | 定位到数据坐标 | Navigator `jumpToThread()` |
| `eda.sys_Timer` / `eda.sys_Window` 等 27 个 SYS_ 类 | 见 skill references/classes/SYS_*.md | 系统级能力 | 各模块 |

### 9.2 菜单注册（声明式，无需调 API）

菜单注册通过 `extension.json` 的 `headerMenus` 字段静态配置，
`registerFn` 指向入口文件 `src/index.ts` 导出的函数名，由 EDA 宿主在加载时反射调用。
本项目不需要在代码里调 `eda.sys_HeaderMenu.create()` 之类的 API。

### 9.3 本项目使用的非 EDA API（浏览器原生，仅限 iframe 内）

> ⚠️ **主进程禁止**：`window`、`document`、`localStorage`、`requestAnimationFrame`、
> `document.createElement`、`alert`、`confirm` 等浏览器 API 在**扩展主进程中不可用**，
> 必须用 `eda.sys_*` 替代。下表中的 API 仅在 `sys_IFrame` 打开的 iframe 内可用。

| API | 用途 | 使用位置 | 是否主进程 |
|---|---|---|---|
| `document.createElement` | 创建 DOM 元素 | panel.html / annotation.html（iframe 内） | ❌ 仅 iframe |
| `document.getElementById` | 获取 DOM 元素 | panel.html / annotation.html（iframe 内） | ❌ 仅 iframe |
| `document.addEventListener` | 事件监听（鼠标绘制） | annotation.html（iframe 内） | ❌ 仅 iframe |
| `setTimeout` / `clearTimeout` | 短延时定时器（防抖） | PanelController（主进程，JS 全局函数，非 window.setTimeout） | ✅ 主进程可用 |
| `Blob` | 文件导出数据封装 | PanelController `exportComments()` | ✅ 主进程可用 |
| `console.log/warn` | 日志 | 各模块 | ✅ 主进程可用 |
| `JSON.parse/stringify` | 数据序列化 | 各模块 | ✅ 主进程可用 |
| `Map` / `Set` / `Promise` | JS 标准内置对象 | 各模块 | ✅ 主进程可用 |

### 9.4 ⚠️ 已修正的架构错误（早期版本误用，已全部移除）

完整重构中修正的关键认知错误：

| 错误认知 | 真实情况 | 修正方案 |
|---|---|---|
| ❌ `eda.pcb_Document.zoomTo()` 存在，可获取视图区域 | `zoomTo` 不存在！PCB_Document 无此方法 | 用 `convertDataOriginToCanvasOrigin` 逐 thread 转坐标 |
| ❌ `window.localStorage` 可在主进程用 | 主进程禁止 `window`、`localStorage` | 改用 `eda.sys_Storage.getExtensionUserConfig/setExtensionUserConfig` |
| ❌ `window.requestAnimationFrame` 可在主进程用 | 主进程禁止 `window`、`requestAnimationFrame` | 改用 `eda.sys_Timer.setIntervalTimer/clearIntervalTimer` |
| ❌ `window.innerWidth/innerHeight` 可在主进程用 | 主进程禁止 `window` | 改用 `eda.sys_Window.getViewportSize()` |
| ❌ `sys_IFrame.openIFrame` 返回 iframe 句柄，可用 postMessage | 返回 `Promise<boolean>`，用 id 管理窗口，无句柄 | 跨 context 通信改用 `eda.sys_MessageBus` |
| ❌ `sys_IFrame` 可创建透明画布覆盖层 | `openIFrame` 打开的是 Dialog 窗口（带标题栏的独立浮窗） | overlay iframe 改为独立浮窗，批注框坐标需 PoC 验证 |
| ❌ `window.parent.postMessage` 可跨 iframe 通信 | 主进程禁止 `window`，且 sys_IFrame 不返回句柄 | 全部改用 `eda.sys_MessageBus.publish/subscribe` |
| ❌ `document.createElement('a')` 可导出文件 | 主进程禁止 `document` | 改用 `eda.sys_FileSystem.saveFile(Blob, fileName)` |
| ❌ `document.createElement('input')` 可导入文件 | 主进程禁止 `document` | 改用 `eda.sys_FileSystem.openReadFileDialog()` |
| ❌ `window.setTimeout` 可在主进程用 | `window` 在主进程不可用 | 改用全局 `setTimeout`（JS 运行时内置，不依赖 window） |
| ❌ `(eda as any).sys_Dialog` 需要类型断言绕过 | sys_Dialog 是真实 API，skill 文档收录 | 直接 `eda.sys_Dialog.showInformationMessage()` |
| ❌ `eda.sys_Storage.getItem/setItem` 是正确方法名 | 真实方法名是 `getExtensionUserConfig/setExtensionUserConfig` | 已修正 |
| ❌ npm `@jlceda/pro-api-types` 是权威类型定义 | 该包严重滞后，仅收录 2 个 SYS_ 类 | 以 easyeda-api skill 文档为准（27 个 SYS_ 类） |

### 9.5 已知限制（需 PoC 验证）

以下问题已用真实 API 修正，但需在实际 EDA 环境中验证：

1. **annotation iframe 定位精度**：`sys_IFrame.openIFrame` 打开的是 Dialog 窗口（独立浮窗），
   不是透明画布覆盖层。annotation iframe 中的批注图像坐标是"画布像素坐标"（通过
   `convertDataOriginToCanvasOrigin` 转换），但浮窗不会精确覆盖在画布元素上。
   要让批注真正覆盖画布元素，需要未来 EDA 提供透明覆盖层 API，或改用画布图元
   （`PCB_Primitive`）绘制标记。

2. **坐标转换性能**：每个 thread 每次轮询需要 2 次 `convertDataOriginToCanvasOrigin` 调用
   （bbox 两个角点），thread 数量多时可能影响性能。当前轮询间隔 250ms，可调。

3. **EDA 版本要求**：`eda.sys_Window.getViewportSize()` 需要 EDA v3.2.162+。

4. **原理图支持**：`SCH_Document` 类型定义未暴露坐标转换方法，原理图批注暂不支持。

5. **手动协同限制**：JSON 导入会覆盖当前工程的评论（无合并机制），多人协作需协调导出顺序。

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
| 🏷️ 按工程隔离 | ✅ 已完成 | 2026-07-17 | ProjectContext.ts + sys_DocumentTree.getCurrentProjectInfo |
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

### 10.2 阶段 2 — 手动协同 / JSON 导入导出（已完成）

| 子任务 | 状态 | 完成日期 | 说明 |
|---|---|---|---|
| 导出评论 | ✅ 已完成 | 2026-07-17 | `eda.sys_FileSystem.saveFile` 导出 JSON |
| 导入评论 | ✅ 已完成 | 2026-07-17 | `eda.sys_FileSystem.openReadFileDialog` 读取 JSON |
| 菜单项注册 | ✅ 已完成 | 2026-07-17 | sch + pcb 各两项菜单（导出/导入） |
| ~~方案B 工程文档同步~~ | ❌ 已废弃 | 2026-07-17 | PoC 验证 setDocumentSource 返回 false，EDA 拒绝修改文档源码。已移除 ProjectSync.ts |

### 10.3 阶段 3 — 实时协同（⏳ 等待嘉立创开放API）

| 子任务 | 状态 | 阻塞原因 |
|---|---|---|
| 协作者列表 / 在线状态 | ⏳ 阻塞 | EDA 未暴露协作者查询 API |
| 实时光标 / 视图同步 | ⏳ 阻塞 | EDA 未暴露光标/视图广播 API |
| 实时评论推送 | ⏳ 阻塞 | sys_MessageBus 仅限本机，不跨用户 |
| 冲突解决 / 操作日志 | ⏳ 阻塞 | 无共享 KV 存储，无操作日志 API |
| 心跳 & 重连 | ⏳ 阻塞 | 依赖自建 WebSocket 服务器（偏离"靠 EDA 同步"目标） |

---

## 十一、风险 & 注意事项

| 风险 | 等级 | 应对 |
|---|---|---|
| 坐标换算不准确 | 🔴 高 | PoC 阶段重点验证 annotation iframe 定位精度，准备轮询兜底方案 |
| JSON 导入覆盖评论 | 🟡 中 | 导入会覆盖当前工程的评论（无合并机制），需在 UI 提示用户确认 |
| 部分 EDA API 不可用 | 🟡 中 | 准备替代方案（轮询代替事件等） |
| 大数据量性能问题 | 🟢 低 | 虚拟滚动 + Canvas 渲染（后续优化） |
| 扩展审核被拒 | 🟡 中 | 严格遵守扩展开发规范，不修改用户设计数据 |

---

## 十二、参考链接

- [嘉立创EDA专业版 开发文档](https://prodocs.lceda.cn/cn/api/guide/)
- [扩展 API 参考](https://prodocs.lceda.cn/cn/api/reference/pro-api.html)
- [扩展广场](https://ext.lceda.cn/)
- [pro-api-sdk 脚手架](https://github.com/easyeda/pro-api-sdk)
