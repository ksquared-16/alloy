#!/usr/bin/env node
/**
 * HEAVY HOST COLLECTION MUST NOT RUN ON THE GATEWAY EVENT LOOP,
 * AND AN ABSENT OPTIONAL PROVIDER MUST BE A STATE RATHER THAN A PROBE.
 *
 * MEASURED, September 11. After the stale-PID loop was stopped, Gateway CPU was
 * still bursty — samples around 99%, 51%, 42%, with earlier repeated 80-105%
 * bursts. Direct child-process observation caught vacilando-server spawning
 * `docker version`, `docker info`, and SEQUENTIAL `du -sk <worktree>/web/node_modules`
 * across eight worktrees, and later `git status --porcelain` across worktrees.
 * The sampler's hot path was child-process exit → fs ReadFileUtf8 → JSON.parse → GC.
 *
 * Engineering Health's delayed first run explicitly owns those heavy sync
 * `du`/`ps` collectors and fired at the observed ~10-minute point. It was being
 * imported and awaited INSIDE the server process, so every `execFileSync` in
 * every collector blocked the control plane's event loop. The prior mitigation
 * only delayed the first run — which scheduled the stall rather than removing it.
 *
 * Separately, Docker was not running, and its absence was rediscovered from
 * scratch every cycle: a subprocess, a failed connection to
 * ~/.docker/run/docker.sock, and an identical stderr line, forever. Docker is
 * OPTIONAL and must never be required for a healthy host.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STATE = mkdtempSync(join(tmpdir(), "vac-eh-cache-"));
process.env.ALLOY_ENGINEERING_HEALTH_DIR = STATE;

const src = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const decommented = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// ── D: the collectors execute beside the Gateway, not inside it ──────────────
test("C1. the Gateway spawns Engineering Health instead of importing it", () => {
  const server = decommented("../lib/vacilando-server.mjs");
  const tick = server.slice(server.indexOf("const engHealthTick"), server.indexOf("const engHealthTimer"));
  assert.ok(tick.length > 0, "the tick is still where the timer expects it");
  assert.ok(!/import\(["'][^"']*engineering-health\/index\.mjs/.test(tick),
    "the heavy module must not be loaded into the control-plane process");
  assert.match(tick, /execFile\(/, "it runs out-of-process");
  assert.match(tick, /engineering-health\/cli\.mjs/, "through Engineering Health's own CLI — no second collector");
  assert.match(tick, /--json/, "reading its report back as data");
});

test("C2. the isolated run is bounded and cannot pile up", () => {
  const server = src("../lib/vacilando-server.mjs");
  const tick = server.slice(server.indexOf("const ENG_HEALTH_TIMEOUT_MS"), server.indexOf("const engHealthTimer"));
  assert.match(tick, /timeout: ENG_HEALTH_TIMEOUT_MS/, "a run that overruns is killed");
  assert.match(tick, /killSignal: "SIGKILL"/, "and cannot ignore the kill");
  assert.match(tick, /maxBuffer:/, "its output is bounded");
  assert.match(tick, /engHealthInFlight/, "and a slow run does not start a second one");
});

test("C2b. a non-zero exit is a verdict, not a discarded report", () => {
  /*
   * Caught by actually running it: `cli.mjs` exits 2 on critical findings and 1
   * on warnings, so a healthy report exits 0 and an INTERESTING one does not.
   * A handler that bailed on `err` would throw away exactly the reports worth
   * having and leave the surface showing a stale score while the host degraded.
   * Measured during this change: score 92, six findings, exit 1.
   */
  const cli = src("../lib/engineering-health/cli.mjs");
  assert.match(cli, /process\.exit\(critical \? 2 : warning \? 1 : 0\)/,
    "the CLI's exit code reports severity");
  const server = src("../lib/vacilando-server.mjs");
  const handler = server.slice(server.indexOf("const ENG_HEALTH_TIMEOUT_MS"), server.indexOf("const engHealthTimer"));
  const cb = handler.slice(handler.indexOf("(err, stdout) =>"));
  const parseAt = cb.indexOf("JSON.parse(stdout)");
  const bailAt = cb.indexOf("if (err");
  assert.ok(parseAt > 0, "stdout is parsed");
  assert.ok(bailAt > parseAt, "and it is parsed BEFORE any decision based on the exit code");
});

test("C3. the sync collectors are still sync — which is why they must be elsewhere", () => {
  // Not a defect to fix in the collectors: execFileSync is correct in a
  // short-lived child. This control exists so that if anyone ever moves them
  // back into the server, C1 fails for a stated reason rather than by accident.
  for (const rel of [
    "../lib/engineering-health/collectors/git-repos.mjs",
    "../lib/engineering-health/collectors/node.mjs",
    "../lib/engineering-health/collectors/ide-caches.mjs",
  ]) {
    assert.match(src(rel), /execFileSync\(/, `${rel} blocks its process by design`);
    assert.match(src(rel), /"du"/, `${rel} is one of the recursive-size collectors`);
  }
});

// ── E: an absent optional provider is modelled, not re-probed ────────────────
test("C4. an unavailable provider backs off, and stops spending subprocesses", async () => {
  const { recordProviderHealth, providerProbeDue, readProviderHealth, stateDir } =
    await import("../lib/engineering-health/cache.mjs");
  // Prove the isolation before writing a single record: this store was NOT
  // overridable, and an earlier draft of this control wrote a fabricated
  // "Docker is down" entry into the live host cache.
  assert.equal(stateDir(), STATE, "the control must not be able to touch the host's cache");

  const t0 = Date.UTC(2026, 8, 11, 12, 0, 0);
  assert.equal(providerProbeDue("docker", { nowMs: t0 }), true, "an unknown provider is probed");

  const first = recordProviderHealth("docker", { available: false, detail: "Cannot connect to the Docker daemon", nowMs: t0 });
  assert.equal(first.available, false);
  assert.equal(first.consecutive_failures, 1);
  assert.equal(first.backoff_ms, 60_000, "the first backoff is one minute");
  assert.equal(providerProbeDue("docker", { nowMs: t0 + 30_000 }), false, "inside the window, no subprocess is spent");
  assert.equal(providerProbeDue("docker", { nowMs: t0 + 61_000 }), true, "after it, one probe is allowed");

  const second = recordProviderHealth("docker", { available: false, detail: "Cannot connect", nowMs: t0 + 61_000 });
  assert.equal(second.consecutive_failures, 2);
  assert.equal(second.backoff_ms, 120_000, "and it doubles");
  assert.equal(second.unavailable_since, first.unavailable_since,
    "the operator sees how long it has been down, not merely that the last probe failed");

  // The ceiling is real: a daemon someone starts is still noticed within half an
  // hour, however long it has been down.
  let rec = second;
  for (let i = 0; i < 12; i += 1) rec = recordProviderHealth("docker", { available: false, nowMs: t0 + i * 1000 });
  assert.equal(rec.backoff_ms, 30 * 60_000, "backoff is capped at 30 minutes");

  assert.equal(providerProbeDue("docker", { nowMs: t0, force: true }), true,
    "an explicit refresh always forces a probe — a stale 'down' must never answer a caller that needs it now");

  const back = recordProviderHealth("docker", { available: true, detail: "27.0.3", nowMs: t0 + 99_000 });
  assert.equal(back.available, true);
  assert.equal(back.consecutive_failures, 0, "recovery clears the backoff");
  assert.equal(back.next_probe_at, null);
  assert.equal(readProviderHealth("docker").available, true);
});

test("C5. both docker probes go through the one provider record", () => {
  for (const rel of [
    "../lib/engineering-health/collectors/docker.mjs",
    "../lib/engineering-health/collectors/services.mjs",
  ]) {
    const body = src(rel);
    assert.match(body, /providerProbeDue\("docker"/, `${rel} asks before probing`);
    assert.match(body, /recordProviderHealth\("docker"/, `${rel} records what it saw`);
  }
  // Two collectors probing the same absent daemon on their own schedules is how
  // one optional provider produced two streams of identical failures.
  const services = src("../lib/engineering-health/collectors/services.mjs");
  const probeAt = services.indexOf("providerProbeDue");
  const cmdAt = services.indexOf('tryCmd("docker"');
  assert.ok(probeAt < cmdAt, "the gate comes before the subprocess");
});

test("C6. Docker is never required for a healthy host", () => {
  const docker = src("../lib/engineering-health/collectors/docker.mjs");
  const skipped = docker.slice(docker.indexOf("if (!providerProbeDue"), docker.indexOf("const version = run("));
  assert.match(skipped, /available: false/, "absence is reported as a state");
  assert.match(skipped, /probe_skipped: true/, "and says plainly that nothing was spawned");
  assert.ok(!/throw|process\.exit/.test(skipped), "an absent optional provider is never fatal");
});

try { rmSync(STATE, { recursive: true, force: true }); } catch { /* */ }
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
