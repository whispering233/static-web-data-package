import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, "..");
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
const forbiddenPatterns = [
  /(^|\/)src\//,
  /(^|\/).*\.test\.[cm]?[tj]sx?$/,
  /(^|\/)npm-test\//,
  /(^|\/)\.github\//,
  /(^|\/)scripts\//
];

for (const packageDir of packages) {
  const cwd = resolve(repoRoot, packageDir);
  const output = runNpm(["pack", "--dry-run", "--json"], {
    cwd,
    encoding: "utf8"
  });
  const [result] = JSON.parse(output);
  const files = result.files.map((file) => file.path);
  const forbidden = files.filter((file) => forbiddenPatterns.some((pattern) => pattern.test(file)));
  if (forbidden.length > 0) {
    throw new Error(`${packageDir} would publish forbidden files: ${forbidden.join(", ")}`);
  }
  console.log(`${result.name}@${result.version}: ${files.length} files verified`);
}
