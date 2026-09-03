/**
 * A CAPACITY LEVEL IS ONLY VALID IF THE COHORT WAS ACTUALLY THERE.
 *
 * THE DEFECT THIS CLOSES. The Phase 2 staircase recorded INTENDED concurrency
 * and called it measured concurrency. It started N servers, labelled the window
 * "Level N", and averaged every sample in it. The per-sample listener counts
 * afterwards told a different story:
 *
 *   Level 3   3, 3, 2, 2, 3, 3, 3, 3     two samples had two servers
 *   Level 4   4, 3                        the second sample had three
 *
 * Runtime Performance's server on 3011 stopped twice on its own while the
 * experiment was running. Nothing was wrong with the host — another lane was
 * managing its own dev server, which is entirely its business. But a capacity
 * number derived from those windows is not a measurement of 3 or 4 servers; it
 * is a measurement of an unknown mixture, and averaging it produces a figure
 * that looks authoritative and means nothing.
 *
 * So membership is asserted at every sample, not assumed at the start. A sample
 * where the cohort is not exactly intact is INVALID, and an invalid sample is
 * excluded rather than averaged. A level with no clean window cannot be
 * classified, and a driver may not advance past it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not stop anyone else from
 * managing their own dev server. The contamination source here is not idle
 * reclamation — `stop_terminal_dev_server` is declared `authority: "operator",
 * certified: false`, so the Host Steward surfaces it and never executes it
 * autonomously. It is other lanes doing legitimate work in their own worktrees.
 * A lease that could override that would mean a capacity experiment can freeze
 * another team's development environment, which is a governance change, not a
 * measurement fix. Detecting contamination is bounded and safe; preventing it
 * is not, and pretending otherwise would trade an honest invalid sample for a
 * dishonest valid one.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * WHERE `observed` COMES FROM. `assessSample` judges an observation; it does not
 * make one, and it must never learn how. The single producer is
 * `observeManagedPorts` in ./dev-server-ownership.mjs, which reads the one
 * listener primitive in lib/read-core.sh. Building an `observed` array any other
 * way — parsing lsof here, trusting a PID file, inferring from HTTP 200 — is a
 * second discovery path, and the last one of those reported a port serving
 * traffic as free.
 */

export const COHORT_SCHEMA = "vacilando.capacity_cohort.v1";

/** Why a sample was rejected. Each is a distinct, reportable fact. */
export const INVALID_REASONS = Object.freeze({
  MISSING: "cohort_member_missing",
  PID_CHANGED: "cohort_member_restarted",
  FOREIGN: "foreign_server_present",
  // An EXPECTED port held by the wrong worktree. Distinct from FOREIGN, which is
  // a server on a port nobody expected: this one occupies a cohort slot, so the
  // level still counts N listeners while one of them is serving someone else's
  // lane. That is the Financials-on-3011 collision, and a sample taken during it
  // measures a fleet that does not exist.
  FOREIGN_OWNER: "cohort_member_foreign_owner",
  UNATTRIBUTABLE: "cohort_member_unattributable",
  NOT_READY: "cohort_member_not_ready",
});

const norm = (v) => (v == null ? null : String(v).trim());

/**
 * Declare the cohort for a level: exactly which servers must be present, and
 * the process identity each one had when the window opened.
 *
 * The PID is captured deliberately. A server that exits and is restarted onto a
 * new PID mid-window is a different process with a cold module graph and a
 * different memory profile; treating it as continuous membership would smuggle
 * a warm-up into a steady-state measurement.
 */
export function defineCohort({ level, members = [], nowMs = Date.now() } = {}) {
  const seen = new Set();
  const normalized = [];
  for (const m of members) {
    const port = Number(m?.port);
    if (!Number.isInteger(port) || seen.has(port)) continue;
    seen.add(port);
    normalized.push({
      lane_id: norm(m.lane_id),
      worktree: norm(m.worktree),
      slot: Number.isInteger(Number(m.slot)) ? Number(m.slot) : null,
      port,
      dev_command: norm(m.dev_command) || "npm run dev",
      pid: Number.isInteger(Number(m.pid)) ? Number(m.pid) : null,
      ready: m.ready === true,
    });
  }
  return {
    schema_version: COHORT_SCHEMA,
    level: Number(level) || normalized.length,
    expected_count: normalized.length,
    members: normalized,
    opened_at: new Date(nowMs).toISOString(),
  };
}

/**
 * Judge one sample against the cohort.
 *
 * `observed` is what the host actually had at that instant: one entry per
 * listening port, with its pid, readiness and ownership. Nothing here infers
 * liveness from absence — an unreadable observation is not a present server.
 */
export function assessSample(cohort, observed = [], { nowMs = Date.now() } = {}) {
  const byPort = new Map();
  for (const o of observed) {
    const port = Number(o?.port);
    if (Number.isInteger(port)) byPort.set(port, o);
  }
  const problems = [];
  const present = [];

  for (const want of cohort.members) {
    const got = byPort.get(want.port);
    if (!got || got.pid == null) {
      problems.push({ port: want.port, worktree: want.worktree, slot: want.slot, reason: INVALID_REASONS.MISSING });
      continue;
    }
    if (got.attributable === false) {
      problems.push({ port: want.port, worktree: want.worktree, slot: want.slot, reason: INVALID_REASONS.UNATTRIBUTABLE });
      continue;
    }
    // Ownership is checked BEFORE the PID comparison. A foreign owner that
    // happens to arrive on a fresh PID would otherwise be reported as a restart
    // of our own server — the same invalidation, but the wrong reason, and the
    // operator would go looking for a crash instead of a collision.
    if (want.worktree && got.worktree && norm(got.worktree) !== norm(want.worktree)) {
      problems.push({
        port: want.port,
        worktree: want.worktree,
        slot: want.slot,
        reason: INVALID_REASONS.FOREIGN_OWNER,
        observed_worktree: norm(got.worktree),
        observed_pid: Number(got.pid),
      });
      continue;
    }
    if (want.pid != null && Number(got.pid) !== Number(want.pid)) {
      problems.push({
        port: want.port,
        worktree: want.worktree,
        slot: want.slot,
        reason: INVALID_REASONS.PID_CHANGED,
        expected_pid: want.pid,
        observed_pid: Number(got.pid),
      });
      continue;
    }
    if (got.ready === false) {
      problems.push({ port: want.port, worktree: want.worktree, slot: want.slot, reason: INVALID_REASONS.NOT_READY });
      continue;
    }
    present.push(want.port);
  }

  // A server outside the cohort changes the measurement just as much as a
  // missing one: the level is no longer "N servers", it is N plus something.
  const expectedPorts = new Set(cohort.members.map((m) => m.port));
  for (const [port, o] of byPort) {
    if (!expectedPorts.has(port) && o?.pid != null) {
      problems.push({ port, reason: INVALID_REASONS.FOREIGN });
    }
  }

  return {
    at: new Date(nowMs).toISOString(),
    level: cohort.level,
    expected_count: cohort.expected_count,
    observed_count: present.length,
    members_present: present,
    valid: problems.length === 0,
    problems,
  };
}

/**
 * WHY DID THAT SERVER LEAVE?
 *
 * Detecting that a cohort member vanished was only half the job. The previous
 * report had to say "another lane's agent probably stopped it" — inference,
 * because nothing recorded lifecycle actions. The dev-server lifecycle audit
 * now does, so an invalidation can name the action instead of guessing at it.
 *
 * The two answers are different problems and must not read the same:
 *
 *   stop by lane-agent/run xyz at 21:04:12Z   somebody stopped it deliberately,
 *                                             through a sanctioned path
 *   no canonical lifecycle event              it was killed outside the
 *                                             lifecycle, and THAT is a defect
 *
 * Reads the audit as evidence, never as authority: a missing or unreadable log
 * yields "unknown", never an invented cause.
 */
export function lastLifecycleEventFor({ worktree, port, root, before = null, log = null } = {}) {
  let lines = log;
  if (lines == null) {
    try {
      const path = join(String(root || ""), "dev-server-lifecycle.jsonl");
      if (!existsSync(path)) return null;
      lines = readFileSync(path, "utf8").split("\n");
    } catch {
      return null;
    }
  }
  const cutoff = before ? Date.parse(before) : null;
  let best = null;
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (worktree && rec.worktree !== worktree) continue;
    if (!worktree && port != null && Number(rec.port) !== Number(port)) continue;
    if (cutoff && Date.parse(rec.at) > cutoff) continue;
    if (!best || Date.parse(rec.at) >= Date.parse(best.at)) best = rec;
  }
  return best;
}

/** One human sentence for an invalidation, with the evidence or its absence. */
export function explainProblem(problem, { root, log = null, at = null } = {}) {
  const ev = lastLifecycleEventFor({ worktree: problem.worktree, port: problem.port, root, before: at, log });
  const what = `slot ${problem.slot ?? "?"} port ${problem.port} (${problem.worktree || "unknown worktree"}) — ${problem.reason}`;
  if (!ev) return `${what}; no canonical lifecycle event`;
  const who = ev.actor + (ev.run_id ? `/run ${ev.run_id}` : "");
  return `${what}; last canonical event: ${ev.action} by ${who} at ${ev.at}${ev.reason ? ` (${ev.reason})` : ""}`;
}

/** Attach explanations to every contamination in a window summary. */
export function explainWindow(summary, { root, log = null } = {}) {
  return {
    ...summary,
    contaminations: (summary.contaminations || []).map((c) => ({
      ...c,
      explanation: explainProblem(c, { root, log, at: c.at }),
    })),
  };
}

/**
 * Roll a window of samples up into a level result.
 *
 * `minValidMs` is the contract the mission states: a level needs a CLEAN hold
 * of a stated length, not a majority of clean samples. So validity is measured
 * as the longest UNBROKEN run of valid samples, and a single contaminated
 * sample in the middle splits the window rather than being averaged away.
 */
export function summariseWindow(samples = [], { minValidMs = 0, sampleIntervalMs = 0 } = {}) {
  const total = samples.length;
  const valid = samples.filter((s) => s.valid).length;

  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < samples.length; i += 1) {
    if (samples[i].valid) {
      if (curLen === 0) curStart = i;
      curLen += 1;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
    } else {
      curLen = 0;
    }
  }

  const run = bestLen > 0 ? samples.slice(bestStart, bestStart + bestLen) : [];
  let spanMs = 0;
  if (run.length >= 2) {
    spanMs = Date.parse(run[run.length - 1].at) - Date.parse(run[0].at);
  } else if (run.length === 1) {
    spanMs = sampleIntervalMs;
  }

  const contaminations = samples
    .filter((s) => !s.valid)
    .flatMap((s) => s.problems.map((p) => ({ at: s.at, ...p })));

  return {
    level: samples[0]?.level ?? null,
    samples_total: total,
    samples_valid: valid,
    longest_valid_run: bestLen,
    valid_span_ms: spanMs,
    meets_hold: spanMs >= minValidMs && bestLen > 1,
    // A level without a clean window is NOT a level. It has no classification,
    // and a driver may not read a capacity conclusion out of it.
    classifiable: spanMs >= minValidMs && bestLen > 1,
    valid_sample_indices: run.length ? [bestStart, bestStart + bestLen - 1] : [],
    contaminations,
  };
}

/**
 * May the staircase advance?
 *
 * Advancing on a contaminated level is how the previous run produced "Level 4"
 * from three servers. The answer is no unless the level actually held.
 */
export function mayAdvance(levelSummary) {
  if (!levelSummary || !levelSummary.classifiable) {
    return {
      ok: false,
      error: "level_not_classifiable",
      detail: levelSummary
        ? `level ${levelSummary.level}: longest clean run ${levelSummary.longest_valid_run} sample(s), ${Math.round((levelSummary.valid_span_ms || 0) / 1000)}s — no valid hold window`
        : "no level summary",
    };
  }
  return { ok: true };
}
