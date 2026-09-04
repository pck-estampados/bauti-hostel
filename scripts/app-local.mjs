import { spawn } from "node:child_process";
import { localPublicApi, root } from "./database-local.mjs";

// Fixed commands; launcher passes local keys via env, never dotenv files or args.
// Next embeds the public client key in its ignored build artifacts as expected.
const action = process.argv[2];
if (process.argv.length !== 3 || !["dev", "build", "test", "start"].includes(action)) {
  throw new Error("Usage: node scripts/app-local.mjs dev|build|test|start");
}
const { url, key } = localPublicApi();
const env = { ...process.env, APP_MODE: "production", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_ACCESS_TOKEN: "",
  NEXT_PUBLIC_BASE_PRICE_ARS: "", NEXT_TELEMETRY_DISABLED: "1" };
const child = process.platform === "win32"
  ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npm.cmd run ${action}`], { cwd: root, env, stdio: "inherit" })
  : spawn("npm", ["run", action], { cwd: root, env, stdio: "inherit" });
child.on("error", () => { console.error("Local application command could not start."); process.exitCode = 1; });
child.on("close", (code) => { process.exitCode = code ?? 1; });
