import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { root, sql } from "../../scripts/database-local.mjs";

// Optional built-app integration. Credentials/cookies are ephemeral in memory.
export async function verifyStaffApp(url, key, credential) {
  assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):55421$/);
  const listener = createServer(); listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; listener.close(); await once(listener, "close");
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root, stdio: "ignore", env: { ...process.env, APP_MODE: "production", NEXT_PUBLIC_SITE_URL: base,
      NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
      SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", NEXT_TELEMETRY_DISABLED: "1" },
  });
  const jar = new Map();
  const auth = createServerClient(url, key, { auth: { autoRefreshToken: false }, cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)),
  } });
  const headers = () => ({ cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") });
  const request = (path, authenticated = true, options = {}) => fetch(base + path, {
    redirect: "manual", ...options, headers: { ...(authenticated ? headers() : {}), ...options.headers },
  });
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try { ready = (await request("/acceso-interno", false)).status === 200; } catch { /* starting */ }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "local built app ready");
    for (const route of ["/admin", "/admin/configuracion", "/admin/limpieza"]) {
      const response = await request(route, false);
      assert.ok([303,307,308].includes(response.status), "anonymous staff route redirects");
      assert.ok(response.headers.get("location")?.includes("/acceso-interno"), "redirect to staff access");
    }
    assert.equal((await request("/api/admin/configuration", false)).status, 401);
    const login = await auth.auth.signInWithPassword(credential);
    assert.equal(login.error === null, true, "owner Auth cookie login");
    for (const route of ["/admin", "/admin/configuracion", "/admin/limpieza", "/admin/configuracion"]) {
      const response = await request(route);
      assert.equal(response.status, 200, "owner page and reload");
      assert.equal((await response.text()).includes("TEST-PROFILE"), true, "SSR receives owner session");
    }
    const configResponse = await request("/api/admin/configuration");
    assert.equal(configResponse.status, 200, "configuration API owner");
    const { state } = await configResponse.json();
    assert.equal(state.settings.schedules.value.checkInFrom, "15:00");
    assert.equal(state.settings.schedules.value.checkOutUntil, "11:00");
    const save = await request("/api/admin/configuration", true, { method: "POST", headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ operation: "updateGeneral", payload: state.settings.general.value }) });
    assert.equal(save.status, 200, "owner may save canonical settings through session RLS");
    const invalid = await request("/api/admin/configuration", true, { method: "POST", headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({ operation: "updateSchedules", payload: { ...state.settings.schedules.value, courtesyRequiresApproval: false } }) });
    assert.equal(invalid.status, 400, "invalid automatic courtesy rejected by server");
    const publicResponse = await request("/politicas", false);
    assert.equal(publicResponse.status, 200);
    const html = await publicResponse.text();
    assert.ok(html.includes("15:00") && html.includes("11:00") && html.includes("12:00") && html.includes("No es automática"));
    assert.ok(!/60\.000|priceRange|TEST-DOCUMENT|PRIVATE-ROOM/.test(html), "no legacy tariff or private fields public");
    // A real JWT must pick up current DB roles/status, not stale token metadata.
    const user = "10000000-0000-4000-8000-000000000001";
    const setRole = (code) => {
      assert.ok(["owner", "housekeeping", "bar"].includes(code));
      sql(`delete from public.user_roles where user_id='${user}';
        insert into public.user_roles(user_id,role_id) select '${user}',id from public.roles where code='${code}';`);
    };
    setRole("housekeeping");
    assert.equal((await request("/api/admin/configuration")).status, 403, "cleaning configuration denied");
    const cleaning = await request("/admin/limpieza");
    assert.equal(cleaning.status, 200);
    assert.ok(!/TEST-DOCUMENT|TEST-FIRST|TEST-SENSITIVE-NOTE|TEST-HOUSEKEEPING/.test(await cleaning.text()), "cleaning SSR contains no unnecessary guest or private note data");
    setRole("bar");
    assert.equal((await request("/api/admin/configuration")).status, 403, "Bar configuration denied");
    assert.equal((await request("/api/admin/operations")).status, 403, "Bar operations denied");
    assert.ok((await (await request("/admin")).text()).includes("Rol preparado"), "Bar dormant UI");
    setRole("owner");
    for (const status of ["pending", "disabled"]) {
      sql(`update public.profiles set status='${status}' where id='${user}';`);
      assert.ok([303,307,308].includes((await request("/admin")).status), "inactive profile redirects despite real JWT");
      assert.equal((await request("/api/admin/configuration")).status, 401);
    }
    sql(`update public.profiles set status='active' where id='${user}'; delete from public.user_roles where user_id='${user}';`);
    assert.ok([303,307,308].includes((await request("/admin")).status), "roleless profile redirects despite real JWT");
    setRole("owner");
    const logout = await request("/auth/signout", true, { method: "POST", headers: { origin: base } });
    assert.ok([303,307].includes(logout.status), "signout route redirect");
    jar.clear();
    assert.ok([303,307,308].includes((await request("/admin")).status), "panel protected after logout");
    console.log("PASS: T1 built Next.js LOCAL owner cookies, SSR/reload, configuration read/write/validation, cleaning/Bar isolation, pending/disabled/roleless rejection, public contract, logout and anonymous protection");
  } finally {
    jar.clear(); await auth.auth.signOut(); child.kill();
    if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
