# pro-api-sdk Code Wiki

> 嘉立创EDA & EasyEDA 专业版扩展 API 开发工具（Extension SDK / 脚手架）
> 版本：1.3.2 · 许可证：Apache-2.0 · 官方文档：<https://prodocs.lceda.cn/cn/api/guide/>

---

## 一、项目概述

`pro-api-sdk` 是面向 [嘉立创EDA专业版](https://pro.lceda.cn/) / EasyEDA Pro 的**扩展开发脚手架**。它本身不是一个可独立运行的应用，而是为第三方开发者提供：

1. 扩展开发的工程结构（入口、清单、菜单注册示例）；
2. 基于 `esbuild` 的编译构建管线（产出 IIFE 浏览器产物）；
3. 基于 `jszip` + `ignore` 的打包工具（产出可直接安装的 `.eext` 扩展包）；
4. 内置 ESLint（`@antfu/eslint-config`）代码规范与 Git Hook（`simple-git-hooks` + `lint-staged`）；
5. 多语言（i18n）资源目录与扩展菜单翻译示例；
6. 嘉立创EDA 专业版扩展 API 的 TypeScript 类型定义依赖 `@jlceda/pro-api-types`。

> 运行宿主：扩展最终运行在嘉立创EDA专业版客户端中，宿主会注入全局对象 `eda`（提供 `sys_Dialog`、`sys_I18n` 等命名空间 API）。开发期间 `eda` 由类型包 `@jlceda/pro-api-types` 提供 TypeScript 类型，运行时由宿主提供。

---

## 二、项目整体架构

```
pro-api-sdk/
├── src/                     # 扩展源码目录
│   └── index.ts             # 扩展入口文件（导出 activate / 菜单回调）
├── iframe/                  # 扩展内嵌 IFrame 页面示例
│   └── index.html
├── config/                  # esbuild 构建配置
│   ├── esbuild.common.ts    # 通用构建配置（IIFE / browser 平台）
│   └── esbuild.prod.ts      # 生产构建入口（支持 --watch）
├── build/                   # 打包相关
│   ├── packaged.ts          # 将产物打包为 .eext 扩展包
│   └── dist/                # 打包输出目录（.eext 产物，被 .gitignore 忽略）
├── locales/                 # 运行时多语言资源
│   ├── en.json
│   ├── zh-Hans.json
│   └── extensionJson/       # 扩展清单(extension.json)菜单标题的翻译
│       ├── en.json
│       └── zh-Hans.json
├── images/                  # 扩展图标资源
│   └── logo.png
├── extension.json           # 扩展清单（核心配置，宿主读取）
├── package.json             # npm 脚本与开发依赖
├── tsconfig.json            # TypeScript 编译配置
├── eslint.config.mjs        # ESLint 配置（基于 antfu）
├── .edaignore               # 打包时需排除的文件清单（类似 .gitignore 语法）
├── .editorconfig            # 编辑器格式规范
├── .npmrc                   # npm 配置（可切换国内镜像）
└── README.md / CHANGELOG.md / LICENSE
```

### 架构分层

项目可划分为**四个职责层**：

| 层 | 目录/文件 | 职责 |
|---|---|---|
| 源码层 | `src/`、`iframe/` | 开发者编写的扩展逻辑与内嵌页面 |
| 配置层 | `extension.json`、`tsconfig.json`、`config/`、`eslint.config.mjs` | 扩展清单、编译/构建/规范配置 |
| 构建打包层 | `config/esbuild.*.ts`、`build/packaged.ts`、`.edaignore` | 编译 TS → IIFE，打包为 `.eext` |
| 资源/国际化层 | `locales/`、`images/` | 多语言文案、扩展图标 |

### 数据/执行流

```
开发阶段:
  src/index.ts  ──esbuild(IIFE)──▶  dist/index.js
                                              │
打包阶段:                                      ▼
  extension.json ──┐                  build/packaged.ts
  dist/index.js   ─┼─ 读取 .edaignore ── 过滤文件 ── JSZip 压缩 ──▶ build/dist/<name>_v<ver>.eext
  iframe/         ─┤
  locales/        ─┤
  images/         ─┘
                                              │
运行阶段:                                      ▼
  嘉立创EDA专业版  ◀──安装 .eext──  读取 extension.json ── 注入全局 eda ── 调用 activate() / 菜单回调
```

---

## 三、主要模块职责

### 3.1 源码入口模块 `src/index.ts`

扩展的默认入口（由 `extension.json` 的 `entry` 字段指向 `./dist/index`，即编译后的 `src/index.ts`）。
开发者在此通过 `export` 导出希望被宿主调用的函数（如生命周期钩子、菜单回调）。
导出的函数名与 `extension.json` 中 `headerMenus → menuItems → registerFn` 一一对应。

### 3.2 扩展清单 `extension.json`

宿主读取的扩展元数据，决定扩展的标识、入口、依赖、激活事件以及在不同编辑器页面（首页 `home` / 原理图 `sch` / PCB `pcb`）注册的头部菜单。
**打包前若 `uuid` 缺失/非法，`build/packaged.ts` 会自动补全一个合法 UUID 写回该文件。**

### 3.3 构建配置 `config/`

- `esbuild.common.ts`：导出一份 `satisfies` esbuild 配置对象，是构建的核心约定。
- `esbuild.prod.ts`：创建 esbuild context；带 `--watch` 参数进入监听模式，否则执行一次 `rebuild` 后退出。

### 3.4 打包工具 `build/packaged.ts`

编译完成后的打包脚本：校验/生成 UUID、依据 `.edaignore` 过滤项目文件、用 JSZip 生成 `.eext` 扩展包。

### 3.5 内嵌页面 `iframe/index.html`

扩展在宿主 UI 中嵌入 iframe 时的示例 HTML，供开发者按需替换。

### 3.6 国际化 `locales/`

- 根目录语言文件（`en.json`、`zh-Hans.json`）：扩展运行时通过 `eda.sys_I18n.text(...)` 引用的文案键值。
- `locales/extensionJson/`：用于翻译 `extension.json` 中菜单标题（如 `About...`）的独立翻译文件。

### 3.7 规范与 Git Hook

- `eslint.config.mjs` + `.vscode/settings.json`：统一为 antfu 规范（tab 缩进、单引号、分号）。
- `simple-git-hooks` 配置 `pre-commit` → `npx lint-staged`，提交前自动 `eslint --fix`。

---

## 四、关键类与函数说明

### 4.1 `src/index.ts`

#### `activate(status?, arg?): void`

- **作用**：扩展生命周期激活钩子。宿主在满足 `extension.json.activationEvents` 条件时调用。
- **参数**：
  - `status?: 'onStartupFinished'`：激活时机标识。
  - `arg?: string`：附加参数。
- **说明**：脚手架中为空实现，由开发者填充初始化逻辑。

#### `about(): void`

- **作用**：示例菜单回调，与 `extension.json` 中 `registerFn: "about"` 对应。
- **行为**：调用宿主 API 弹出信息对话框，显示 SDK 版本号。
- **依赖宿主 API**：
  - `eda.sys_Dialog.showInformationMessage(message, title)`：弹出信息提示框。
  - `eda.sys_I18n.text(key, ...args)`：获取国际化文案，支持 `${1}` 形式的占位符插值。

```ts
export function about(): void {
    eda.sys_Dialog.showInformationMessage(
        eda.sys_I18n.text('EasyEDA extension SDK v', undefined, undefined, extensionConfig.version),
        eda.sys_I18n.text('About'),
    );
}
```

> 注：`eda` 为宿主注入的全局对象，其完整 API 类型由 `@jlceda/pro-api-types` 提供。

### 4.2 `build/packaged.ts`

#### `multiLineStrToArray(str: string): string[]`

将多行字符串按 `\r\n` 换行符拆分为字符串数组，用于解析 `.edaignore` 的每一行。

#### `testUuid(uuid?: string): uuid is string`

判断 UUID 是否合法：必须匹配 `^[a-z0-9]{32}$`（32 位小写十六进制，无连字符），且不等于全 0。是一个类型谓词函数。

#### `fixUuid(uuid?: string): string`

返回合法 UUID：若入参合法则原样返回（去除首尾空白），否则用 `crypto.randomUUID()` 生成并去掉连字符，得到 32 位无连字符格式。

#### `main(): void`

打包主流程：

1. 若 `extensionConfig.uuid` 非法，调用 `fixUuid` 生成新 UUID 写回 `extension.json`（同时移除 JSON 模块的 `default` 属性）。
2. 递归读取项目根目录所有文件路径。
3. 读取并规整 `.edaignore`（去除行尾的 `/` 或 `\`）。
4. 用 `ignore` 实例过滤出未被忽略的文件，再分离出文件清单。
5. 用 `JSZip` 将每个文件加入压缩包。
6. 以 `DEFLATE` 最高压缩级别（level 9）通过 Node 流写入 `build/dist/<name>_v<version>.eext`。

### 4.3 `config/esbuild.common.ts`

导出默认配置对象，关键约束（**勿改，宿主依赖这些约定**）：

| 字段 | 值 | 含义 |
|---|---|---|
| `entryPoints` | `{ index: './src/index' }` | 入口 |
| `bundle` | `true` | 打包依赖 |
| `platform` | `'browser'` | 浏览器运行环境 |
| `format` | `'iife'` | 立即执行函数格式 |
| `globalName` | `'edaEsbuildExportName'` | 宿主识别的全局导出名 |
| `minify` | `false` | 不压缩（打包阶段另行压缩） |
| `treeShaking` | `true` | 移除未使用代码 |
| `outdir` | `'./dist/'` | 产物目录 |

### 4.4 `config/esbuild.prod.ts`

基于 `common` 创建 esbuild `context`：

- `--watch`：进入监听模式，文件变更自动重建。
- 否则：`rebuild()` 一次后 `process.exit()`。

---

## 五、`extension.json` 清单字段详解

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 扩展唯一标识（项目名） |
| `uuid` | string | 32 位无连字符 UUID，打包时自动补全 |
| `displayName` | string | 展示名 |
| `description` | string | 描述 |
| `version` | string | 语义化版本 |
| `publisher` | string | 发布者 |
| `engines.eda` | string | 兼容的 EDA 引擎版本（`^3.0.0`） |
| `license` | string | 许可证 |
| `repository` | object | 仓库类型与地址 |
| `categories` | string | 分类 |
| `keywords` | string[] | 关键字 |
| `images.logo` | string | 图标路径 |
| `activationEvents` | object | 激活事件配置 |
| `entry` | string | 编译产物入口（`./dist/index`） |
| `dependentExtensions` | object | 依赖的其它扩展 |
| `headerMenus` | object | 按页面（`home`/`sch`/`pcb`）注册头部菜单组及菜单项 |

`headerMenus` 结构示例：

```json
"headerMenus": {
  "sch": [
    {
      "id": "menuId",
      "title": "Ext Menu",
      "menuItems": [
        { "id": "About", "title": "About...", "registerFn": "about" }
      ]
    }
  ]
}
```

`registerFn` 的值必须与 `src/index.ts` 中 `export` 的函数名一致。

---

## 六、依赖关系

### 6.1 npm 依赖（全部为 devDependencies）

| 依赖 | 作用 |
|---|---|
| `@jlceda/pro-api-types` | 嘉立创EDA专业版扩展 API 的 TypeScript 类型定义（提供全局 `eda` 命名空间类型） |
| `esbuild` | 极快的 JS/TS 打包器，构建核心 |
| `typescript` / `ts-node` | TS 编译与直接执行 TS 脚本（运行构建/打包脚本） |
| `fs-extra` | 增强的文件系统操作（打包脚本使用） |
| `ignore` | 解析 `.edaignore` 过滤规则 |
| `jszip` | 生成 `.eext` ZIP 压缩包 |
| `rimraf` | 清理 `dist/` 目录 |
| `@antfu/eslint-config` / `eslint` | 代码规范 |
| `simple-git-hooks` / `lint-staged` | Git 提交前自动 lint |
| `@types/fs-extra` | fs-extra 类型 |

### 6.2 运行时依赖

- **宿主依赖**：嘉立创EDA专业版客户端（引擎版本 `^3.0.0`），运行时注入全局对象 `eda`。
- **Node 环境**：构建/打包要求 `node >= 20.17.0`。

### 6.3 模块间依赖图

```
src/index.ts ──import──▶ extension.json（读取版本号）
                          │
config/esbuild.prod.ts ──import──▶ config/esbuild.common.ts
                          │
build/packaged.ts ──import──▶ extension.json（读取 name/version/uuid）
                ──读取──▶ .edaignore（过滤规则）
                ──使用──▶ fs-extra / ignore / jszip
                          │
package.json scripts:
  compile  = rimraf dist + ts-node config/esbuild.prod.ts
  build    = compile + ts-node build/packaged.ts
  lint/fix = eslint
```

---

## 七、项目运行方式

### 7.1 环境准备

```shell
# 需要 Node.js >= 20.17.0
git clone --depth=1 https://github.com/easyeda/pro-api-sdk.git
cd pro-api-sdk
npm install
# 中国大陆网络可取消 .npmrc 中 registry 行注释以加速
```

### 7.2 个性化配置

1. 将文件夹重命名为你的项目名。
2. 修改 `extension.json` 中的 `name`、`displayName`、`description`、`publisher`。
3. 在 `src/index.ts` 编写扩展逻辑，按需在 `extension.json.headerMenus` 注册菜单并关联导出函数。

### 7.3 编译与打包

```shell
# 仅编译（esbuild 产出 dist/index.js）
npm run compile

# 编译 + 打包为 .eext（推荐）
npm run build
# 产物：build/dist/<name>_v<version>.eext

# 监听模式编译（开发调试）
npx ts-node ./config/esbuild.prod.ts --watch
```

### 7.4 代码规范

```shell
npm run lint   # 检查
npm run fix    # 自动修复
```

### 7.5 安装与运行扩展

将 `build/dist/` 下生成的 `.eext` 文件在嘉立创EDA专业版客户端中安装即可运行。宿主会：

1. 解压 `.eext`，读取 `extension.json`；
2. 根据 `entry` 加载 `dist/index.js`（IIFE，挂到全局名 `edaEsbuildExportName`）；
3. 注入全局 `eda` API；
4. 触发 `activate()`，并按菜单注册绑定回调。

---

## 八、关键约定与注意事项

1. **`config/esbuild.common.ts` 中带「用于内部方法调用，请勿修改」注释的字段**（`bundle`、`minify`、`platform`、`format`、`globalName`）是宿主加载扩展的硬性约定，修改会导致扩展无法被宿主识别。
2. **`extension.json` 禁止包含电子邮箱**：依据隐私政策（见 CHANGELOG 1.1.1），不得在 `extension.json`、`README.md`、`CHANGELOG.md`、`LICENSE` 中以邮箱作为联系方式。
3. **UUID 自动生成**：打包时若 `uuid` 非法会自动生成并写回 `extension.json`，避免每次手动维护。
4. **`.edaignore` 语法**：与 `.gitignore` 兼容，列出的路径不会进入 `.eext`（如源码、配置、`node_modules` 等开发文件均被排除）。
5. **i18n 占位符**：`eda.sys_I18n.text` 支持以 `${1}`、`${2}` 形式按位置插值（见 `locales/zh-Hans.json` 中 `"EasyEDA extension SDK v": "嘉立创EDA 扩展 SDK v${1}"`）。
6. **商标使用**：仅可将「嘉立创EDA」「EasyEDA」商标用于基于本工具开发的扩展的**功能描述**与**开源发布标题**。

---

## 九、版本演进摘要（CHANGELOG）

| 版本 | 要点 |
|---|---|
| 1.0.0 | 初始版本 |
| 1.1.0 | 新增头部菜单多语言翻译支持；新增 CHANGELOG；替换已弃用的 `SYS_Dialog.showInformationMessage` |
| 1.1.1 | 出于隐私政策禁止在配置/文档文件中添加邮箱联系方式 |
| 1.2.0 | 采用纯 ESLint 格式化；打包额外压缩以减小扩展包体积 |
| 1.3.2 | 当前版本 |

---

## 十、参考链接

- 官方开发文档：<https://prodocs.lceda.cn/cn/api/guide/>
- 开发指南（起步）：<https://prodocs.lceda.cn/cn/api/guide/how-to-start.html>
- 扩展 API 参考：<https://prodocs.lceda.cn/cn/api/reference/pro-api.html>
- AI 编程辅助 Skill：<https://github.com/easyeda/easyeda-api-skill>
- 仓库：<https://github.com/easyeda/pro-api-sdk> / <https://gitee.com/jlceda/pro-api-sdk>
- 类型包：<https://www.npmjs.com/package/@jlceda/pro-api-types>
