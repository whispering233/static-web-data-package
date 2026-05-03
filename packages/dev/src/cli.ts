#!/usr/bin/env node
import { Command } from "commander";
import { exportStaticData, validateProjectData } from "./commands.js";
import { loadProjectConfig } from "./config.js";
import { startDevServer } from "./server.js";

const program = new Command();

program
  .name("swd")
  .description("Maintain and export static website data packages.")
  .option("--cwd <dir>", "Project working directory", process.cwd())
  .option("-c, --config <file>", "Path to swd config file");

program.command("validate").description("Validate all source data against code-defined schemas.").action(async () => {
  await runWithConfig(async (config, cwd) => {
    const summary = await validateProjectData(config, cwd);
    console.log(JSON.stringify(summary, null, 2));
  });
});

program.command("export").description("Export read-only runtime JSON data bundle.").action(async () => {
  await runWithConfig(async (config, cwd) => {
    const summary = await exportStaticData(config, cwd);
    console.log(JSON.stringify(summary, null, 2));
  });
});

program
  .command("dev")
  .description("Start the local data maintenance server.")
  .option("-p, --port <port>", "Port", "4321")
  .action(async (commandOptions: { port: string }) => {
    await runWithConfig(async (config, cwd) => {
      const port = Number(commandOptions.port);
      await startDevServer({ config, cwd, port });
      console.log(`Static Web Data dev server running at http://localhost:${port}`);
    });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function runWithConfig(callback: (config: Awaited<ReturnType<typeof loadProjectConfig>>, cwd: string) => Promise<void>) {
  const options = program.opts<{ cwd: string; config?: string }>();
  const loadOptions = options.config ? { cwd: options.cwd, configPath: options.config } : { cwd: options.cwd };
  const config = await loadProjectConfig(loadOptions);
  await callback(config, options.cwd);
}
