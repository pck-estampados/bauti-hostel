import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const allowedCommands = new Set(["dev", "build", "start"]);
const command = process.argv[2];

if (!command || !allowedCommands.has(command)) {
  console.error("Uso: node scripts/run-vinext.mjs <dev|build|start>");
  process.exit(1);
}

const vinextCli = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);

const child = spawn(process.execPath, [vinextCli, command, ...process.argv.slice(3)], {
  env: {
    ...process.env,
    WRANGLER_LOG_PATH:
      process.env.WRANGLER_LOG_PATH ?? ".wrangler/wrangler.log",
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
