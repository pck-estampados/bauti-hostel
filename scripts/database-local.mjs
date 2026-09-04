import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const cliVersion = "2.116.0";
export const project = "casa-albor-bootstrap";
export const container = `supabase_db_${project}`;
const excluded = "studio,postgres-meta,realtime,mailpit,edge-runtime,logflare,vector,supavisor,imgproxy";
const docker = process.platform === "win32"
  ? join(process.env.LOCALAPPDATA ?? "", "Programs/DockerDesktop/resources/bin/docker.exe")
  : "docker";

function run(program, args, options = {}) {
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Local command failed (${result.status}): ${redact(result.stderr || result.stdout)}`);
  return result.stdout.trim();
}

function redact(output) {
  return output.split(/\r?\n/).filter((line) =>
    !/sb_(secret|publishable)_|eyJ[a-zA-Z0-9_-]+|postgres(?:ql)?:\/\/|(?:secret|anon|service_role|publishable|access)\s*key|jwt\s*secret/i.test(line),
  ).join("\n");
}

export function validateLocalConfiguration(config, env, linked = false) {
  if (!config.includes(`project_id = "${project}"`) || /\[remotes|env\(|jduitbuzomkwmzzyrjux/.test(config)) {
    throw new Error("STOP: configuration is not the isolated local bootstrap configuration");
  }
  if (linked) throw new Error("STOP: linked workspace detected");
  if (Object.keys(env).some((key) => /^(DATABASE_URL|DB_URL|PGHOST|PGPORT|PGPASSWORD|PGSERVICE|PGSERVICEFILE|PGDATABASE|SUPABASE_DB.*|SUPABASE_PROJECT.*|DOCKER_HOST)$/i.test(key))) {
    throw new Error("STOP: database/remote Docker environment detected; use a clean local shell");
  }
}

export function guardLocal() {
  validateLocalConfiguration(readFileSync(join(root, "supabase/config.toml"), "utf8"), process.env,
    ["project-ref", "pooler-url"].some((name) => existsSync(join(root, "supabase/.temp", name))));
  const context = JSON.parse(run(docker, ["context", "inspect"]));
  const endpoint = context[0]?.Endpoints?.docker?.Host ?? "";
  if (!/^(npipe:\/\/|unix:\/\/)/.test(endpoint)) throw new Error("STOP: Docker must use a local socket");
  if (run(docker, ["info", "--format", "{{.OSType}}"]) !== "linux") throw new Error("DOCKER ENGINE NOT READY");
}

function cliCommand(args) {
  // Reuse an installed exact-version binary; npx is the reproducible fallback.
  if (process.platform === "win32") {
    const cache = join(process.env.LOCALAPPDATA ?? "", "npm-cache/_npx");
    if (existsSync(cache)) {
      for (const entry of readdirSync(cache)) {
        const modules = join(cache, entry, "node_modules");
        const manifest = join(modules, "supabase/package.json");
        const binary = join(modules, "@supabase/cli-windows-x64/bin/supabase.exe");
        if (existsSync(manifest) && existsSync(binary) && JSON.parse(readFileSync(manifest, "utf8")).version === cliVersion) {
          if (run(binary, ["--version"]) !== cliVersion) throw new Error("CLI version mismatch");
          return [binary, args];
        }
      }
    }
    // args originate only from the fixed commands below, never user input.
    return [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `npx.cmd --yes supabase@${cliVersion} ${args.join(" ")}`]];
  }
  return ["npx", ["--yes", `supabase@${cliVersion}`, ...args]];
}

export async function cli(args) {
  guardLocal();
  const [program, parameters] = cliCommand(args);
  const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" };
  delete env.SUPABASE_ACCESS_TOKEN;
  // Capture and redact CLI summaries: never print local development credentials.
  await new Promise((accept, reject) => {
    const child = spawn(program, parameters, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    child.on("error", reject);
    child.on("close", (code) => {
      console.log(redact(output));
      if (code === 0) accept(); else reject(new Error(`Local CLI exited ${code}`));
    });
  });
}

export function localPublicApi() {
  guardLocal();
  const [program, args] = cliCommand(["status", "--output", "json"]);
  const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" };
  delete env.SUPABASE_ACCESS_TOKEN;
  // Capture in memory only. Never log CLI status: it includes development keys.
  const output = run(program, args, { env });
  let status;
  try { status = JSON.parse(output); }
  catch { throw new Error("STOP: invalid local CLI status format (output withheld)"); }
  if (!/^http:\/\/(127\.0\.0\.1|localhost):55421$/.test(status.API_URL ?? "") || typeof status.ANON_KEY !== "string") {
    throw new Error("STOP: expected isolated local Auth endpoint and public client key");
  }
  return { url: status.API_URL, key: status.ANON_KEY };
}

export function sql(statement) {
  guardLocal();
  // Fixed container, Unix socket inside it, no URL/host/password accepted.
  return run(docker, ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], { input: statement });
}

export function sqlAsync(statement) {
  guardLocal();
  const child = spawn(docker, ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], { cwd: root });
  let stdout = ""; let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const done = new Promise((accept, reject) => {
    child.on("error", reject);
    child.on("close", (code) => accept({ code, stdout, stderr }));
  });
  child.stdin.end(statement);
  return done;
}

export async function reset() { await cli(["db", "reset", "--local", "--no-seed", "--yes"]); }

async function main() {
  const action = process.argv[2];
  if (process.argv.length !== 3 || !["start", "reset", "check", "test", "replay", "stop", "advisors", "readiness"].includes(action)) {
    throw new Error("Usage: node scripts/database-local.mjs start|reset|check|test|replay|stop|advisors|readiness (no remote options accepted)");
  }
  guardLocal();
  if (["start", "replay"].includes(action)) await cli(["start", "--exclude", excluded]);
  if (["reset", "replay"].includes(action)) await reset();
  if (["check", "reset", "replay"].includes(action)) console.log(sql(readFileSync(join(root, "tests/database/bootstrap-schema.sql"), "utf8")));
  if (["test", "replay"].includes(action)) {
    const { testDatabase } = await import("../tests/database/critical-tests.mjs");
    await testDatabase();
    console.log(sql(readFileSync(join(root, "tests/database/acl-readiness.sql"), "utf8")));
  }
  if (action === "advisors") await cli(["db", "advisors", "--local", "--type", "all", "--fail-on", "error", "--output", "json"]);
  if (action === "readiness") {
    console.log(sql(readFileSync(join(root, "tests/database/bootstrap-schema.sql"), "utf8")));
    console.log(sql(readFileSync(join(root, "tests/database/acl-readiness.sql"), "utf8")));
  }
  if (action === "stop") await cli(["stop"]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(redact(error.message)); process.exitCode = 1; });
}
