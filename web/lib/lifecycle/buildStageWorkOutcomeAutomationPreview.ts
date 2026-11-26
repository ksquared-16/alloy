import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";

function effectLabelForRule(
    plan: StageOperatingPlanV1,
    whenOutcomeKey: string,
): string | null {
    const rule = plan.outcome_rules.find((r) => r.when_outcome_key === whenOutcomeKey);
    if (!rule) return null;

    const move = rule.targets.find((t) => t.kind === "move_to_stage");
    if (move) {
        const stageKey = move.stage_key?.trim();
        if (stageKey) return humanizeSnakeCaseToken(stageKey);
        const transitionRef = move.transition_ref?.trim();
        if (transitionRef && plan.outgoing_transitions) {
            const transition = plan.outgoing_transitions.find((row) => row.transition_ref === transitionRef);
            if (transition?.label?.trim()) return transition.label.trim();
            if (transition?.target_stage_key?.trim()) {
                return humanizeSnakeCaseToken(transition.target_stage_key.trim());
            }
        }
    }

    const close = rule.targets.find(
        (t) =>
            t.kind === "update_family_case_status" &&
            (t.status_key === "closed" || t.disposition_key === "lost"),
    );
    if (close) return "Close Lead";

    const attention = rule.targets.find((t) => t.kind === "create_needs_attention");
    if (attention?.attention_reason?.trim()) {
        return `Needs attention: ${attention.attention_reason.trim()}`;
    }

    const nextWork = rule.targets.find(
        (t) =>
            (t.kind === "create_next_work" || t.kind === "reopen_work") && t.template_key?.trim(),
    );
    if (nextWork?.template_key) {
        const tpl = plan.work_templates.find((w) => w.template_key === nextWork.template_key);
        const label = tpl?.label?.trim() || humanizeSnakeCaseToken(nextWork.template_key.trim());
        if (nextWork.kind === "reopen_work") {
            return label.toLowerCase().endsWith(" work") ? `Continue ${label}` : `Continue ${label} work`;
        }
        return label;
    }

    if (rule.targets.some((t) => t.kind === "mark_stage_work_complete")) {
        return "Complete this work item";
    }

    // no_movement-only rules have no operator-facing side effect beyond stay/retry.
    return null;
}

/** Read-only automation preview for operator-facing Current Work surfaces. */
export function buildStageWorkOutcomeAutomationPreview(args: {
    plan: StageOperatingPlanV1;
    templateKey: string;
    limit?: number;
}): StageWorkOutcomeAutomationPreview[] {
    const limit = args.limit ?? 6;
    const out: StageWorkOutcomeAutomationPreview[] = [];
    const seen = new Set<string>();

    for (const outcome of args.plan.outcomes) {
        const tplKey = outcome.work_template_key?.trim();
        if (tplKey && tplKey !== args.templateKey) continue;

        const effect = effectLabelForRule(args.plan, outcome.outcome_key);
        if (!effect) continue;

        const dedupeKey = `${outcome.outcome_key}:${effect}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        out.push({
            outcome_key: outcome.outcome_key,
            outcome_label: outcome.label.trim() || outcome.outcome_key,
            effect_label: effect,
        });
        if (out.length >= limit) break;
    }

    return out;
}
