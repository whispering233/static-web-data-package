import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "..");
const packDir = resolve(repoRoot, ".pack");
const smokeDir = resolve(repoRoot, ".tmp", "npm-test-pack-smoke");
const packages = ["packages/core", "packages/dev", "packages/react"];
function runNpm(args, options) {
  const nextOptions = { ...options, env: sanitizeNpmEnv(options.env) };
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], nextOptions);
  }
  return execFileSync("npm", args, nextOptions);
}

function sanitizeNpmEnv(extraEnv = process.env) {
  const env = { ...process.env, ...extraEnv };
  const noisyKeys = new Set([
    "npm_config_link_workspace_packages",
    "npm_config_prefer_workspace_packages",
    "npm_config_npm_globalconfig",
    "npm_config_verify_deps_before_run",
    "npm_config__jsr_registry"
  ]);
  for (const key of Object.keys(env)) {
    if (noisyKeys.has(key.toLowerCase())) {
      delete env[key];
    }
  }
  return env;
}

await rm(packDir, { recursive: true, force: true });
await rm(smokeDir, { recursive: true, force: true });
await mkdir(packDir, { recursive: true });

const tarballs = packages.map((packageDir) => {
  const cwd = resolve(repoRoot, packageDir);
  const output = runNpm(["pack", "--pack-destination", packDir, "--json"], {
    cwd,
    encoding: "utf8"
  });
  const [result] = JSON.parse(output);
  return {
    name: result.name,
    path: resolve(packDir, result.filename)
  };
});

await cp(resolve(repoRoot, "npm-test"), smokeDir, {
  recursive: true,
  filter: (source) => !source.includes("node_modules") && !source.endsWith("dist")
});

const packageJsonPath = resolve(smokeDir, "package.json");
const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"));
for (const tarball of tarballs) {
  manifest.dependencies[tarball.name] = `file:${tarball.path.replaceAll("\\", "/")}`;
}
await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

runNpm(["install", "--ignore-scripts", "--audit=false", "--fund=false", "--loglevel=error"], {
  cwd: smokeDir,
  stdio: "inherit"
});
runNpm(["run", "build"], { cwd: smokeDir, stdio: "inherit" });

console.log("npm-test tarball smoke build passed");
