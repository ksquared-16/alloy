/**
 * Startup bind regression — listen must not wait on disk GC / board compose.
 *
 * Run: node --test scripts/local-dev/tests/vacilando-startup-bind.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-startup-"));

const { startVacilandoServer, getStartupTimings } = await import("../lib/vacilando-server.mjs");
const { diskSignalAsync } = await import("../lib/vacilando/disk-hygiene.mjs");
const {
  recordControlPlaneEvent,
  getControlPlaneHealth,
  noteBindTiming,
  markScreenshotStalled,
  recoverOwnedVacilandoProcess,
  claimControlPlaneOwnership,
} = await import("../lib/vacilando/control-plane-health.mjs");

test("HTTP listen completes without waiting for diskSignal / compose", async () => {
  const t0 = Date.now();
  let close = null;
  try {
    const started = await startVacilandoServer(0);
    close = started.close;
    const listenWall = Date.now() - t0;
    // Before the fix, createVacilandoServer blocked ~30s on sync GC dry-run.
    assert.ok(listenWall < 5000, `listen took ${listenWall}ms — expected <5s`);
    assert.ok((started.startupTimings.create_ms ?? 99999) < 3000, `create_ms=${started.startupTimings.create_ms}`);
    assert.ok(started.port > 0, `expected ephemeral port, got ${started.port}`);

    const health = await (await fetch(`http://127.0.0.1:${started.port}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.accepting, true);
    assert.ok("hydrated" in health);
    assert.ok(health.startup);

    // Health must answer while hydrate may still be false
    const tHealth = Date.now();
    const h2 = await fetch(`http://127.0.0.1:${started.port}/api/health`);
    assert.equal(h2.status, 200);
    assert.ok(Date.now() - tHealth < 1000);
  } finally {
    try { close?.(); } catch { /* */ }
  }
});

test("diskSignalAsync does not block the event loop for the caller tick", async () => {
  let ticks = 0;
  const iv = setInterval(() => { ticks += 1; }, 20);
  const p = diskSignalAsync();
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(ticks >= 2, `event loop starved during diskSignalAsync (ticks=${ticks})`);
  clearInterval(iv);
  // Do not await full GC dry-run (≤30s) — prove event-loop liveness only.
  await Promise.race([p, new Promise((r) => setTimeout(r, 200))]);
});

test("control-plane health records slow bind / screenshot / recovery refusal", async () => {
  recordControlPlaneEvent({ status: "starting", detail: "test" });
  const slow = noteBindTiming({ startedAtMs: Date.now() - 12_000, listenAtMs: Date.now(), missionId: "msn_test_cp" });
  assert.equal(slow.status, "slow_to_bind");

  const stalled = markScreenshotStalled({ missionId: "msn_test_cp", detail: "screenshot timeout" });
  assert.equal(stalled.status, "screenshot_stalled");

  // Clear any owner left by prior listen test in this ALLOY_RUNTIME_ROOT
  const { unlinkSync, existsSync } = await import("node:fs");
  const ownerPath = join(process.env.ALLOY_RUNTIME_ROOT, "vacilando", "control-plane-owner.json");
  if (existsSync(ownerPath)) unlinkSync(ownerPath);

  const bad = await recoverOwnedVacilandoProcess({ port: 39999 });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "no_owned_process");

  claimControlPlaneOwnership({ pid: process.pid, port: 39998, worktree: process.cwd() });
  const mismatch = await recoverOwnedVacilandoProcess({ port: 39999 });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "port_mismatch");

  const health = getControlPlaneHealth();
  assert.ok(health.events?.length >= 2);
});
