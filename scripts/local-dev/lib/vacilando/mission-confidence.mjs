/**
 * Vacilando — Mission Confidence (Mission Dashboard V1).
 *
 * Director's confidence that the mission will complete successfully.
 * NOT model/AI confidence. Weighted operational factors, 0–100%.
 *
 * Factors (initial static weights):
 *   Architecture 15 · Implementation 25 · Evidence 20 · QA 15 · Worker Health 15 · Dependencies 10
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { getBrief } from "./mission-brief.mjs";
import { listAssignments } from "./worker-assignment.mjs";
import { listDecisions } from "./decisions.mjs";
import { acceptanceEvidenceCoverage, listEvidence, listValidationRuns, canCertifyMission } from "./evidence.mjs";
import { listWorkerTelemetry } from "./worker-health.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "mission-confidence");

export const CONFIDENCE_WEIGHTS = Object.freeze({
  architecture: 0.15,
  implementation: 0.25,
  evidence: 0.20,
  qa: 0.15,
  worker_health: 0.15,
  dependencies: 0.10,
});

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(missionId) {
  return join(DIR, `${missionId}.json`);
}

function clamp(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreArchitecture(brief, assignments) {
  if (!brief) return { score: 10, note: "No Mission Brief yet" };
  const phases = (brief.plan || []).length;
  const ac = (brief.acceptanceCriteria || []).length;
  const constraints = (brief.constraints || []).length;
  let score = 40;
  if (phases >= 1) score += 20;
  if (phases >= 3) score += 10;
  if (ac >= 1) score += 15;
  if (constraints >= 1) score += 10;
  if (assignments.length >= phases && phases > 0) score += 5;
  return {
    score: clamp(score),
    note: phases ? `${phases} phase${phases === 1 ? "" : "s"} · ${ac} acceptance criteria` : "Brief incomplete",
  };
}

function scoreImplementation(assignments) {
  if (!assignments.length) return { score: 20, note: "No deliverables assigned yet" };
  const done = assignments.filter((a) => a.status === "complete").length;
  const running = assignments.filter((a) => ["running", "verification"].includes(a.status)).length;
  const failed = assignments.filter((a) => a.status === "failed").length;
  const pct = done / assignments.length;
  let score = pct * 85 + (running ? 8 : 0);
  score -= failed * 15;
  return {
    score: clamp(score),
    note: `${done} of ${assignments.length} deliverables accepted`,
  };
}

function scoreEvidence(missionId) {
  const coverage = acceptanceEvidenceCoverage(missionId);
  if (!coverage.length) return { score: 25, note: "No acceptance criteria mapped yet" };
  const passed = coverage.filter((c) => c.status === "passed").length;
  const partial = coverage.filter((c) => c.status === "partial").length;
  const score = ((passed + partial * 0.5) / coverage.length) * 100;
  return {
    score: clamp(score),
    note: `${passed} of ${coverage.length} criteria covered by evidence`,
  };
}

function scoreQa(missionId) {
  const runs = listValidationRuns(missionId);
  const arts = listEvidence(missionId);
  const qaArts = arts.filter((a) => ["test", "browser", "screenshot", "typecheck", "build"].includes(a.type));
  if (!runs.length && !qaArts.length) return { score: 30, note: "No validation or QA evidence yet" };
  const okRuns = runs.filter((r) => r.ok).length;
  const failRuns = runs.filter((r) => !r.ok).length;
  let score = 40 + Math.min(40, qaArts.length * 8) + Math.min(20, okRuns * 10);
  score -= failRuns * 12;
  return {
    score: clamp(score),
    note: runs.length
      ? `${okRuns}/${runs.length} validation runs passed · ${qaArts.length} QA artifacts`
      : `${qaArts.length} QA artifacts · no formal validation runs`,
  };
}

function scoreWorkerHealth(missionId) {
  const workers = listWorkerTelemetry().filter((w) => w.missionId === missionId);
  const openDecisions = listDecisions(missionId, { status: "open" });
  if (!workers.length) {
    return {
      score: openDecisions.length ? 55 : 70,
      note: "No worker telemetry yet",
    };
  }
  const bad = workers.filter((w) => ["unresponsive", "failed", "stalled", "recovering"].includes(w.status));
  const healthy = workers.filter((w) => ["healthy", "starting", "idle", "complete"].includes(w.status));
  let score = 50 + (healthy.length / workers.length) * 50 - (bad.length / workers.length) * 55;
  return {
    score: clamp(score),
    note: bad.length
      ? `${bad.length} of ${workers.length} workers need attention`
      : `${workers.length} worker${workers.length === 1 ? "" : "s"} healthy`,
  };
}

function scoreDependencies(assignments, openDecisions) {
  if (!assignments.length) return { score: 60, note: "No dependency graph yet" };
  const blocked = assignments.filter((a) => a.status === "blocked").length;
  const paused = assignments.filter((a) => a.status === "paused").length;
  const waiting = assignments.filter((a) => a.status === "waiting").length;
  let score = 90 - blocked * 25 - paused * 12 - waiting * 5;
  if (openDecisions.length) score -= 10;
  return {
    score: clamp(score),
    note: blocked || paused
      ? `${blocked} blocked · ${paused} paused · ${waiting} waiting`
      : waiting
        ? `${waiting} waiting on upstream deliverables`
        : "Dependencies clear",
  };
}

/** Compute Mission Confidence snapshot (does not persist). */
export function computeMissionConfidence(missionId) {
  const brief = getBrief(missionId);
  const assignments = listAssignments(missionId);
  const openDecisions = listDecisions(missionId, { status: "open" });
  const factors = {
    architecture: scoreArchitecture(brief, assignments),
    implementation: scoreImplementation(assignments),
    evidence: scoreEvidence(missionId),
    qa: scoreQa(missionId),
    worker_health: scoreWorkerHealth(missionId),
    dependencies: scoreDependencies(assignments, openDecisions),
  };

  let total = 0;
  for (const [key, weight] of Object.entries(CONFIDENCE_WEIGHTS)) {
    total += (factors[key]?.score ?? 0) * weight;
  }
  const percent = clamp(total);
  const cert = canCertifyMission(missionId);

  let band = "building";
  if (percent >= 85) band = "high";
  else if (percent >= 65) band = "solid";
  else if (percent >= 40) band = "developing";
  else band = "at_risk";

  return {
    schema_version: "vacilando.mission_confidence.v1",
    missionId,
    percent,
    band,
    bandLabel: ({
      high: "High confidence",
      solid: "Solid",
      developing: "Developing",
      at_risk: "At risk",
      building: "Building",
    })[band],
    factors,
    weights: { ...CONFIDENCE_WEIGHTS },
    certification_ready: Boolean(cert.ready),
    computed_at: iso(),
  };
}

function readHistory(missionId) {
  try {
    return JSON.parse(readFileSync(fileFor(missionId), "utf8"));
  } catch {
    return { schema_version: "vacilando.mission_confidence_history.v1", mission_id: missionId, snapshots: [] };
  }
}

/** Persist snapshot and return confidence with change explanation. */
export function recordMissionConfidence(missionId, { nowMs } = {}) {
  ensureDir();
  const snap = computeMissionConfidence(missionId);
  if (nowMs) snap.computed_at = iso(nowMs);
  const hist = readHistory(missionId);
  const prev = hist.snapshots[hist.snapshots.length - 1] || null;
  const changes = [];
  if (prev) {
    const delta = snap.percent - prev.percent;
    if (delta !== 0) {
      changes.push({
        kind: "overall",
        from: prev.percent,
        to: snap.percent,
        delta,
        summary: delta > 0
          ? `Confidence rose ${delta} points to ${snap.percent}%`
          : `Confidence fell ${Math.abs(delta)} points to ${snap.percent}%`,
      });
    }
    for (const key of Object.keys(CONFIDENCE_WEIGHTS)) {
      const a = prev.factors?.[key]?.score;
      const b = snap.factors?.[key]?.score;
      if (a != null && b != null && a !== b) {
        changes.push({
          kind: key,
          from: a,
          to: b,
          delta: b - a,
          summary: `${key.replace(/_/g, " ")} ${b > a ? "improved" : "declined"} (${a}→${b}) — ${snap.factors[key].note}`,
        });
      }
    }
  } else {
    changes.push({
      kind: "baseline",
      from: null,
      to: snap.percent,
      delta: null,
      summary: `Baseline confidence set at ${snap.percent}%`,
    });
  }

  hist.snapshots.push({
    percent: snap.percent,
    band: snap.band,
    factors: snap.factors,
    at: snap.computed_at,
  });
  if (hist.snapshots.length > 50) hist.snapshots = hist.snapshots.slice(-50);
  writeFileSync(fileFor(missionId), JSON.stringify(hist, null, 2));

  return {
    ...snap,
    previous_percent: prev?.percent ?? null,
    change: changes[0] || null,
    changes,
  };
}

export function getMissionConfidence(missionId) {
  const hist = readHistory(missionId);
  const live = computeMissionConfidence(missionId);
  const prev = hist.snapshots[hist.snapshots.length - 1] || null;
  if (!prev || prev.percent !== live.percent) {
    return recordMissionConfidence(missionId);
  }
  return {
    ...live,
    previous_percent: hist.snapshots.length > 1 ? hist.snapshots[hist.snapshots.length - 2].percent : null,
    change: null,
    changes: [],
  };
}

/** Rough next-checkpoint estimate for operators (not a schedule SLA). */
export function estimateNextCheckpoint(missionId) {
  const assignments = listAssignments(missionId);
  const open = listDecisions(missionId, { status: "open" });
  if (open.length) {
    return { label: "Waiting on your decision", etaMinutes: null, kind: "decision" };
  }
  const running = assignments.filter((a) => a.status === "running");
  const verification = assignments.filter((a) => a.status === "verification");
  if (verification.length) {
    return { label: `~${10 + verification.length * 5} minutes`, etaMinutes: 10 + verification.length * 5, kind: "validation" };
  }
  if (running.length) {
    const mins = 15 + running.length * 8;
    return { label: `~${mins} minutes`, etaMinutes: mins, kind: "progress" };
  }
  const ready = assignments.filter((a) => a.status === "ready");
  if (ready.length) {
    return { label: "~10 minutes", etaMinutes: 10, kind: "start" };
  }
  if (assignments.every((a) => a.status === "complete") && assignments.length) {
    return { label: "Ready for your review", etaMinutes: null, kind: "completion" };
  }
  return { label: "Not scheduled yet", etaMinutes: null, kind: "unknown" };
}
