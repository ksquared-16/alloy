#!/usr/bin/env node
/**
 * A CONTROL-PLANE EPISODE MUST END WHEN THE PROBLEM DOES.
 *
 * THE INCIDENT. Episode cpr_tkzz0n opened 2026-09-07 for TOOLKIT_DRIFT, made
 * two attempts, verified neither, and was still open days later reporting
 * `director_action_required: true` on the operating scoreboard — while the live
 * classification was HEALTHY and staging, installed and running were all
 * fd27ee82c3bf. The drift had been fixed by a Director-authorised install and a
 * restart; nothing told the record.
 *
 * Two causes, both here. `recordVerification` is reachable only from the
 * Steward's own repair path, so an episode fixed by any other route never
 * closed. And `director_action_required` was computed from the attempt count
 * without consulting `resolved_at`, so exhausting the attempts made the alarm
 * permanent rather than transient.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const R = await import("../lib/vacilando/control-plane-recovery.mjs");

function rootWithEpisode(episode) {
  const root = mkdtempSync(join(tmpdir(), "vac-episode-"));
  const p = R.recoveryEpisodePath(root);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(episode, null, 2));
  return root;
}

const DRIFT_EPISODE = {
  schema_version: R.CONTROL_PLANE_RECOVERY_SCHEMA,
  episode_id: "cpr_test01",
  failure_class: "TOOLKIT_DRIFT",
  first_observed_at: "2026-09-07T14:02:47.829Z",
  resolved_at: null,
  level: 4,
  attempts: [
    { action: "converge_toolkit_then_restart", at: "2026-09-07T14:02:47.829Z", verified: null },
    { action: "converge_toolkit_then_restart", at: "2026-09-07T15:53:00.638Z", verified: null },
  ],
};

const HEALTHY_OBS = {
  host_reachable: true, launchd_job_loaded: true, process_exists: true,
  toolkit_drift: false, loopback_healthy: true, tailscale_up: true,
  director_route_healthy: true, supervisor_healthy: true,
};

await test("CP1 — a healthy observation closes an episode nobody verified", () => {
  const root = rootWithEpisode(DRIFT_EPISODE);
  const before = R.readEpisode(root).episode;
  assert.equal(before.resolved_at, null, "precondition: the episode is open");

  const out = R.reconcileEpisodeAgainstObservation(HEALTHY_OBS, { root, nowMs: Date.parse("2026-09-10T03:00:00Z") });
  assert.equal(out.changed, true);
  const after = R.readEpisode(root).episode;
  assert.equal(after.resolved_at, "2026-09-10T03:00:00.000Z");
  assert.equal(after.resolved_by, "observation",
    "a later reader must be able to tell 'the Steward fixed it' from 'it was fixed and noticed'");
  assert.ok(after.last_known_good);
});

await test("CP2 — an episode is NOT closed while anything is still wrong", () => {
  // A different failure is a different problem, not evidence this one ended.
  for (const [label, obs] of [
    ["still drifted", { ...HEALTHY_OBS, toolkit_drift: true }],
    ["process dead", { ...HEALTHY_OBS, process_exists: false }],
    ["route down", { ...HEALTHY_OBS, director_route_healthy: false }],
    ["unmeasurable", { ...HEALTHY_OBS, process_exists: null }],
  ]) {
    const root = rootWithEpisode(DRIFT_EPISODE);
    const out = R.reconcileEpisodeAgainstObservation(obs, { root, nowMs: Date.now() });
    assert.equal(out.changed, false, `${label} must not close the episode`);
    assert.equal(R.readEpisode(root).episode.resolved_at, null);
  }
});

await test("CP3 — reconciling twice is harmless, and a closed episode stays closed", () => {
  const root = rootWithEpisode(DRIFT_EPISODE);
  const first = R.reconcileEpisodeAgainstObservation(HEALTHY_OBS, { root, nowMs: 1_000_000 });
  const second = R.reconcileEpisodeAgainstObservation(HEALTHY_OBS, { root, nowMs: 2_000_000 });
  assert.equal(first.changed, true);
  assert.equal(second.changed, false, "already resolved; nothing to do");
  assert.equal(R.readEpisode(root).episode.resolved_at, new Date(1_000_000).toISOString(),
    "the resolution time must not drift forward on every tick");
});

await test("CP4 — a resolved episode asks nothing of the Director", async () => {
  const { stewardStatus } = await import("../lib/vacilando/host-steward-cycle.mjs");
  // Attempts are exhausted (2 of 2), which is exactly what used to make the
  // alarm permanent. Resolved, it must ask for nothing.
  const root = rootWithEpisode({ ...DRIFT_EPISODE, resolved_at: "2026-09-10T03:00:00.000Z", resolved_by: "observation" });
  const posture = stewardStatus({ root }).control_plane_recovery;
  assert.equal(posture.episode_active, false);
  assert.equal(posture.director_action_required, false,
    "an episode that is over cannot require action, however many attempts it used");
  assert.equal(posture.resolved_by, "observation");

  // Positive control: while genuinely open and exhausted, it DOES require the
  // Director — so CP4 cannot pass by the flag being dead.
  const open = rootWithEpisode(DRIFT_EPISODE);
  const still = stewardStatus({ root: open }).control_plane_recovery;
  assert.equal(still.episode_active, true);
  assert.equal(still.director_action_required, true);
});

await test("CP5 — the Steward reconciles before it plans", () => {
  const src = readFileSync(new URL("../lib/vacilando/host-steward-run.mjs", import.meta.url), "utf8");
  const reconcile = src.indexOf("reconcileEpisodeAgainstObservation");
  const plan = src.indexOf("R.planRecovery(observation");
  assert.ok(reconcile > 0, "the cycle must reconcile the episode against what it just observed");
  assert.ok(reconcile < plan, "reconciling after planning would leave the stale posture for a whole cycle");
});
