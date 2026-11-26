/**
 * WORK THAT IS DONE WHEN EVERY CHILD HAS A PATH.
 *
 * A stage work template carrying per-child paths (`participant_decisions`) is the family-level
 * question "choose each child's next path". Choosing a child's path IS the operational decision, so
 * the template's plain "the work is done" outcome is not the operator's to pick: the runtime records
 * it when the last child gets a path. What remains for the operator are the template's OTHER
 * configured outcomes — "Needs follow-up", say — which leave the children where they are.
 *
 * Which outcome is the runtime's is read from configuration, never named: the one outcome of this
 * template that completes the work and does nothing else (no movement, no status change, no new
 * work). None, or more than one, and the runtime takes none — the operator keeps the choice.
 */
import type {
    StageOperatingPlanV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

/** Rule targets that only conclude the work. Anything else is a choice with consequences. */
const COMPLETION_ONLY_TARGETS = new Set(["mark_stage_work_complete"]);

export function templateDecidesParticipants(template: Pick<StageWorkTemplateV1, "participant_decisions">): boolean {
    return (template.participant_decisions ?? []).some((d) => d.available !== false);
}

export function runtimeCompletionOutcomeKey(
    plan: Pick<StageOperatingPlanV1, "outcomes" | "outcome_rules">,
    template: Pick<StageWorkTemplateV1, "template_key" | "participant_decisions" | "outcome_refs">,
): string | null {
    if (!templateDecidesParticipants(template)) return null;
    const refs = template.outcome_refs?.map((r) => r.outcome_ref.trim()).filter(Boolean);
    const forTemplate = plan.outcomes.filter((o) => {
        if (refs && refs.length) return refs.includes(o.outcome_key);
        const scoped = o.work_template_key?.trim();
        return !scoped || scoped === template.template_key;
    });
    const candidates = forTemplate.filter((o) => {
        if (o.completes_work !== true) return false;
        const rules = (plan.outcome_rules ?? []).filter((r) => r.when_outcome_key?.trim() === o.outcome_key);
        const targets = rules.flatMap((r) => r.targets ?? []);
        return targets.every((t) => COMPLETION_ONLY_TARGETS.has(t.kind));
    });
    return candidates.length === 1 ? candidates[0]!.outcome_key : null;
}
