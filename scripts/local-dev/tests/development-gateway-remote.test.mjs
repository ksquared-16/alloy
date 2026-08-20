#!/usr/bin/env node
/**
 * Gateway V2 Slice 5 — remote auth, ownership, bind, PWA, legacy surface.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TOKEN = "vac_slice5_test_token_not_for_logs";
process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-gw5-"));
process.env.VACILANDO_GATEWAY_REMOTE = "1";
process.env.VACILANDO_REQUIRE_API_AUTH = "1";
process.env.VACILANDO_API_TOKEN = TOKEN;
process.env.VACILANDO_ALLOW_MOCK_PROVIDER = "1";
process.env.VACILANDO_EXECUTION_PROVIDER = "mock";

const {
  apiAuthRequired,
  assertPrivateBindHost,
  authorizeRequest,
  gatewayRemoteMode,
  isPublicApiPath,
  requestWantsSecureCookie,
  sessionCookieHeader,
  tokenFromHeaders,
  tokenFingerprint,
} = await import("../lib/vacilando/vacilando-api-auth.mjs");
const {
  acquireControlPlaneOwnership,
  releaseControlPlaneOwnership,
  pidAlive,
  readControlPlaneOwner,
  controlPlaneRuntimeRoot,
} = await import("../lib/vacilando/control-plane-health.mjs");
const { startVacilandoServer } = await import("../lib/vacilando-server.mjs");
const { handleV2Get } = await import("../lib/vacilando/v2-api.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

await test("remote/auth-required configuration", () => {
  assert.equal(gatewayRemoteMode(), true);
  assert.equal(apiAuthRequired(), true);
  process.env.VACILANDO_REQUIRE_API_AUTH = "0";
  assert.equal(apiAuthRequired(), true, "remote mode cannot disable auth");
  process.env.VACILANDO_REQUIRE_API_AUTH = "1";
  assert.equal(isPublicApiPath("/api/health", "GET"), true);
  assert.equal(isPublicApiPath("/api/lanes", "GET"), false);
  assert.equal(isPublicApiPath("/api/commands", "POST"), false);
});

await test("no public-interface fallback", () => {
  assert.equal(assertPrivateBindHost("0.0.0.0").ok, false);
  assert.equal(assertPrivateBindHost("0.0.0.0").error, "public_bind_forbidden");
  assert.equal(assertPrivateBindHost("::").ok, false);
  assert.equal(assertPrivateBindHost("100.64.0.1").ok, true);
  assert.equal(assertPrivateBindHost("8.8.8.8").ok, false);
  assert.equal(assertPrivateBindHost("127.0.0.1").ok, true);
});

await test("query-string token is ignored", () => {
  const headers = {};
  assert.equal(tokenFromHeaders(headers), null);
  const q = new URL("http://127.0.0.1/api/lanes?token=" + TOKEN);
  assert.equal(q.searchParams.get("token"), TOKEN);
  assert.equal(tokenFromHeaders({}), null);
});

const bearer = { authorization: `Bearer ${TOKEN}` };

let close = null;
let port = 0;
const started = await startVacilandoServer(0);
close = started.close;
port = started.port;
const base = `http://127.0.0.1:${port}`;

await test("unauthenticated Gateway API request refused", async () => {
  const r = await fetch(`${base}/api/lanes`);
  assert.equal(r.status, 401);
  const j = await r.json();
  assert.equal(j.error, "unauthorized");
});

await test("query token does not authenticate", async () => {
  const r = await fetch(`${base}/api/lanes?token=${TOKEN}`);
  assert.equal(r.status, 401);
});

await test("authenticated lane list works", async () => {
  const r = await fetch(`${base}/api/lanes`, { headers: bearer });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(Array.isArray(j.lanes));
});

await test("authenticated lane output works", async () => {
  const r = await fetch(`${base}/api/lanes/alloy-identity/output`, { headers: bearer });
  assert.ok([200, 404, 503].includes(r.status));
  const j = await r.json();
  assert.equal("ok" in j, true);
  assert.equal(j.error === "tmux_target_not_allowed", false);
});

await test("authenticated send works through the same existing capability", async () => {
  const r = await fetch(`${base}/api/lanes/alloy-missing-lane/instruction`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ instruction: "auth-only probe — this lane must not exist" }),
  });
  assert.notEqual(r.status, 401);
  const j = await r.json();
  assert.notEqual(j.error, "unauthorized");
  assert.ok(["lane_not_found", "invalid_lane_id"].includes(j.error));
});

await test("arbitrary tmux target still refused remotely", async () => {
  const r = await fetch(`${base}/api/lanes/alloy-identity/instruction`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ instruction: "no", target: "%1", session: "alloy-identity" }),
  });
  const j = await r.json();
  assert.equal(j.error, "unexpected_control_field");
});

await test("non-lane pane still inaccessible", async () => {
  const r = await fetch(`${base}/api/lanes/alloy-test/output`, { headers: bearer });
  const j = await r.json();
  assert.notEqual(j.ok, true);
  assert.ok(["invalid_lane_id", "lane_not_found"].includes(j.error));
});

await test("unauthenticated push registration is refused", async () => {
  const r = await fetch(`${base}/api/gateway/push/config`);
  assert.equal(r.status, 401);
  const sub = await fetch(`${base}/api/gateway/push/subscription`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: "https://push.example/x", keys: { p256dh: "p", auth: "s" } }),
  });
  assert.equal(sub.status, 401);
  const health = await fetch(`${base}/api/gateway/push/health`);
  assert.equal(health.status, 401);
  const testPush = await fetch(`${base}/api/gateway/push/test`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(testPush.status, 401);
});

await test("authenticated push config and subscription persist", async () => {
  const cfg = await fetch(`${base}/api/gateway/push/config`, { headers: bearer });
  assert.equal(cfg.status, 200);
  const j = await cfg.json();
  assert.equal(j.ok, true);
  assert.ok(j.vapid_public_key);
  const sub = await fetch(`${base}/api/gateway/push/subscription`, {
    method: "POST",
    headers: { ...bearer, "content-type": "application/json" },
    body: JSON.stringify({ endpoint: "https://push.example/auth", keys: { p256dh: "p", auth: "s" } }),
  });
  assert.equal(sub.status, 200);
  const saved = await sub.json();
  assert.equal(saved.ok, true);
});

await test("legacy sensitive routes do not become unprotected remote surfaces", async () => {
  for (const path of ["/api/commands", "/api/state", "/api/audit", "/api/events", "/api/v2/missions"]) {
    const r = await fetch(`${base}${path}`);
    assert.equal(r.status, 401, path);
  }
  const exec = await fetch(`${base}/api/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: "lane.list", confirm: true }),
  });
  assert.equal(exec.status, 401);
});

await test("HTTP session cookies are not Secure", () => {
  assert.equal(requestWantsSecureCookie({}), false);
  assert.equal(requestWantsSecureCookie({ "x-forwarded-proto": "http" }), false);
  assert.equal(requestWantsSecureCookie({ "x-forwarded-proto": "https" }), true);
  assert.equal(requestWantsSecureCookie({}, { encrypted: true }), true);
  process.env.VACILANDO_COOKIE_SECURE = "1";
  assert.equal(requestWantsSecureCookie({}), false, "env must not force Secure on HTTP");
  delete process.env.VACILANDO_COOKIE_SECURE;
  const httpCookie = sessionCookieHeader(TOKEN, { secure: false });
  assert.match(httpCookie, /HttpOnly/i);
  assert.match(httpCookie, /SameSite=Lax/i);
  assert.equal(/(?:^|;)\s*Secure(?:;|$)/i.test(httpCookie), false);
  const httpsCookie = sessionCookieHeader(TOKEN, { secure: true });
  assert.match(httpsCookie, /(?:^|;)\s*Secure(?:;|$)/i);
});

await test("session cookie login does not echo the token", async () => {
  const r = await fetch(`${base}/api/gateway/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: TOKEN }),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal("token" in j, false);
  assert.equal(j.tokenFingerprint, tokenFingerprint(TOKEN));
  const setCookie = r.headers.get("set-cookie") || "";
  assert.match(setCookie, /vacilando_gw=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.equal(/(?:^|;)\s*Secure(?:;|$)/i.test(setCookie), false, "HTTP Set-Cookie must not include Secure");
  const cookie = setCookie.split(";")[0];
  const lanes = await fetch(`${base}/api/lanes`, { headers: { cookie } });
  assert.equal(lanes.status, 200);
});

await test("listed lane_id resolves on the detail path", async () => {
  const listed = await fetch(`${base}/api/lanes`, { headers: bearer });
  assert.equal(listed.status, 200);
  const body = await listed.json();
  const row = (body.lanes || []).find((l) => l.lane_id === "alloy-identity") || (body.lanes || [])[0];
  assert.ok(row, "list must return a Development Lane");
  const detail = await fetch(`${base}/api/lanes/${encodeURIComponent(row.lane_id)}`, { headers: bearer });
  assert.equal(detail.status, 200);
  const j = await detail.json();
  assert.equal(j.ok, true);
  assert.equal(j.lane.lane_id, row.lane_id);
  assert.equal(j.lane.slot, row.slot);
  const missing = await fetch(`${base}/api/lanes/alloy-missing-lane`, { headers: bearer });
  assert.equal(missing.status, 404);
  const unauth = await fetch(`${base}/api/lanes/${encodeURIComponent(row.lane_id)}`);
  assert.equal(unauth.status, 401);
});

await test("v2 session does not return the raw token", async () => {
  const session = await handleV2Get("/api/v2/session", new URL("http://127.0.0.1/api/v2/session"), { headers: bearer });
  assert.equal("token" in session.body, false);
});

await test("control-plane ownership conflict refused", () => {
  const sleeper = spawn("sleep", ["30"], { stdio: "ignore" });
  try {
    assert.equal(pidAlive(sleeper.pid), true);
    writeFileSync(
      join(controlPlaneRuntimeRoot(), "vacilando", "control-plane-owner.json"),
      JSON.stringify({ schema_version: "vacilando.control_plane_owner.v1", pid: sleeper.pid, port: 39991 }),
    );
    const clash = acquireControlPlaneOwnership({ pid: process.pid, port: 39992 });
    assert.equal(clash.ok, false);
    assert.equal(clash.error, "control_plane_owned");
  } finally {
    try { sleeper.kill(); } catch { /* */ }
  }
});

await test("isolated runtime roots do not conflict", async () => {
  const rootA = mkdtempSync(join(os.tmpdir(), "vac-own-a-"));
  const rootB = mkdtempSync(join(os.tmpdir(), "vac-own-b-"));
  const health = join(ROOT, "lib/vacilando/control-plane-health.mjs");
  const run = (root) => new Promise((res, rej) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      process.env.ALLOY_RUNTIME_ROOT = ${JSON.stringify(root)};
      const { acquireControlPlaneOwnership } = await import(${JSON.stringify(pathToFileURL(health).href)});
      const r = acquireControlPlaneOwnership({ pid: process.pid, port: 39993 });
      process.stdout.write(JSON.stringify({ ok: r.ok, root: ${JSON.stringify(root)} }));
    `], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("exit", (code) => code === 0 ? res(JSON.parse(out)) : rej(new Error(out || String(code))));
  });
  const [a, b] = await Promise.all([run(rootA), run(rootB)]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(existsSync(join(rootA, "vacilando", "control-plane-owner.json")), true);
  assert.equal(existsSync(join(rootB, "vacilando", "control-plane-owner.json")), true);
});

await test("stale owner is replaced", () => {
  writeFileSync(
    join(controlPlaneRuntimeRoot(), "vacilando", "control-plane-owner.json"),
    JSON.stringify({ schema_version: "vacilando.control_plane_owner.v1", pid: 999999, port: 1 }),
  );
  const got = acquireControlPlaneOwnership({ pid: process.pid, port });
  assert.equal(got.ok, true);
  assert.equal(got.replaced_stale, true);
});

await test("manifest valid", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "apps/vacilando/public/manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/#/lanes");
  assert.ok(manifest.icons?.length >= 2);
  assert.equal(manifest.short_name, "Vacilando");
  assert.ok(existsSync(join(ROOT, "apps/vacilando/public/apple-touch-icon.png")));
});

await test("health stays public and does not leak the token", async () => {
  const r = await fetch(`${base}/api/health`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.auth_required, true);
  assert.equal(JSON.stringify(j).includes(TOKEN), false);
});

try { close?.(); } catch { /* */ }
releaseControlPlaneOwnership();

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
