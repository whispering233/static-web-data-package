import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const packages = ["packages/core", "packages/dev", "packages/react"];
function runNpm(args, options) {
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/d", "/s", "/c", "npm", ...args], options);
  }
  return execFileSync("npm", args, options);
}

for (const packageDir of packages) {
  const cwd = resolve(packageDir);
  const manifest = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8"));
  const spec = `${manifest.name}@${manifest.version}`;
  try {
    runNpm(["view", spec, "version"], { cwd, stdio: "pipe" });
    console.log(`${spec} already exists; skipping`);
    continue;
  } catch {
    console.log(`Publishing ${spec}`);
  }
  runNpm(["publish", "--access", "public"], { cwd, stdio: "inherit" });
}
