# 0.4.1

## 新增

1. **导出文件名加工程名**：`cocomment_<工程名>_<时间戳>.json`，让用户分清是哪个工程的评论
2. **导出 JSON 注入工程元数据**：含 `projectId` / `projectName` 字段，用于导入时校验工程归属
3. **导入工程归属校验**：如果导入的 JSON 属于另一个工程，弹窗提示用户确认，评论挂到原工程分区下（而非当前工程）

## 变更

- `ProjectData` 接口新增 `projectId?` / `projectName?` 可选元数据字段
- `CommentEngine` 新增 `importProjectTo(projectId, data)` 方法，支持导入到指定工程分区
- `PanelController.exportComments` 注入工程元数据 + 用工程名命名文件
- `PanelController.importComments` 校验 projectId，跨工程导入时弹窗确认
- 版本号 0.4.0 → 0.4.1

# 0.4.0

## 新增

1. **按工程隔离评论区**：每个工程有独立的评论区，互不干扰
2. **自动识别当前工程**：通过 `eda.sys_DocumentTree.getCurrentProjectInfo()` 获取工程 UUID 作为 projectId
3. **工程切换检测**：在 togglePanel / addAnnotation 入口检查工程是否切换，自动重载当前工程的评论
4. 新增 `src/utils/ProjectContext.ts` 模块：封装工程上下文获取逻辑，含 fallback 兜底

## 变更

- 修复 `ThreadManager.projectId` 永远为 `'default'` 的问题：所有工程的评论之前都堆在一起
- `ensureInitialized` 中调用 `getCurrentProjectContext` 设置真实的工程 UUID 到 engine
- `PanelController` 新增 `checkProjectSwitched` 方法，在 togglePanel/startDrawing 入口检测工程切换
- 版本号 0.3.0 → 0.4.0

# 0.3.0

## 变更

1. **移除方案B（工程文档同步）**：PoC 验证 `eda.sys_FileManager.setDocumentSource` 返回 false，EDA 拒绝修改文档源码（标记块注入破坏源码格式解析）。方案B 不可行，已移除相关代码
2. **删除 `src/sync/ProjectSync.ts`** 模块（标记块注入/提取、原始源码备份、紧急恢复）
3. **移除三个菜单项**（sch + pcb）：同步评论到工程 / 从工程读取评论 / 恢复工程源码
4. **移除 `PanelController` 中的方案B 方法**：syncToProject / syncFromProject / restoreProjectBackup / confirm / showSyncResult
5. **团队协作改为导出/导入工作流**：A 同事用"导出评论"生成 JSON → 发给同事 → B 同事用"导入评论"恢复。纯靠文件交换，不修改工程文档源码
6. **确认 EDA 无附件上传 API**：已查全部 DMT_*/SYS_FileSystem 类，均无云端附件上传能力。实时多人协同仍需等待嘉立创开放 API 或自建 WebSocket 后端
7. 版本号 0.2.0 → 0.3.0

# 0.2.0

## 新增

1. 新增方案B：评论数据与工程文档双向同步（准协同），把评论序列化为标记块（`%%COCOMMENT_V1:<base64>%%`）追加到当前 sch/pcb 文档源码末尾，靠 EDA 自身的工程同步机制传播给团队成员
2. 新增 `src/sync/ProjectSync.ts` 模块：基于 `eda.sys_FileManager.getDocumentSource` / `setDocumentSource` 两个 BETA API 实现评论数据与文档源码的双向同步，含标记块注入/提取、原始源码备份、紧急恢复
3. 新增"同步评论到工程"菜单（sch + pcb）：把当前所有评论写入工程文档源码，写入前弹窗确认风险并自动备份原始源码
4. 新增"从工程读取评论"菜单（sch + pcb）：从工程文档源码提取评论数据并恢复到本地存储，自动刷新面板
5. 新增"恢复工程源码"菜单（sch + pcb）：紧急恢复，用上次同步前的备份覆盖当前文档源码，还原设计数据
6. 新增 `eda.sys_Dialog.showConfirmationMessage` 确认弹窗封装（PanelController.confirm），用于方案B写入前的风险确认
7. 新增 base64 编码三级降级策略：Buffer（Node 主进程）→ btoa（浏览器/iframe）→ hex（纯 JS），保证主进程和 iframe 均可编解码

## 变更

1. 阶段2技术方案由"自建后端 REST API 云同步"调整为"方案B：评论随工程文档同步"，复用 EDA 自身的团队工程协作机制，无需自建服务器
2. 阶段3"实时协同"标记为等待嘉立创开放 API：当前 EDA 未暴露协作者列表、在线状态、实时光标、跨用户消息广播、共享 KV 存储等 API，无法实现真正的实时多人协同
3. 版本号 0.1.0 → 0.2.0

# 0.1.0

## 新增

1. 新增 CoComment 团队评论批注扩展：在 PCB 画布上拖框圈选区域，添加评论线程
2. 新增评论线程管理：创建、删除、解决、重开，支持未解决/已解决状态切换
3. 新增评论 CRUD：在线程下添加评论、删除评论（仅作者可删）
4. 新增视图自动跟随：缩放/平移画布时批注框自动跟随（requestAnimationFrame 轮询 eda.pcb_Document.zoomTo）
5. 新增点击定位：在列表点线程卡片 → 画布定位到批注位置 + 闪烁高亮
6. 新增本地存储：评论数据存到 localStorage，刷新不丢
7. 新增 JSON 导入导出：当前工程所有评论可导出为 JSON，或从 JSON 导入
8. 新增用户设置：修改昵称 + 选择批注颜色（8 色可选）
9. 新增搜索过滤：按评论内容/作者名搜索，按状态（全部/未解决/已解决）过滤
10. 新增右侧评论面板（panel.html）和透明批注覆盖层（annotation.html）两个 iframe
11. 新增 IframeManager 模块：集中处理 iframe 创建/显隐/消息，探测官方 sys_PanelControl/sys_IFrame，不存在时降级到浏览器原生 HTMLIFrameElement
12. 新增统一消息协议类型定义（types/messages.ts）：PanelMessage / OverlayMessage / Inbound 四类联合类型，结束消息字段全靠 any 的状态
13. 新增 HTML 内联 script 语法检查：集成到 npm run compile 流程，用 esbuild.transformSync 抽取 HTML 内 <script> 做纯语法检查，防止 HTML 直接复制导致 JS 语法错误不被发现
14. 新增开发文档 docs/DEV_DOC.md 和插件说明 README.md

## 变更

1. 修正虚构 API 调用：按真实类型定义文件 @jlceda/pro-api-types/index.d.ts 核对，移除所有不存在的 API（sys_Storage、sys_I18n.getLocale、sys_ToastMessage、sys_PanelControl 等），改用浏览器原生 localStorage 和 (eda as any) 防御性探测
2. 修正批注框不跟随视图变化的 bug：setupViewPolling 加 lastViewKey 变化检测，viewKey 变了才调用 renderAll
3. 修正 iframe url 路径：./src/iframe/panel.html → ./iframe/panel.html（编译后 dist 结构是 dist/index.js + dist/iframe/*.html，运行时相对路径应该是 ./iframe/）
4. 修正导入流程重复刷新：handleImport 里 refreshThreads() 后又调 refreshRenderer()，后者已包含前者，删除重复调用
5. 修正数据变更双重刷新无防抖：创建 thread 时 onThreadChange + onCommentChange 连续触发两次 refreshThreads，加 50ms 防抖合并为一次
6. 解耦 AnnotationRenderer：移除从未使用的 ISyncProvider 死依赖，postMessage(CustomEvent) 改为构造函数注入 onSendToOverlay 回调
7. 解耦 PanelController：抽离 iframe 创建/显隐/销毁职责到 IframeManager（453 行 → 269 行），导出导入改为 public 方法供 index.ts 复用
8. 移除 ThreadManager 搜索死代码：filter.search 按 label 搜但 panel 按评论内容搜，语义冲突且无人调用，从 ThreadFilter 接口删除
9. 移除 Navigator.flashThread 死代码：发 CustomEvent 但全代码库无人监听
10. CommentEngine.setCurrentUser 不再用 init() 复用（语义不清，会重新走冷启动），改用新增的 refreshUser 热更新方法

