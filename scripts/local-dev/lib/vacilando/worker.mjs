/**
 * Worker Runtime — projects the provider (Claude / Cursor) working each slot:
 * status, health, ownership, and current work.
 *
 * Source of truth per field:
 *   provider/slot/port → alloy-ro worker-status
 *   lifecycle/status   → alloy-ro agent-status (agent_status, lifecycle)
 *   ownership          → metadata .env (ALLOY_PROVIDER_SESSION_ID, path)
 *   role               → metadata ALLOY_AGENT_ROLE (permanent slot role)
 *   health             → DERIVED from agent_status + branch drift + git state
 *   last_activity      → last git commit time in the worktree
 *
 * Only REAL providers are projected — one per occupied slot. Advisory/non-slot
 * "workers" shown in the mockup (e.g. an architect persona) have no
 * authoritative source and are deliberately NOT invented (see snapshot gaps).
 */
import { glyphFor } from "./model.mjs";

/** Deterministic health from real signals. */
export function deriveHealth(e) {
  if (e.lifecycle === "paused" || e.detail?.pause_recorded_at) return "paused";
  if (e.detail?.finished_at) return "finished";
  const drift = e.branch && e.branch_expected && e.branch !== e.branch_expected;
  if (drift) return "attention"; // on the wrong branch for its slot
  if (e.agent_status && e.agent_status !== "active") return "attention";
  return "healthy";
}

export function projectWorker(e) {
  return {
    id: `${e.provider}-${e.slot}`,
    provider: e.provider,
    slot: e.slot,
    glyph: glyphFor(e.worktree),
    role: e.detail?.role || null,
    lifecycle: e.lifecycle || null,
    agent_status: e.agent_status || null,
    health: deriveHealth(e),
    current_sprint: e.sprint,
    current_sprint_worktree: e.worktree,
    ownership: {
      worktree_path: e.path || null,
      session_id: e.detail?.session_id || null,
      opened_at: e.detail?.opened_at || null,
      created_at: e.detail?.created_at || null,
    },
    server: e.server,
    port: e.port,
    last_activity_ms: e.git_recent?.last_ms ?? null,
    last_commit: e.git_recent?.commits?.[0]
      ? { short: e.git_recent.commits[0].short, subject: e.git_recent.commits[0].subject }
      : null,
  };
}

export function projectWorkers(sprintsCtx) {
  const running = sprintsCtx.filter((e) => e.provider).map(projectWorker).sort((a, b) => a.slot - b.slot);
  return running;
}

/** Headline counts for the metric strip. */
export function workerCounts(workers, maxSlots) {
  const active = workers.filter((w) => w.health === "healthy" && w.agent_status === "active").length;
  return { running: active, total: maxSlots };
}
