/**
 * Work Template execution mode — derived from explicit config + Primary Action presence.
 *
 * Product contract:
 * - direct_action: Work Template has an executable Primary Action
 * - outcome_led: Work Template intentionally has no Primary Action; Record Outcome leads
 *
 * Never infer from stage names or work labels.
 */

import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type WorkTemplateExecutionMode = "direct_action" | "outcome_led";

export function resolveWorkTemplateExecutionMode(
    work: Pick<StageWorkTemplateV1, "primary_action" | "execution_mode"> | null | undefined,
): WorkTemplateExecutionMode {
    if (!work) return "outcome_led";
    const explicit = work.execution_mode;
    if (explicit === "direct_action" || explicit === "outcome_led") return explicit;
    return work.primary_action?.action_ref?.trim() ? "direct_action" : "outcome_led";
}

export function setWorkTemplateExecutionMode(
    work: StageWorkTemplateV1,
    mode: WorkTemplateExecutionMode,
    primaryActionRef?: string | null,
): StageWorkTemplateV1 {
    if (mode === "outcome_led") {
        const next: StageWorkTemplateV1 = { ...work, execution_mode: "outcome_led" };
        delete next.primary_action;
        return next;
    }
    const ref = primaryActionRef?.trim() || work.primary_action?.action_ref?.trim() || "";
    const next: StageWorkTemplateV1 = { ...work, execution_mode: "direct_action" };
    if (ref) {
        next.primary_action = { action_ref: ref };
    } else {
        delete next.primary_action;
    }
    return next;
}

export function workTemplateExecutionModeLabel(mode: WorkTemplateExecutionMode): string {
    return mode === "direct_action" ? "Direct action" : "Outcome-led";
}
