#!/usr/bin/env node
/**
 * REGISTERED IS NOT RUNNABLE.
 *
 * THE DEFECT. wt3-communications-inbound-sms held slot 3 and port 3013 as a
 * fully registered, server-capable worktree and could not start a server at all:
 * its web/ has no node_modules, so `next dev` died with `sh: next: command not
 * found` into a log nobody was reading. The 3->4->5 capacity staircase counted
 * it as one of the host's server slots and only found out by trying — so the
 * host has four server-capable worktrees, not six, independent of any ceiling.
 * A seventeen-hour `s.end("ok")` stub had been left listening on that same port,
 * which is what a fake server is FOR: it makes an unrunnable slot look ready.
 *
 * ROOT CAUSE, and it is the same shape as the lane-provisioning defect: a
 * worktree can be registered two ways and only one of them provisions
 * dependencies. alloy-sprint-start installs them; alloy-worktree-adopt is
 * deliberately a "registers reality" tool that creates nothing — no Git state,
 * no server, and no node_modules. Every worktree that entered the fleet by
 * adoption (the Mac mini migration batch, and every lane created through the
 * Vacilando wizard) was registered as server-capable while being unable to start.
 *
 * The required end state is not "always install". It is that a lane designated
 * server-capable either starts its real Next server or says dependencies_missing
 * out loud. These assert the second half, because the first half is easy to
 * fake and the second half is what was missing.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-readiness-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const L = await import("../lib/vacilando/lane-worktree-lifecycle.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** A dev-status table, in the shape alloy-dev-status prints it. */
function statusTable(rows) {
  const head = "NAME AGENT BRANCH PORT STATE PID PATH READY\n----\n";
  return head + rows.map((r) => r.join("  ")).join("\n") + "\n";
}
function census(stdout, status = 0) {
  return L.devServerCensus({ toolkitDir: "/nonexistent", spawn: () => ({ status, stdout }) });
}

test("a worktree without dependencies is NOT counted as a server slot", () => {
  const out = census(statusTable([
    ["wt1", "claude", "agent/a", "3011", "running", "111", "/w/wt1", "ready"],
    ["wt3", "claude", "agent/b", "3013", "stopped", "-", "/w/wt3", "dependencies_missing"],
    ["financials", "claude", "agent/f", "3012", "stopped", "-", "/w/fin", "dependencies_missing"],
  ]));
  assert.equal(out.ok, true);
  assert.equal(out.server_capable, 1, "one runnable slot, not three registered ones");
  assert.deepEqual(out.not_server_capable, [
    { worktree: "wt3", reason: "dependencies_missing" },
    { worktree: "financials", reason: "dependencies_missing" },
  ]);
});

test("the reason travels — 'no' without 'why' is what sent the experiment wrong", () => {
  const out = census(statusTable([
    ["a", "claude", "agent/a", "3011", "stopped", "-", "/w/a", "dependencies_missing"],
    ["b", "claude", "agent/b", "3012", "stopped", "-", "/w/b", "dev_binary_missing"],
    ["c", "claude", "agent/c", "3013", "stopped", "-", "/w/c", "no_worktree"],
    ["d", "claude", "agent/d", "3014", "stopped", "-", "/w/d", "no_manifest"],
  ]));
  assert.deepEqual(out.not_server_capable.map((x) => x.reason),
    ["dependencies_missing", "dev_binary_missing", "no_worktree", "no_manifest"]);
  assert.equal(out.server_capable, 0);
});

test("a running server is still counted for capacity, capability aside", () => {
  // Capability and occupancy are different questions. A running server occupies
  // a capacity slot no matter what the census thinks of its dependencies.
  const out = census(statusTable([
    ["a", "claude", "agent/a", "3011", "running", "111", "/w/a", "ready"],
    ["b", "claude", "agent/b", "3012", "running", "222", "/w/b", "ready"],
    ["c", "claude", "agent/c", "3013", "stopped", "-", "/w/c", "dependencies_missing"],
  ]));
  assert.equal(out.running, 2);
  assert.equal(out.server_capable, 2);
});

test("an older toolkit prints no READY column, and capability is UNKNOWN not true", () => {
  // Failing open here would restore the exact bug: a slot assumed runnable
  // because nothing said otherwise.
  const out = census(statusTable([
    ["a", "claude", "agent/a", "3011", "running", "111", "/w/a"],
  ]));
  assert.equal(out.ok, true);
  assert.equal(out.servers[0].server_capable, null, "unknown, never assumed capable");
  assert.equal(out.servers[0].readiness, null);
  assert.equal(out.server_capable, 0, "an unknown slot is not a certified server slot");
  assert.deepEqual(out.not_server_capable, [], "and it is not reported as a known failure either");
});

test("an unavailable census reports failure rather than an empty healthy fleet", () => {
  const out = census("", 1);
  assert.equal(out.ok, false);
  assert.equal(out.error, "dev_status_unavailable");
});

test("alloy-dev-start refuses BEFORE launching anything", () => {
  // The old failure wrote a pid file, let the capacity guard count a running
  // server, and left the truth in a log. The preflight has to come before the
  // launch or none of that changes.
  const src = readFileSync(new URL("../alloy-dev-start", import.meta.url), "utf8");
  const preflight = src.indexOf("alloy_server_readiness_for_path");
  const launch = src.indexOf("nohup");
  assert.ok(preflight > 0, "alloy-dev-start must preflight readiness");
  assert.ok(launch > 0);
  assert.ok(preflight < launch, "the check must precede the launch");
  assert.match(src, /alloy_server_readiness_remedy/, "and must say how to fix it");
});

test("the readiness classifier has ONE owner", () => {
  // The dev-server state classifier was duplicated between alloy-dev-status and
  // agent.sh once already, and the copies disagreed about a seventeen-hour stub.
  const common = readFileSync(new URL("../lib/common.sh", import.meta.url), "utf8");
  assert.match(common, /alloy_server_readiness_for_path\(\)/, "defined in the shared library");
  for (const f of ["../alloy-dev-status", "../alloy-dev-start"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(!/alloy_server_readiness_for_path\(\)\s*\{/.test(src), `${f} must not redefine it`);
    assert.match(src, /alloy_server_readiness_for_path/, `${f} must call it`);
  }
});

test("no stub may stand in for dependency readiness", () => {
  // A liveness stub on the port is exactly how slot 3 looked ready for a day.
  // Readiness is a property of the worktree, so a listener cannot supply it.
  const common = readFileSync(new URL("../lib/common.sh", import.meta.url), "utf8");
  const fn = common.slice(common.indexOf("alloy_server_readiness_for_path() {"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  assert.ok(!/PORT|listener|curl|port/i.test(body), "readiness must not be inferred from a port");
  assert.match(body, /node_modules/);
  assert.match(body, /dependencies_missing/);
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
