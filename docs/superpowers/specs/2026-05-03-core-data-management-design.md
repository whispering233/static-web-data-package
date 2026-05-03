# Core Data Management Architecture Design

状态：已确认

## 背景

当前仓库中，`packages/core` 已经拥有 schema helper、schema 描述、数据校验、静态 JSON bundle 导出和浏览器只读 runtime client，但维护期源数据读写能力仍然由 `packages/dev/src/storage/*` 实现。这样会导致两个问题：

- 用户只安装 `@whispering233/static-web-data` 时，不能通过 core API 管理源数据。
- `packages/dev` 不只是开发体验增强层，还拥有了一套数据管理 API 和 storage adapter 实现，破坏了 core 作为依赖根和数据管理边界的定位。

新的仓库约束要求 schema 和源数据的定义、校验、读写、导入、导出、upsert、delete 等数据管理能力收敛在 `packages/core`。`packages/dev` 和 `packages/react` 只作为外围功能增强服务组件。

## 目标

- `packages/core` 提供统一的 Node 维护期数据管理 API。
- 用户只安装并 import `@whispering233/static-web-data` 时，也能通过 core 的子路径 API 管理 schema 和源数据。
- JSON、CSV 和 `better-sqlite3` SQLite 文件存储实现归属 `packages/core`。
- `packages/dev` 改为 CLI、config loading、Hono server、本地 React 管理前端和 HTTP API 编排层。
- `packages/react` 保持面向最终静态网站的 runtime React hooks/components，不包含维护端数据管理 UI。
- 浏览器运行时代码只能读取导出的静态 JSON 数据包，不能加载 `node:fs`、CSV parser、SQLite 或 `better-sqlite3`。

## 非目标

- 不增加可视化 schema 编辑器。schema 所有权仍然在用户代码中。
- 不让最终静态站点直接连接 JSON/CSV/SQLite 源存储。
- 不把 dev 的本地管理 UI 放入 `packages/react`。
- 不引入长期 npm token 或改变发布 workflow。

## 包边界

### `@whispering233/static-web-data`

根入口保持 browser-safe，只导出浏览器运行期能力：

- `createStaticDataClient`
- manifest、query、runtime reader 相关类型

根入口不得 import 或 re-export `@whispering233/static-web-data/storage` 中的任何 Node-only 代码。

### `@whispering233/static-web-data/schema`

继续负责代码优先 schema 定义与描述：

- `defineCollection`
- `defineDataPackage`
- `describeCollection`
- `describeDataPackage`
- `validateCollectionRecords`
- schema metadata 继续使用 Zod `.meta(...)`

### `@whispering233/static-web-data/export`

保留静态 JSON bundle 写入能力：

- `writeStaticBundle`
- `createSchemaHash`

该入口可以继续服务现有调用方，也可以被新的 storage repository 内部复用。

### `@whispering233/static-web-data/storage`

新增 Node-only 维护期入口，拥有统一数据管理 API 和文件存储实现：

- JSON adapter
- CSV adapter
- SQLite adapter based on `better-sqlite3`
- collection 级 storage adapter factory
- package 级 data repository
- package 级 validate/export service

该入口可以使用 `node:fs`、`node:path`、`csv-parse`、`csv-stringify` 和 `better-sqlite3`。它不得被 `packages/react` 或最终静态网站 runtime import。

## Core 数据管理 API

公开 collection 级 adapter：

```ts
export type StorageAdapter<TRecord extends Record<string, unknown> = Record<string, unknown>> = {
  readAll(): Promise<TRecord[]>;
  writeAll(records: unknown[]): Promise<TRecord[]>;
  upsert(record: unknown): Promise<TRecord>;
  delete(id: string | number): Promise<void>;
};
```

公开 storage factory：

```ts
export function createStorageAdapter(
  collectionName: string,
  collection: CollectionDefinition,
  options?: { cwd?: string }
): StorageAdapter;
```

公开 package 级 repository：

```ts
export type ValidationSummary = {
  collections: Record<string, number>;
};

export type DataRepository = {
  collection(name: string): StorageAdapter;
  listCollections(): CollectionDescriptor[];
  validate(): Promise<ValidationSummary>;
  exportStaticBundle(options?: { generatedAt?: Date }): Promise<StaticBundleSummary>;
};

export function createDataRepository(
  dataPackage: DataPackageDefinition,
  options?: { cwd?: string }
): DataRepository;
```

用户脚本示例：

```ts
import config from "../swd.config";
import { createDataRepository } from "@whispering233/static-web-data/storage";

const data = createDataRepository(config, { cwd: process.cwd() });

await data.collection("posts").upsert({
  id: "welcome",
  title: "Welcome",
  published: true
});

await data.exportStaticBundle();
```

## Storage 实现

`packages/dev/src/storage/*` 中现有 adapter 行为迁移到 `packages/core/src/storage/*`：

```text
packages/core/src/storage/
  types.ts
  utils.ts
  json.ts
  csv.ts
  sqlite.ts
  repository.ts
  index.ts
```

行为要求：

- JSON 文件为空或不存在时读取为空数组。
- JSON 文件必须是数组，否则抛出明确错误。
- CSV 使用 schema field 顺序写入 header。
- CSV complex cell 使用 JSON 字符串序列化，读取时恢复 object/array/boolean/number。
- SQLite 根据 schema descriptor 推断列类型，支持 string、number、boolean、json。
- SQLite 表默认使用 collection name，也支持 `storage.table`。
- 所有 adapter 在写入前都通过 `validateCollectionRecords` 校验。
- upsert 使用 primary key 替换或追加记录。
- delete 使用 primary key 删除记录。
- unknown storage type 抛出明确错误。

`better-sqlite3` 放在 core 的 `optionalDependencies`。SQLite adapter 只在 `@whispering233/static-web-data/storage` 子路径中使用，并在实际创建 SQLite adapter 时加载 native 模块。如果 native binding 不存在，错误信息应明确提示用户重建 core 包的 `better-sqlite3`。

## Dev 本地 React 管理服务

`packages/dev` 应从字符串 HTML 页面升级为内嵌本地 React 数据管理服务。推荐结构：

```text
packages/dev/src/
  cli.ts
  config.ts
  commands.ts
  server.ts
  index.ts
  client/
    App.tsx
    api.ts
    main.tsx
    styles.css
    components/
      CollectionSidebar.tsx
      RecordTable.tsx
      RecordEditor.tsx
      ImportPanel.tsx
      StatusBar.tsx
```

构建输出：

```text
packages/dev/dist/
  cli.js
  index.js
  client/
    index.html
    assets/
```

`swd dev` 运行链路：

```text
swd dev
  -> loadProjectConfig(cwd/swd.config.ts)
  -> createDataRepository(config, { cwd })
  -> Hono server 暴露 /api/*
  -> Hono server 托管 dist/client React SPA
  -> React SPA 调用 /api/*
  -> /api/* 调用 core/storage 读写源数据
```

本地 React 管理前端第一版功能：

- collection 列表，显示 collection name、primary key、storage type。
- record table，按 schema field 顺序显示字段。
- JSON record editor，用于 create/update/upsert。
- delete、refresh、validate、export static bundle。
- import JSON records，支持 replace 和 upsert。
- 展示 Zod validation error 和 storage error。

管理前端约束：

- 不提供 schema 编辑器。
- 不直接 import `@whispering233/static-web-data/storage`。
- 只通过 `/api/*` 调用 server。
- 样式放在 `packages/dev/src/client` 内部，不依赖消费方 CSS。
- UI 风格是工作台式数据管理界面，不做营销式 landing page。

## Dev Server API

`packages/dev/src/server.ts` 保留 HTTP API 编排，但所有数据操作都委托给 core repository：

```text
GET    /api/collections
GET    /api/collections/:name/records
POST   /api/collections/:name/records
DELETE /api/collections/:name/records/:id
POST   /api/collections/:name/import
GET    /api/collections/:name/export
GET    /api/validate
POST   /api/export
```

`server.ts` 不再通过 `createMaintenanceHtml()` 拼接完整管理页。它负责托管构建后的 React SPA：

```text
GET /         -> dist/client/index.html
GET /assets/* -> dist/client/assets/*
```

## 依赖与构建

`packages/core/package.json`：

- `exports` 增加 `"./storage"`。
- `build` 增加 `src/storage/index.ts` entry。
- `dependencies` 增加 `csv-parse`、`csv-stringify`。
- `optionalDependencies` 增加 `better-sqlite3`。
- `devDependencies` 增加 `@types/better-sqlite3`。

`packages/dev/package.json`：

- 移除 `better-sqlite3`、`csv-parse`、`csv-stringify` 和 `@types/better-sqlite3`。
- 增加 React 管理前端构建依赖，例如 `@vitejs/plugin-react`，如果当前 Vite 配置需要它。
- build 脚本同时构建 server/CLI 和 client assets。

`tsconfig.base.json`：

- `paths` 增加 `@whispering233/static-web-data/storage` -> `packages/core/src/storage/index.ts`。

`typedoc.json`：

- entryPoints 增加 `packages/core/src/storage/index.ts`。

## 兼容策略

因为包仍在 `0.1.x`，本次架构修正可以直接移除 `@whispering233/static-web-data-dev` 对 `createStorageAdapter` 和 `StorageAdapter` 的自有导出。用户应迁移到：

```ts
import { createStorageAdapter, createDataRepository } from "@whispering233/static-web-data/storage";
```

`packages/dev` 中的 `validateProjectData` 和 `exportStaticData` 可以保留作为 CLI/server 便利封装，但内部必须调用 core repository。它们不应重新实现数据管理逻辑。

## 测试策略

Core storage 测试：

- JSON roundtrip：`writeAll`、`upsert`、`delete`、`readAll`。
- CSV roundtrip：complex cell JSON encode/decode。
- SQLite roundtrip：table creation、writeAll、upsert、readAll。
- repository unknown collection error。
- repository validate summary。
- repository export reads source records and writes manifest/collection JSON。

Dev 测试：

- commands validate/export 继续通过。
- server CRUD API 继续通过，并验证实际调用 core repository 的行为。
- server `/` 返回 React SPA HTML。
- build 后 client assets 可被 server 返回。

Client 测试：

- API wrapper 生成正确请求。
- collection sidebar、record table、editor 基础状态可渲染。
- 没有消费方 CSS 时，管理 UI 仍可正常显示。

最终验证命令：

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm docs:api:check
pnpm pack:dry
pnpm pack:smoke
pnpm run ci
```

在声明实现完成前，必须运行 `pnpm run ci`。

## 风险与处理

- 浏览器 bundle 误加载 native dependency：通过根入口保持 browser-safe、storage 使用独立 Node-only 子路径、React 包禁止 import storage 来控制。
- `better-sqlite3` 安装失败：作为 optional dependency，并在 SQLite adapter 实际使用时给出明确错误。
- dev client 构建产物进入 npm 包失败：保持 npm `files` 白名单只发布 `dist`，并让 dev build 明确生成 `dist/client`。
- storage 逻辑重复：删除 dev 自有 adapter，并让 dev commands/server 全部调用 core repository。
- schema 编辑职责漂移：dev client 只展示 schema descriptor 和 field metadata，不提供 schema 编辑器。
