/**
 * Idempotent Director synthesis when the current work register is complete
 * but the durable Mission remains open.
 *
 * Empty register → Director explains continuity — never Waiting-on-you spam.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { appendTimelineEvent, readTimeline } from "./timeline.mjs";
import { peekNextImplementationPhase } from "./mission-advance.mjs";
import { listAssignments } from "./worker-assignment.mjs";
import { deriveMissionPosture } from "./mission-posture.mjs";
import { missionHealthVm } from "./presentation/mission-health.mjs";
import { displayMissionTitle } from "./presentation/mission-conversation.mjs";

const RUNTIME = () =>
  process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(homedir(), ".local", "state", "alloy-dev");

const MARKER = "register_complete_director_synthesis";
const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function markerPath(missionId) {
  return join(RUNTIME(), "vacilando", "missions", missionId, "register-complete-synthesis.json");
}

function alreadySynthesized(missionId) {
  const p = markerPath(missionId);
  if (existsSync(p)) {
    try {
      const j = JSON.parse(readFileSync(p, "utf8"));
      if (j?.kind === MARKER) return true;
    } catch { /* fall through */ }
  }
  try {
    const tl = readTimeline(missionId, { limit: 80 }) || [];
    return tl.some((e) => e?.detail?.kind === MARKER || e?.type === MARKER);
  } catch {
    return false;
  }
}

function writeMarker(missionId, payload) {
  const dir = join(RUNTIME(), "vacilando", "missions", missionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(markerPath(missionId), JSON.stringify(payload, null, 2));
}

function persistDirectorMessage(missionId, summary, nowMs) {
  const dir = join(RUNTIME(), "vacilando", "director-messages");
  mkdirSync(dir, { recursive: true });
  const record = {
    schema_version: "vacilando.mission_director_message.v1",
    messageId: "mdm_" + randomBytes(8).toString("hex"),
    missionId,
    kind: "director_response",
    actor: "director",
    verbatim: summary,
    interpretation: { action: "register_complete_synthesis", summary },
    source: "durable_mission_continuity",
    at: iso(nowMs),
  };
  appendFileSync(join(dir, `${missionId}.jsonl`), JSON.stringify(record) + "\n");
  return record;
}

/**
 * If current work register is exhausted and Mission is still open, post one
 * Director synthesis (timeline + conversation). Safe to call on every shell load.
 */
export function ensureRegisterCompleteDirectorSynthesis(missionId, { nowMs } = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  const posture = deriveMissionPosture(missionId);
  if (!["mission_idle", "director_reconciling"].includes(posture?.id)) {
    return { ok: true, skipped: true, reason: "not_register_complete_idle" };
  }
  const health = missionHealthVm(missionId, { posture });
  if (!health?.register?.complete) {
    return { ok: true, skipped: true, reason: "register_not_complete" };
  }
  if (health.waitingOnYou) {
    return { ok: true, skipped: true, reason: "waiting_on_decision" };
  }
  if (alreadySynthesized(missionId)) {
    return { ok: true, skipped: true, reason: "already_synthesized", deduped: true };
  }

  const nextPhase = (() => {
    try { return peekNextImplementationPhase(missionId); } catch { return null; }
  })();
  const asgs = listAssignments(missionId) || [];
  const lastDone = [...asgs].reverse().find((a) =>
    ["complete", "accepted"].includes(String(a.status || "").toLowerCase())) || null;
  const title = displayMissionTitle(missionId, health.title);

  const lines = [
    `${title} remains an ongoing Mission.`,
    `Current work register is complete (${health.register.done}/${health.register.total}).`,
    lastDone?.title ? `Just finished: ${lastDone.title}.` : null,
    nextPhase?.title
      ? `Next plan phase available: ${nextPhase.title}. Message me “Continue” to open it.`
      : "No further phase is queued in the current plan register. Broader Mission work may still remain.",
    "I am not waiting on you unless a real decision appears.",
    "Say “Continue”, name the next outcome, or leave this Mission idle until you need it again.",
    "Closing this Mission is rare and intentional — do not confuse register completion with Mission completion.",
  ].filter(Boolean);
  const summary = lines.join(" ");

  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: "Director reconciled current work — Mission ongoing",
      summary,
      visibility: "summary",
      actor: "director",
      detail: { kind: MARKER, register: health.register, nextPhase },
      nowMs,
    });
  } catch { /* best-effort */ }

  try {
    persistDirectorMessage(missionId, summary, nowMs);
  } catch { /* best-effort */ }

  writeMarker(missionId, {
    kind: MARKER,
    at: iso(nowMs),
    register: health.register,
    nextPhase: nextPhase ? { phaseId: nextPhase.phaseId, title: nextPhase.title } : null,
    summary,
  });

  return { ok: true, synthesized: true, summary };
}
