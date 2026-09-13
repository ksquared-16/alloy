#!/usr/bin/env node
/**
 * A RESTART MUST MAKE PREVIOUS-GENERATION OWNERSHIP PROVABLY STALE.
 *
 * THE GAP. There was no host or runtime generation anywhere in the tree.
 * Ownership of every ephemeral resource was decided by PID NUMBER ALONE, and
 * `pidAlive` cannot tell "my process, still running" from "a different process
 * that reused the number after a restart". On a Mac running dev servers, test
 * runners and browsers all day, PID reuse is ordinary — so an owner record that
 * outlived a Gateway restart could be matched by a stranger, and the Governor
 * would treat that stranger's process as a resource it owned.
 *
 * These controls hold the two halves that make ownership true, and hold the
 * fail-closed direction for records written before generations existed.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-generation-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando", "execution-runs"), { recursive: true });

const C = await import("../lib/vacilando/control-plane-health.mjs");
const R = await import("../lib/vacilando/execution-recovery.mjs");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const DEAD_PID = 2147480000;

test("G1. the generation is stable within a process and minted once", () => {
  const a = C.currentRuntimeGeneration();
  const b = C.currentRuntimeGeneration();
  assert.equal(a, b, "a resource created now and one created later share an owner");
  assert.match(a, /^gen_/, "and it is recognisable in a record by eye");
});

test("G2. a restart mints a different generation", () => {
  const before = C.currentRuntimeGeneration();
  const after = C.resetRuntimeGenerationForTests();     // stands in for a restart
  assert.notEqual(after, before, "the new control plane is not the old one");
});

test("G3. the control-plane owner record carries it", () => {
  const owner = C.claimControlPlaneOwnership({ port: 3030 });
  assert.equal(owner.runtime_generation, C.currentRuntimeGeneration());
  assert.ok(Number.isFinite(owner.boot_ms), "boot time travels for diagnosis");
  assert.equal(C.readControlPlaneOwner().runtime_generation, owner.runtime_generation,
    "and it survives the round trip to disk");
});

test("G4. an owned process is stamped with the generation that created it", () => {
  const out = R.registerOwnedProcess({ id: "own-1", pid: process.pid, kind: "dev_server" }, ROOT);
  assert.equal(out.ok, true);
  assert.equal(out.process.runtime_generation, C.currentRuntimeGeneration());
  assert.equal(R.listOwnedProcesses(ROOT).find((p) => p.id === "own-1").runtime_generation,
    C.currentRuntimeGeneration(), "written down, not merely returned");
});

test("G5. PID REUSE: a live pid from a previous generation is never current truth", () => {
  /*
   * The exact hazard. `own-2` is recorded with a LIVE pid — this test process,
   * which is unambiguously alive — and then the control plane restarts. A check
   * that asked only "is the pid alive?" would answer yes and hand the old claim
   * to whatever now holds that number.
   */
  R.registerOwnedProcess({ id: "own-2", pid: process.pid, kind: "dev_server" }, ROOT);
  const priorGen = C.currentRuntimeGeneration();
  const rec = R.listOwnedProcesses(ROOT).find((p) => p.id === "own-2");
  assert.equal(C.ownershipIsCurrent(rec), true, "before the restart it is ours");

  C.resetRuntimeGenerationForTests();                    // the Gateway restarts
  assert.notEqual(C.currentRuntimeGeneration(), priorGen);

  const after = R.listOwnedProcesses(ROOT).find((p) => p.id === "own-2");
  assert.equal(after.pid, process.pid, "the recorded pid is still alive — that is the trap");
  assert.equal(C.ownershipIsCurrent(after), false,
    "and it is still refused, because liveness alone was never ownership");
  assert.ok(!R.listCurrentOwnedProcesses(ROOT).some((p) => p.id === "own-2"),
    "so it is not in what this control plane may speak for");
  assert.ok(R.listStaleGenerationOwnedProcesses(ROOT).some((p) => p.id === "own-2"),
    "it is visible as previous-generation, not silently dropped");
});

test("G6. both halves are required — a dead pid in the current generation is not current", () => {
  R.registerOwnedProcess({ id: "own-3", pid: DEAD_PID, kind: "test_runner" }, ROOT);
  const rec = R.listOwnedProcesses(ROOT).find((p) => p.id === "own-3");
  assert.equal(rec.runtime_generation, C.currentRuntimeGeneration(), "ours by generation");
  assert.equal(C.ownershipIsCurrent(rec), false, "but the process is gone, so there is nothing to own");
});

test("G7. a record written before generations existed fails closed", () => {
  // Not current: it cannot PROVE it is, so it is reclaimable rather than
  // silently authoritative. The opposite default would let every pre-upgrade
  // record survive the first restart as current truth.
  assert.equal(C.ownershipIsCurrent({ id: "legacy", pid: process.pid }), false);
  assert.equal(C.ownershipIsCurrent(null), false);
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
