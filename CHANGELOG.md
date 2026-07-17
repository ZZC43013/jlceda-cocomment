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

# 1.2.0

## 变更

1. 使用纯 ESLint 的代码格式化方式
2. 打包时额外进行压缩，可以获得更小的扩展包

# 1.1.1

## 变更

1. 为了符合隐私政策，禁止在 extension.json、README.md、CHANGELOG.md、LICENSE 内添加电子邮箱地址作为联系方式

# 1.1.0

## 新增

1. 新增扩展注册头部菜单的多语言翻译支持
2. 新增更新日志（CHANGELOG.md）

## 变更

1. 替换已弃用的方法（SYS_Dialog.showInformationMessage）

# 1.0.0

初始版本
