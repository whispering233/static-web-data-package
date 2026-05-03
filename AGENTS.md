# AGENTS.md

本文件为后续在本仓库中工作的编码代理提供约束和操作指南。

## 项目概览

这是 Static Web Data 的 pnpm monorepo。Static Web Data 是一个面向静态网站的 TypeScript 优先数据框架。

可发布包：

- `packages/core`：`@whispering233/static-web-data`
- `packages/dev`：`@whispering233/static-web-data-dev`
- `packages/react`：`@whispering233/static-web-data-react`

私有集成测试应用：

- `npm-test`：用于验证 packed tarball 的 Vite React 应用。该目录绝不能进入 npm 发布包。

## 架构规则

- schema 定义和 schema 所有权必须保留在代码中。字段 metadata 使用 Zod schema 的 `.meta(...)`。
- 除非用户明确要求，不要给 dev server 增加可视化 schema 编辑器。
- schema 和源数据的定义、校验、读写、导入、导出、upsert、delete 等数据管理能力必须收敛在 `packages/core`。
- `packages/core` 必须提供统一的数据管理 API 端口，用户只安装并 import `@whispering233/static-web-data` 时，也应能通过 core API 管理 schema 和源数据。
- 维护期代码可以通过 core 的统一 API 读写 JSON、CSV 和 SQLite 源存储。
- JSON、CSV 和 `better-sqlite3` SQLite 文件存储实现归属 `packages/core`。不要在 `packages/dev` 中重新定义一套数据管理 API 或重复实现同类 storage adapter。
- 浏览器运行时代码只能读取导出的静态 JSON 数据包。
- `better-sqlite3` 是 core 的维护期 Node.js 存储依赖；不要把 native SQLite 依赖引入 `packages/react`，也不要让浏览器运行时路径加载它。
- `packages/dev` 只负责外围开发体验，例如 CLI、config loading、dev server、HTTP API 编排和本地维护 UI。dev 必须复用 core 的数据管理 API。
- `packages/dev` 内嵌的 React 数据管理 UI 由 `swd dev` 托管在本地 dev server 根路径 `/`；不要把它拆成独立的运行期 React 包，也不要让它绕过 core storage API。
- UI 样式必须与 schema/storage 逻辑解耦。React 组件应放在 `packages/react`。
- `packages/core` 是依赖根。`packages/dev` 和 `packages/react` 可以依赖 core；core 不能依赖 dev 或 React。

## 工具链

必需运行环境：

- Node.js `>=20.19.0`
- pnpm `10.31.0`

安装依赖：

```sh
pnpm install
```

核心命令：

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm docs:api
pnpm docs:api:check
pnpm pack:dry
pnpm pack:smoke
pnpm run ci
```

在声明实现完成前，必须运行 `pnpm run ci`。

## 构建产物

不要手动编辑生成的 `dist` 文件。包的 build 脚本会清理并重新生成 `dist`。

如果需要从构建产物调试 CLI 行为：

```sh
pnpm build
node packages/dev/dist/cli.js --cwd npm-test --config swd.config.ts validate
node packages/dev/dist/cli.js --cwd npm-test --config swd.config.ts export
node packages/dev/dist/cli.js --cwd npm-test --config swd.config.ts dev --port 4321
```

`swd dev` 默认绑定 `127.0.0.1`，内嵌 React 管理页访问地址为 `http://127.0.0.1:<port>/`。

VS Code 调试说明位于 `docs/vscode-debugging.md`。

## 测试要求

- 修改 `packages/*/src` 中的行为时，应新增或更新 Vitest 测试。
- 修改 storage adapter 时，应覆盖 roundtrip 行为。
- 修改 runtime client 时，应按需覆盖 `list`、`getById`、`query`、缓存和 unknown collection 错误。
- 修改 export 逻辑时，应验证 manifest 结构和 collection JSON 输出。
- 修改 React 包时，应验证组件在没有消费方 CSS 的情况下也能渲染。
- 修改打包逻辑时，应运行 `pnpm build`、`pnpm pack:dry` 和 `pnpm pack:smoke`。
- 修改公共 API 表面时，应运行 `pnpm docs:api:check`。

## API 文档

API 文档使用 TypeDoc，配置文件是 `typedoc.json`。

命令：

```sh
pnpm docs:api
pnpm docs:api:check
```

生成文档会写入 `.api-docs`。该目录必须保持 ignored，不要提交 TypeDoc 生成的 HTML 输出。

GitHub Pages 部署由 `.github/workflows/api-docs.yml` 负责。仓库 Pages source 应设置为 GitHub Actions。

## 包发布约束

每个可发布包都使用 `files` 白名单。npm tarball 应仅包含包 metadata、README/LICENSE 和生成后的 `dist`。

不要发布：

- `npm-test`
- `.github`
- `scripts`
- 源码测试文件
- 本地生成的 smoke 目录，例如 `.pack` 和 `.tmp`

发布 workflow 是 `.github/workflows/publish.yml`，设计目标是 npm Trusted Publishing。除非用户明确要求，不要添加长期 npm token。

## Git 规则

- 不要还原用户改动，除非用户明确要求。
- 不要把无关重构放进功能提交。
- `.worktrees/` 是项目内隐藏 worktree 目录，必须保持 ignored。创建临时 worktree 时优先放在该目录下；清理时先用 `git worktree remove` 解除登记，再确认残留路径仍位于 `.worktrees/` 内后再递归删除。
- 提交前检查：

```sh
git status --short --branch
```

- 提交信息应聚焦，例如：
  - `feat: add storage adapter behavior`
  - `fix: correct runtime query pagination`
  - `docs: update package usage guide`

## 常见坑

- `pnpm ci` 不是脚本调用方式。应使用 `pnpm run ci`。
- 如果项目设置变化，直接运行 `tsc --build` 可能产生不需要的产物。使用现有的 `pnpm typecheck` 脚本。
- 如果缺失 `better-sqlite3` native binding，运行：

```sh
pnpm --filter @whispering233/static-web-data rebuild better-sqlite3
```

- 如果 package tarball 包含异常文件，先重新构建再检查：

```sh
pnpm build
pnpm pack:dry
```
