import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateLocalConfiguration, root } from "../scripts/database-local.mjs";

const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
test("local bootstrap guard accepts only the isolated config and clean environment", () => {
  assert.doesNotThrow(() => validateLocalConfiguration(config, {}));
});
test("local bootstrap guard rejects a linked workspace", () => {
  assert.throws(() => validateLocalConfiguration(config, {}, true), /linked workspace/);
});
test("local bootstrap guard rejects remotes and environment interpolation", () => {
  assert.throws(() => validateLocalConfiguration(`${config}\n[remotes.staging]`, {}), /isolated local/);
  assert.throws(() => validateLocalConfiguration(`${config}\nsecret = "env(TEST)"`, {}), /isolated local/);
  assert.throws(() => validateLocalConfiguration(config.replace("casa-albor-bootstrap", "another-project"), {}), /isolated local/);
});
test("local bootstrap guard rejects all external DB selectors without echoing values", () => {
  for (const key of ["DATABASE_URL", "DB_URL", "PGHOST", "PGPORT", "PGPASSWORD", "PGSERVICE", "PGSERVICEFILE", "PGDATABASE", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF", "DOCKER_HOST"]) {
    assert.throws(() => validateLocalConfiguration(config, { [key]: "NEVER-ECHO-THIS" }), (error) => {
      assert.match(error.message, /STOP/);
      assert.doesNotMatch(error.message, /NEVER-ECHO-THIS/);
      return true;
    });
  }
});
test("local CLI wrapper rejects extra/remote commands before running Docker or Supabase", () => {
  for (const args of [["reset", "--linked"], ["reset", "--db-url", "unused"], ["push"], ["link"], ["repair"], ["reset", "--project-ref", "unused"]]) {
    const result = spawnSync(process.execPath, ["scripts/database-local.mjs", ...args], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no remote options accepted/);
  }
});
