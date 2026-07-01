import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";

function effectLabelForRule(
    plan: StageOperatingPlanV1,
    whenOutcomeKey: string,
): string | null {
    const rule = plan.outcome_rules.find((r) => r.when_outcome_key === whenOutcomeKey);
    if (!rule) return null;

    const move = rule.targets.find((t) => t.kind === "move_to_stage" && t.stage_key?.trim());
    if (move?.stage_key) {
        return humanizeSnakeCaseToken(move.stage_key.trim());
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

    const nextWork = rule.targets.find((t) => t.kind === "create_next_work" && t.template_key?.trim());
    if (nextWork?.template_key) {
        const tpl = plan.work_templates.find((w) => w.template_key === nextWork.template_key);
        return tpl?.label?.trim() || humanizeSnakeCaseToken(nextWork.template_key.trim());
    }

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
