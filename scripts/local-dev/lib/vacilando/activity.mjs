/**
 * Activity Runtime — the event stream powering the live feed.
 *
 * The canonical toolkit keeps NO stored event log (the stranded Director
 * prototype had one; it is not on staging). Rather than invent a store, this
 * runtime PROJECTS an event stream from facts that already happened and are
 * independently observable:
 *
 *   commit    → real git commits per worktree (author, subject, time)
 *   created   → worker metadata ALLOY_CREATED_AT
 *   paused    → worker metadata ALLOY_PAUSE_RECORDED_AT
 *   finished  → worker metadata ALLOY_FINISHED_AT
 *   evidence  → newest evidence artifact mtime per worktree
 *
 * These are reads of git + filesystem truth, composed and time-ordered — not a
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
    pushMetaEvent(events, e, "ALLOY_CREATED_AT", "sprint.created", (t) => `Sprint ${e.sprint} created`);
    pushMetaEvent(events, e, "ALLOY_PAUSE_RECORDED_AT", "worker.paused", () => `Worker paused on ${e.sprint}`);
    pushMetaEvent(events, e, "ALLOY_FINISHED_AT", "sprint.finished", () => `Sprint ${e.sprint} finished`);
    if (e.evidence?.newest_ms) {
      events.push({
        at_ms: e.evidence.newest_ms,
        at: isoFromMs(e.evidence.newest_ms),
        kind: "evidence",
        actor: e.provider || null,
        sprint: e.sprint,
        summary: `New verification evidence (${e.evidence.count} artifact${e.evidence.count === 1 ? "" : "s"})`,
        detail: { worktree: e.worktree },
        source: "evidence dir mtime",
      });
    }
  }

  events.sort((a, b) => (b.at_ms || 0) - (a.at_ms || 0));
  return events.slice(0, limit);
}

function pushMetaEvent(events, e, key, kind, summary) {
  const iso = e.meta?.[key];
  const ms = iso ? Date.parse(iso) : NaN;
  if (!iso || Number.isNaN(ms)) return;
  events.push({ at_ms: ms, at: iso, kind, actor: e.provider || null, sprint: e.sprint, summary: summary(iso), detail: { worktree: e.worktree }, source: `metadata:${key}` });
}

function shorten(s, n) {
  s = String(s || "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
