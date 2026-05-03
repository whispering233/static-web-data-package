# Static Web Data

面向静态网站的 TypeScript 优先数据包框架。

这个仓库是一个 pnpm workspace，用于让开发者用代码定义数据 schema，通过本地维护端管理源数据，并为浏览器运行时导出只读静态 JSON 数据包。

## 包结构

| 包名 | 用途 |
| --- | --- |
| `@whispering233/static-web-data` | 核心 schema helper、校验 helper、静态数据包导出器、只读运行时 client。 |
| `@whispering233/static-web-data-dev` | 本地 CLI、维护端 dev server、JSON/CSV/SQLite 存储适配器。 |
| `@whispering233/static-web-data-react` | 可选 React hooks、基础组件和 CSS 模板样式。 |

仓库还包含 `npm-test`，这是一个私有 Vite React 测试应用，用于验证打包后的 npm tarball。它不会被包含进任何发布包。

## 设计说明

Static Web Data 将数据生命周期分为两个阶段：

- 维护期：开发者通过本地 JSON、CSV 或 SQLite 源存储编辑数据。dev 包会用代码定义的 Zod schema 校验记录，也可以启动本地维护端。
- 运行期：静态网站只读取导出的 JSON 文件。浏览器运行时不会直接读取 CSV 或 SQLite。

schema 的所有权保留在代码中。dev server 不编辑 schema，只读取 Zod schema metadata 来描述字段并校验记录。

## 环境要求

- Node.js `>=20.19.0`
- pnpm `10.31.0`

安装依赖：

```sh
pnpm install
```

## Schema 示例

在静态站点项目中创建 `swd.config.ts`：

```ts
import { defineCollection, defineDataPackage } from "@whispering233/static-web-data/schema";
import { z } from "zod";

export default defineDataPackage({
  output: "public/static-web-data",
  collections: {
    posts: defineCollection({
      primaryKey: "id",
      storage: { type: "json", path: "data/posts.json" },
      schema: z.object({
        id: z.string().meta({ title: "ID", editor: "text" }),
        title: z.string().min(1).meta({ title: "Title", editor: "text" }),
        published: z.boolean().default(false).meta({ title: "Published", editor: "checkbox" })
      })
    })
  }
});
```

支持的源数据存储：

```ts
{ type: "json", path: "data/posts.json" }
{ type: "csv", path: "data/posts.csv" }
{ type: "sqlite", path: "data/site.sqlite", table: "posts" }
```

## 维护端 CLI

如果在本仓库中直接运行，需要先构建包：

```sh
pnpm build
```

校验内置测试项目：

```sh
node packages/dev/dist/cli.js validate --cwd npm-test --config swd.config.ts
```

导出运行时 JSON：

```sh
node packages/dev/dist/cli.js export --cwd npm-test --config swd.config.ts
```

启动维护端 dev server：

```sh
node packages/dev/dist/cli.js dev --cwd npm-test --config swd.config.ts --port 4321
```

在安装了 dev 包的消费项目中，可以直接使用包提供的 binary：

```sh
swd validate
swd export
swd dev
```

## 运行时 Client

导出后，静态资源会写入配置中的 `output` 目录：

```text
public/static-web-data/
  manifest.json
  collections/
    posts.json
```

在浏览器中读取记录：

```ts
import { createStaticDataClient } from "@whispering233/static-web-data";

const client = createStaticDataClient({ baseUrl: "/static-web-data" });
const posts = client.collection<{ id: string; title: string; published: boolean }>("posts");

const allPosts = await posts.list();
const onePost = await posts.getById("welcome");
const publishedPosts = await posts.query({
  where: { published: true },
  sort: [{ field: "title", direction: "asc" }],
  page: 1,
  pageSize: 10
});
```

## React 模板

React 包是可选的，只提供展示层 helper。schema 和数据管理逻辑不依赖 React。

```tsx
import {
  CollectionTable,
  StaticDataProvider,
  useCollectionQuery
} from "@whispering233/static-web-data-react";
import "@whispering233/static-web-data-react/styles.css";
import { createStaticDataClient } from "@whispering233/static-web-data";

const client = createStaticDataClient({ baseUrl: "/static-web-data" });

function Posts() {
  const { data, loading, error } = useCollectionQuery("posts");

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error.message}</p>;

  return <CollectionTable records={data?.items ?? []} columns={["id", "title", "published"]} />;
}

export function App() {
  return (
    <StaticDataProvider client={client}>
      <Posts />
    </StaticDataProvider>
  );
}
```

## 开发命令

常用命令：

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

各命令用途：

- `pnpm typecheck`：对可发布包执行 TypeScript 类型检查。
- `pnpm test`：运行 core、dev、React 包的 Vitest 单元测试。
- `pnpm build`：构建可发布包的 `dist` 目录。
- `pnpm docs:api`：用 TypeDoc 生成 API 文档到 `.api-docs`。
- `pnpm docs:api:check`：检查 API 文档能否生成，但不写入输出文件。
- `pnpm pack:dry`：检查 npm tarball 内容，确保排除 `npm-test`、`.github`、scripts 和源码测试文件。
- `pnpm pack:smoke`：打包三个包，把 tarball 安装到临时复制的 `npm-test` 项目，并构建该应用。
- `pnpm run ci`：运行完整本地 CI 链路。

VS Code 调试说明见 [docs/vscode-debugging.md](https://github.com/whispering233/static-web-data-package/blob/main/docs/vscode-debugging.md)。

## 发布

本仓库配置为通过 GitHub Actions Trusted Publishing 发布到 npm。

工作流：

- CI：`.github/workflows/ci.yml`
- 发布：`.github/workflows/publish.yml`

发布前，需要在 npmjs.com 上为每个包配置 Trusted Publishing：

- `@whispering233/static-web-data`
- `@whispering233/static-web-data-dev`
- `@whispering233/static-web-data-react`

Publisher 选择 GitHub Actions，workflow filename 填 `publish.yml`。

仓库推送到 GitHub 后，可以通过 `v*` tag 或发布 GitHub Release 触发发布。

## API 文档

API 文档使用 TypeDoc 生成：

```sh
pnpm docs:api
```

生成的静态站点会写入 `.api-docs`，该目录已被 Git 忽略。GitHub Pages 部署由 `.github/workflows/api-docs.yml` 负责。

启用 GitHub Pages：

1. 打开 GitHub 仓库设置。
2. 进入 `Pages`。
3. 在 `Build and deployment` 中，将 `Source` 设置为 `GitHub Actions`。
4. 推送到 `main`，或手动运行 `API Docs` workflow。

默认 GitHub Pages 地址：

```text
https://whispering233.github.io/static-web-data-package/
```

## 仓库结构

```text
packages/
  core/    # schema helpers、runtime client、static export
  dev/     # CLI、dev server、storage adapters
  react/   # 可选 React hooks/components/styles
npm-test/  # 私有 packed-package 测试应用
scripts/   # 打包和发布辅助脚本
docs/      # 开发和调试文档
```

## 许可证

MIT
