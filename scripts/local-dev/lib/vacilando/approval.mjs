/**
 * Approval Runtime — the unified queue of everything that needs a human:
 * pending questions, pending reviews, merge approvals, promotion approvals.
 *
 * Source of truth per field:
 *   questions   → initiative.human_decisions[] that are still open
 *   reviews     → sprints whose initiative.state === "reviewing"
 *   merges      → sprints whose initiative.state === "merge_ready"
 *   promotions  → sprints whose initiative.state === "awaiting_promotion_approval"
 *                 (promotion is ALWAYS human — never auto — per doctrine)
 *
 * This runtime NEVER approves anything and never fabricates an item. It only
 * surfaces gates the authoritative state machines already declare open.
 *
 * Approvals are a PROJECT-WIDE queue: every initiative record is scanned, not
 * just the ones currently bound to a live slot. `slotByInitiative` attaches the
 * active slot when an initiative happens to be on the board.
 */
import { decisionIsOpen } from "./sprint.mjs";

export function projectApprovals(allInitiatives, slotByInitiative = new Map(), dispositions = {}) {
  const questions = [];
  const reviews = [];
  const merges = [];
  const promotions = [];

  for (const init of allInitiatives) {
    if (!init) continue;
    const bound = slotByInitiative.get(init.key) || {};
    const ctx = { sprint: bound.sprint || null, slot: bound.slot ?? null, initiative_key: init.key || null, title: init.title || init.key };

    for (const d of init.human_decisions || []) {
      if (!decisionIsOpen(d)) continue;
      questions.push({
        ...ctx,
        kind: "question",
        id: d.id || null,
        summary: d.question || "",
        why_it_matters: d.why_it_matters || "",
        options: Array.isArray(d.options) ? d.options : [],
        recommendation: d.recommendation || null,
        priority: d.parallel_work_ok === true ? "normal" : "high",
        source: `initiative:${ctx.initiative_key}/human_decisions`,
      });
    }

    if (init.state === "reviewing" && dispositions[init.key]?.disposition !== "approve") {
      reviews.push({ ...ctx, kind: "review", summary: `Review required — ${ctx.title}`, source: `initiative:${ctx.initiative_key}/state`, disposition: dispositions[init.key]?.disposition || null });
    }
    if (init.state === "merge_ready") {
      merges.push({ ...ctx, kind: "merge", summary: `Merge approval — ${ctx.title}`, pr: null, source: `initiative:${ctx.initiative_key}/state` });
    }
    if (init.state === "awaiting_promotion_approval") {
      promotions.push({ ...ctx, kind: "promotion", summary: `Promotion approval — ${ctx.title}`, source: `initiative:${ctx.initiative_key}/state` });
    }
  }

  const total = questions.length + reviews.length + merges.length + promotions.length;
  return {
    total,
    questions,
    reviews,
    merges,
    promotions,
    counts: {
      questions: questions.length,
      reviews: reviews.length,
      merges: merges.length,
      promotions: promotions.length,
    },
  };
}
