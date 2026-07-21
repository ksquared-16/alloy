/**
 * Activity Runtime — the event stream powering the live feed.
 *
 * The canonical toolkit keeps NO stored event log (the stranded Director
 * prototype had one; it is not on staging). Rather than invent a store, this
 * runtime PROJECTS an event stream from facts that already happened and are
 * independently observable:
 *
 *   commit    → real git commits per worktree (author, subject, time)
 *   created   → worker detail created_at   (via alloy-ro worker-detail)
 *   paused    → worker detail pause_recorded_at
 *   finished  → worker detail finished_at
 *
 * These are reads of git + governed metadata, composed and time-ordered — not a
 * parallel database. Replaying the same state yields the same feed. When a real
 * runtime event log lands (Phase 2), this projector swaps its source with no
 * change to the presentation contract.
 */
import { isoFromMs } from "./model.mjs";

export function projectActivity(sprintsCtx, limit = 20) {
  const events = [];

  for (const e of sprintsCtx) {
    for (const c of e.git_recent?.commits || []) {
      if (!c.at_ms) continue;
      events.push({
        at_ms: c.at_ms,
        at: c.at,
        kind: "commit",
        actor: e.provider || c.author,
        sprint: e.sprint,
        summary: `${shorten(c.subject, 72)}`,
        detail: { short: c.short, worktree: e.worktree },
        source: "git log",
      });
    }
    pushMetaEvent(events, e, "created_at", "sprint.created", () => `Sprint ${e.sprint} created`);
    pushMetaEvent(events, e, "pause_recorded_at", "worker.paused", () => `Worker paused on ${e.sprint}`);
    pushMetaEvent(events, e, "finished_at", "sprint.finished", () => `Sprint ${e.sprint} finished`);
  }

  events.sort((a, b) => (b.at_ms || 0) - (a.at_ms || 0));
  return events.slice(0, limit);
}

function pushMetaEvent(events, e, key, kind, summary) {
  const iso = e.detail?.[key];
  const ms = iso ? Date.parse(iso) : NaN;
  if (!iso || Number.isNaN(ms)) return;
  events.push({ at_ms: ms, at: iso, kind, actor: e.provider || null, sprint: e.sprint, summary: summary(iso), detail: { worktree: e.worktree }, source: `alloy-ro worker-detail:${key}` });
}

function shorten(s, n) {
  s = String(s || "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
