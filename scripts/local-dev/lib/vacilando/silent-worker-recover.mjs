/**
 * Director auto-resume when a worker goes silent.
 *
 * Operator should not have to babysit "Resume work" for technical silence
 * (overnight death, restart orphans, stalled heartbeats). Director relaunches
 * capped times; only then escalate to Needs You.
 *
 * State helpers stay sync and dependency-free so mission-posture can read them
 * without circular imports. Recovery work uses dynamic imports.
 */

const MAX_TRIES = 3;
const COOLDOWN_MS = 45_000;

/** @type {Map<string, { tries: number, lastAt: number, exhausted: boolean }>} */
const state = new Map();

export function silentRecoveryState(missionId) {
  if (!missionId) return { tries: 0, exhausted: false, recovering: false };
  const s = state.get(missionId);
  if (!s) return { tries: 0, exhausted: false, recovering: false };
  return {
    tries: s.tries || 0,
    exhausted: s.exhausted === true,
    recovering: !s.exhausted && s.tries > 0,
  };
}

export function clearSilentRecovery(missionId) {
  if (missionId) state.delete(missionId);
}

/**
 * Scan missions in worker_silent posture and resume without operator click.
 * Skips missions with an open decision (human call still required first).
 */
export async function recoverSilentWorkers({ nowMs = Date.now() } = {}) {
  const { listMissionsV2 } = await import("./director-summary.mjs");
  const { listDecisions } = await import("./decisions.mjs");
  const { deriveMissionPosture } = await import("./mission-posture.mjs");
  const { resumeStalledMission } = await import("./mission-reopen.mjs");
  const { reconcileZombieSessions } = await import("./execution-session.mjs");
  const { getBrief } = await import("./mission-brief.mjs");
  const { getMission } = await import("./commands/missions.mjs");
  const { isFixtureMission } = await import("./presentation/mission-filters.mjs");
  const { listAssignments } = await import("./worker-assignment.mjs");

  // Flip stale "running" sessions to failed first — otherwise posture stays
  // busy/executing and silent recovery never sees worker_silent.
  let zombies = [];
  try {
    zombies = reconcileZombieSessions({ nowMs });
  } catch { zombies = []; }

  const attempted = [];
  const recovered = [];
  const escalated = [];
  const skipped = [];

  for (const row of listMissionsV2({ includeArchived: false })) {
    const missionId = row.mission_id || row.missionId;
    if (!missionId) continue;
    const title = getBrief(missionId)?.title || getMission(missionId)?.title;
    if (isFixtureMission(title, missionId)) continue;
    // Cheap gate — skip full posture when nothing is claimed running.
    const claimed = (listAssignments(missionId) || []).some((a) =>
      ["running", "verification"].includes(a.status));
    if (!claimed) continue;

    const posture = deriveMissionPosture(missionId);
    if (posture.id !== "worker_silent") {
      if (state.has(missionId) && (posture.busy || posture.id === "executing" || posture.id === "ready_to_start")) {
        state.delete(missionId);
      }
      continue;
    }

    const openDecision = listDecisions(missionId).find((d) => d.status === "open");
    if (openDecision) {
      skipped.push({ missionId, reason: "open_decision" });
      continue;
    }

    const s = state.get(missionId) || { tries: 0, lastAt: 0, exhausted: false };
    if (s.exhausted) {
      escalated.push({ missionId, tries: s.tries });
      continue;
    }
    if (s.tries > 0 && nowMs - s.lastAt < COOLDOWN_MS) {
      skipped.push({ missionId, reason: "cooldown" });
      continue;
    }
    if (s.tries >= MAX_TRIES) {
      s.exhausted = true;
      state.set(missionId, s);
      escalated.push({ missionId, tries: s.tries });
      continue;
    }

    s.tries += 1;
    s.lastAt = nowMs;
    state.set(missionId, s);
    attempted.push({ missionId, try: s.tries });

    let out;
    try {
      // Reset stalled rows first; launch worker in background so the conductor
      // tick is not blocked for the whole Claude session.
      out = await resumeStalledMission(missionId, {
        actor: "director",
        response: "Director resumed after the worker went silent — no operator click required",
        dispatch: false,
        nowMs,
      });
    } catch (e) {
      out = { ok: false, error: String(e?.message || e) };
    }

    if (out?.ok) {
      state.delete(missionId);
      recovered.push({ missionId, try: s.tries, reset: out.reset });
      import("./assignment-dispatch.mjs")
        .then(({ dispatchReadyAssignments }) =>
          dispatchReadyAssignments(missionId, { actor: "director" }))
        .catch((e) => {
          console.log(`[director] silent-resume dispatch failed ${missionId}: ${e?.message || e}`);
        });
      continue;
    }

    if (s.tries >= MAX_TRIES) {
      s.exhausted = true;
      state.set(missionId, s);
      escalated.push({ missionId, tries: s.tries, error: out?.error || out?.detail });
    }
  }

  return { attempted, recovered, escalated, skipped, zombies };
}
