# VS Code 端到端调试说明

本文档说明如何在 VS Code 中调试当前 monorepo 的核心包、维护端 CLI/dev server、React 模板、测试项目和打包 smoke 流程。

## 1. 准备环境

在仓库根目录执行：

```sh
pnpm install
pnpm build
```

`Swd CLI:*` 和 `Swd Dev Server:*` 调试配置运行的是 `packages/dev/dist/cli.js`，因此必须先执行 `pnpm build`。构建会生成 sourcemap，VS Code 可以把断点映射回 `packages/*/src` 下的 TypeScript 源码。

提交前的完整验证命令：

```sh
pnpm run ci
```

## 2. 调试 CLI 数据流

适用配置：

- `Swd CLI: validate npm-test`
- `Swd CLI: export npm-test`

推荐断点位置：

- `packages/dev/src/cli.ts`：命令参数解析和入口。
- `packages/dev/src/config.ts`：加载 `npm-test/swd.config.ts`。
- `packages/dev/src/commands.ts`：validate/export 主流程。
- `packages/dev/src/storage/json.ts`：读取 `npm-test/data/posts.json`。
- `packages/core/src/schema.ts`：Zod schema 校验和主键检查。
- `packages/core/src/export.ts`：生成 `manifest.json` 和 collection JSON。

调试步骤：

1. 执行 `pnpm build`。
2. 在上述源码文件中设置断点。
3. 打开 VS Code `Run and Debug` 面板。
4. 选择 `Swd CLI: validate npm-test` 或 `Swd CLI: export npm-test`。
5. 点击启动调试。

`export` 配置会更新：

- `npm-test/public/static-web-data/manifest.json`
- `npm-test/public/static-web-data/collections/posts.json`

## 3. 调试本地维护端 dev server

适用配置：

- `Swd Dev Server: npm-test`

调试步骤：

1. 执行 `pnpm build`。
2. 在 `packages/dev/src/server.ts`、`packages/dev/src/storage/*` 或 `packages/core/src/schema.ts` 设置断点。
3. 启动 `Swd Dev Server: npm-test`。
4. VS Code 会在 server ready 后打开 `http://localhost:4321`。
5. 在页面中执行 collection 刷新、保存记录、validate 或 export，观察断点。

如果 `4321` 被占用，修改 `.vscode/launch.json` 中该配置的 `--port` 参数。

## 4. 调试 Vitest 单测

适用配置：

- `Vitest: current test file`

调试步骤：

1. 打开一个测试文件，例如 `packages/dev/src/storage.test.ts`。
2. 在测试或被测源码中设置断点。
3. 选择 `Vitest: current test file` 并启动调试。

该配置只运行当前打开的测试文件，适合定位 JSON/CSV/SQLite adapter、runtime client 或 React SSR 组件测试。

常用断点组合：

- `packages/core/src/runtime.test.ts` + `packages/core/src/index.ts`
- `packages/core/src/schema.test.ts` + `packages/core/src/schema.ts`
- `packages/dev/src/storage.test.ts` + `packages/dev/src/storage/*.ts`
- `packages/react/src/react.test.tsx` + `packages/react/src/index.tsx`

## 5. 调试 npm-test React 应用

适用配置：

- `npm-test: Vite dev server`

调试步骤：

1. 在 `npm-test/src/App.tsx`、`packages/react/src/index.tsx` 或 `packages/core/src/index.ts` 设置断点。
2. 启动 `npm-test: Vite dev server`。
3. VS Code 会在 Vite ready 后用 Chrome 调试打开 `http://127.0.0.1:5173`。
4. 刷新页面或修改查询参数后观察断点。

该配置用于验证用户运行时链路：

```text
npm-test React UI
  -> @whispering233/static-web-data-react
  -> @whispering233/static-web-data runtime client
  -> npm-test/public/static-web-data/manifest.json
  -> npm-test/public/static-web-data/collections/posts.json
```

如果 Chrome 调试无法打开，可以先用该配置启动 Vite，再手动打开 `http://127.0.0.1:5173`，并使用浏览器 DevTools 调试前端代码。

## 6. 调试打包 smoke 流程

适用配置：

- `Script: pack smoke`

推荐断点位置：

- `scripts/pack-smoke.mjs`
- `scripts/check-packages.mjs`

调试目标：

- 验证三个发布包可以被 `npm pack` 打包。
- 验证 packed tarball 能安装进临时复制的 `npm-test` 项目。
- 验证 packed tarball 安装后的 `npm-test` 可以执行 `npm run build`。

也可以直接在终端运行：

```sh
pnpm pack:dry
pnpm pack:smoke
```

## 7. 常见问题

断点没有命中：

1. 先执行 `pnpm build`。
2. 确认断点打在 `packages/*/src` 或 `scripts/*.mjs` 中。
3. 确认当前启动的是 `.vscode/launch.json` 中的调试配置，而不是普通终端命令。

`better-sqlite3` native binding 缺失：

```sh
pnpm --filter @whispering233/static-web-data-dev rebuild better-sqlite3
```

dev server 或 Vite 端口冲突：

- 维护端修改 `Swd Dev Server: npm-test` 的 `--port 4321`。
- React 测试应用修改 `npm-test: Vite dev server` 的 `--port 5173`。

调试发布内容是否误包含 `/npm-test`：

```sh
pnpm build
pnpm pack:dry
```

`pack:dry` 会检查发布 tarball 不包含 `npm-test`、`.github`、`scripts`、源码测试文件等不应发布的内容。
