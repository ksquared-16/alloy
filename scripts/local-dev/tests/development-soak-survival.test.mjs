#!/usr/bin/env node
/**
 * A 24-HOUR OBSERVER MUST OUTLIVE THE RUN THAT LAUNCHED IT.
 *
 * MEASURED. `soak-authoritative-388789f8bd8c` was granted the host claim at
 * 12:21:25.876Z, sampled for three minutes, and died 25 seconds after its
 * launching run reached COMPLETE at 12:24:01.734Z. It had been started as a
 * child of that run's session, so the teardown delivered SIGHUP — and SIGHUP was
 * handled as a deliberate stop. The handler released `gateway_host_mutation` and
 * exited 0. Cleanly, silently, exit code zero, which is why nothing looked
 * broken until someone looked for the process.
 *
 * The claim model was never the defect. The commit that introduced the
 * protection is titled "protection that outlives its requester" and delivers
 * exactly that — the CLAIM outlives the run. What it never gave the claim was a
 * PROCESS that outlives it.
 *
 * These controls test PROCESS SURVIVAL, which is the half that was never proven.
 * They spawn real processes and send real signals, because the previous launch
 * passed every argument correctly and still died: the thing that mattered was
 * not an argument.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-soak-survival-"));
mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });
const SCRIPT = new URL("../vacilando-host-soak.mjs", import.meta.url).pathname;

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
const sleep = (ms) => execFileSync("sleep", [String(ms / 1000)]);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const lines = (p) => { try { return readFileSync(p, "utf8").split("\n").filter(Boolean).length; } catch { return 0; } };
const ppidOf = (pid) => Number(spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim());

function launch(extra = [], out = join(ROOT, `s-${Math.random().toString(36).slice(2)}.jsonl`)) {
  const r = spawnSync(process.execPath, [SCRIPT, "--run", "--detach", "--interval", "1", "--hours", "1", "--out", out, ...extra], {
    encoding: "utf8", env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT },
  });
  const info = JSON.parse(r.stdout);
  return { pid: info.pid, out };
}
const stop = (pid) => { try { process.kill(pid, "SIGKILL"); } catch { /* */ } };

// ── A: the launcher exits and the soak does not ──────────────────────────────
test("A. the soak outlives its launcher and leaves its process group", () => {
  const { pid, out } = launch();
  try {
    sleep(2500);
    assert.equal(alive(pid), true, "the soak is still running after its launcher exited");
    assert.equal(ppidOf(pid), 1,
      "reparented to init — it is NOT in the launching run's process group, which is what killed the last one");
    assert.ok(lines(out) >= 1, "and it is sampling");
  } finally { stop(pid); }
});

// ── B: the exact signal that killed the previous soak ────────────────────────
test("B. SIGHUP does not stop it, and sampling continues across it", () => {
  const { pid, out } = launch();
  try {
    sleep(2500);
    const before = lines(out);
    process.kill(pid, "SIGHUP");
    sleep(2500);
    assert.equal(alive(pid), true, "SIGHUP means 'my launcher went away', which is the normal case here");
    assert.ok(lines(out) > before, `and it keeps sampling: ${before} -> ${lines(out)}`);
  } finally { stop(pid); }
});

// ── C/D: deliberate stops keep their meaning ─────────────────────────────────
for (const sig of ["SIGTERM", "SIGINT"]) {
  test(`${sig === "SIGTERM" ? "C" : "D"}. ${sig} still stops it and frees the host`, async () => {
    const { pid } = launch(["--own-resource", "--owner-run", "erun_survival0000", "--owner-lane", "lane_survival01"]);
    try {
      sleep(2500);
      assert.equal(alive(pid), true, "it started");
      process.kill(pid, sig);
      sleep(2000);
      assert.equal(alive(pid), false, `${sig} is a deliberate stop and must be honoured`);
    } finally { stop(pid); }
  });
}

// ── E–H: the claim semantics that must NOT have changed ──────────────────────
test("E. a deliberate stop releases gateway_host_mutation", async () => {
  const M = await import("../lib/vacilando/gateway-host-mutation.mjs");
  const { pid } = launch(["--own-resource", "--owner-run", "erun_survival0001", "--owner-lane", "lane_survival01"]);
  try {
    sleep(2500);
    assert.ok(M.gatewayHostMutationHolder(ROOT), "the running soak holds the host");
    process.kill(pid, "SIGTERM");
    sleep(2000);
    assert.equal(M.gatewayHostMutationHolder(ROOT), null, "and a clean stop hands it back");
  } finally { stop(pid); }
});

test("F. a killed soak's claim is reclaimed by the next canonical reader", async () => {
  const M = await import("../lib/vacilando/gateway-host-mutation.mjs");
  const { pid } = launch(["--own-resource", "--owner-run", "erun_survival0002", "--owner-lane", "lane_survival01"]);
  sleep(2500);
  assert.ok(M.gatewayHostMutationHolder(ROOT), "held");
  process.kill(pid, "SIGKILL");                       // no chance to release
  sleep(1500);
  const after = M.assertGatewayHostMutationAllowed({ runId: "erun_someoneelse00", root: ROOT });
  assert.equal(after.ok, true, "a claim whose process is gone must not fence the host forever");
});

test("G. PID reuse cannot revive a dead claim — start identity decides", async () => {
  const M = await import("../lib/vacilando/gateway-host-mutation.mjs");
  const src = readFileSync(new URL("../lib/vacilando/gateway-host-mutation.mjs", import.meta.url), "utf8");
  assert.match(src, /started_at/, "the claim records the owner's start identity, not only its number");
  // A live pid whose start identity does not match the claim is a stranger that
  // inherited the number, never the original owner.
  const res = M.acquireGatewayHostMutation({
    runId: "erun_survival0003", laneId: "lane_survival01", reason: "pid reuse control", origin: "agent",
    processOwner: { pid: process.pid, started_at: "Wed Jan  1 00:00:00 2020", kind: "host_soak" },
    root: ROOT,
  });
  assert.equal(res.ok && res.granted, true, "claim staged");
  const check = M.assertGatewayHostMutationAllowed({ runId: "erun_other0000001", root: ROOT });
  assert.equal(check.ok, true, "a claim whose start identity cannot be matched is stale, not live");
});

test("H. no second lock or store was introduced", () => {
  const soak = readFileSync(SCRIPT, "utf8");
  assert.match(soak, /gateway-host-mutation\.mjs/, "it uses the existing resource owner");
  assert.ok(!/lockfile|\.lock\b|flock|mkdirSync\([^)]*lock/i.test(soak), "and adds no lock of its own");
  const claimSites = (soak.match(/acquireGatewayHostMutation\(/g) || []).length;
  assert.equal(claimSites, 1, "exactly one place acquires the host claim");
  // The detach must be the script's own, not a second launcher script.
  assert.match(soak, /detached: true/);
  assert.match(soak, /child\.unref\(\)/);
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
