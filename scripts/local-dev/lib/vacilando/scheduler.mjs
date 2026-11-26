import { isManagedSlot, managedSlots } from "./managed-slots.mjs";
/**
 * Vacilando Runtime — Scheduler (V1, deterministic, no AI).
 *
 * Turns machine pressure + slot/worker state into eligibility, recommendations,
 * and a queue order. It NEVER auto-pauses active real work; it recommends and
 * (optionally, behind a disabled-by-default policy) could apply. Every output is
 * derived deterministically from configured thresholds — nothing is guessed.
 */

// Workload profiles: expected pressure + concurrency safety.
export const PROFILES = {
  "provider-only": { cpu: "low", mem: "low", server: false, concurrency_safe: true },
  "lightweight": { cpu: "low", mem: "low", server: false, concurrency_safe: true },
  "local-server": { cpu: "med", mem: "med", server: true, concurrency_safe: true },
  "build-test": { cpu: "high", mem: "high", server: false, concurrency_safe: false },
  "heavy-compile": { cpu: "high", mem: "high", server: false, concurrency_safe: false },
  "browser-qa": { cpu: "med", mem: "high", server: true, concurrency_safe: false },
};

/** Derive a coarse execution state for a sprint + its resource row. */
function workerState(sp, res) {
  if (sp.status === "paused") return "paused";
  if (sp.status === "blocked" || sp.question_count > 0) return "blocked";
  if (sp.status === "review") return "waiting";
  const running = res?.server_process || sp.server === "running";
  if (!running && !res?.server_process) return "idle"; // assigned but no active process
  return "active";
}

/**
 * schedule(snapshot, resources[, queue]) → deterministic decision.
 */
export function schedule(snapshot, resources, queue = []) {
  const o = resources?.overall || {};
  const pressure = o.slots?.pressure || "ok";
  const sprints = snapshot?.sprints || [];
  const occupied = new Set(sprints.map((s) => s.slot));
  const freeSlots = managedSlots().filter((n) => !occupied.has(n));

  const states = sprints.map((sp) => ({ slot: sp.slot, title: sp.title, state: workerState(sp, (resources?.workers || []).find((w) => w.slot === sp.slot)) }));
  const idle = states.filter((s) => s.state === "idle");
  const paused = states.filter((s) => s.state === "paused");

  const recs = [];
  const may_start = pressure !== "high" && (freeSlots.length > 0 || idle.length > 0);

  if (pressure === "high") {
    recs.push({ kind: "block", text: "High machine pressure — do not start a new worker. Pause or end an idle worker first." });
  } else if (pressure === "elevated") {
    recs.push({ kind: "caution", text: "Elevated pressure — start at most one lightweight (provider-only) worker; avoid build/QA profiles." });
  } else if (freeSlots.length) {
    recs.push({ kind: "ok", text: `Safe to start a worker on slot ${freeSlots[0]} (${freeSlots.length} free).` });
  } else {
    recs.push({ kind: "info", text: "All slots occupied — end or pause a worker to free capacity." });
  }
  for (const s of idle) recs.push({ kind: "reclaim", text: `Slot ${s.slot} has no active process but stays assigned — close it to free capacity.`, slot: s.slot });
  if (o.swap?.used_mb && o.swap.total_mb && o.swap.used_mb / o.swap.total_mb > 0.8) {
    recs.push({ kind: "caution", text: `Swap is ${Math.round((o.swap.used_mb / o.swap.total_mb) * 100)}% full — memory is committed; prefer closing idle workers over starting new ones.` });
  }

  return {
    auto_scheduling: false, // disabled by default; recommendations only
    pressure,
    may_start,
    free_slots: freeSlots,
    recommended_slot: pressure === "high" ? null : (freeSlots[0] ?? idle[0]?.slot ?? null),
    states,
    counts: {
      active: states.filter((s) => s.state === "active").length,
      waiting: states.filter((s) => s.state === "waiting").length,
      paused: paused.length,
      idle: idle.length,
      blocked: states.filter((s) => s.state === "blocked").length,
      queued: queue.length,
      available: freeSlots.length,
    },
    queue,
    recommendations: recs,
  };
}
