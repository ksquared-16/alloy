/**
 * Editor helpers for work-template action / transition / outcome references.
 * Dirty-state paths must never throw on temporarily invalid refs.
 */

import type {
    StageWorkTemplateActionRefV1,
    StageWorkTemplateAlternatePathRefV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageWorkTemplateAlternatePathDraftRef = {
    kind: "transition" | "action";
    ref: string;
    override_label?: string;
};

export function workTemplatePrimaryActionRef(work: StageWorkTemplateV1): string | undefined {
    return work.primary_action?.action_ref?.trim() || undefined;
}

export function setWorkTemplatePrimaryActionRef(
    work: StageWorkTemplateV1,
    actionRef: string | null | undefined,
): StageWorkTemplateV1 {
    const ref = actionRef?.trim();
    if (!ref) {
        const next = { ...work };
        delete next.primary_action;
        return next;
    }
    return { ...work, primary_action: { action_ref: ref } };
}

export function workTemplateHelpfulActionRefs(work: StageWorkTemplateV1): string[] {
    return (work.helpful_actions ?? []).map((row) => row.action_ref.trim()).filter(Boolean);
}

export function setWorkTemplateHelpfulActionRefs(
    work: StageWorkTemplateV1,
    refs: string[],
): StageWorkTemplateV1 {
    const helpful_actions = refs
        .map((ref) => ref.trim())
        .filter(Boolean)
        .map((action_ref) => ({ action_ref }));
    return { ...work, helpful_actions };
}

export function addWorkTemplateHelpfulAction(
    work: StageWorkTemplateV1,
    actionRef: string,
): StageWorkTemplateV1 {
    const ref = actionRef.trim();
    if (!ref) return work;
    const existing = work.helpful_actions ?? [];
    if (existing.some((row) => row.action_ref === ref)) return work;
    return { ...work, helpful_actions: [...existing, { action_ref: ref }] };
}

export function removeWorkTemplateHelpfulAction(
    work: StageWorkTemplateV1,
    actionRef: string,
): StageWorkTemplateV1 {
    const ref = actionRef.trim();
    const helpful_actions = (work.helpful_actions ?? []).filter((row) => row.action_ref !== ref);
    return { ...work, helpful_actions };
}

export function reorderWorkTemplateHelpfulActions(
    work: StageWorkTemplateV1,
    refs: string[],
): StageWorkTemplateV1 {
    return setWorkTemplateHelpfulActionRefs(work, refs);
}

export function workTemplateAlternatePathDraftRefs(
    work: StageWorkTemplateV1,
): StageWorkTemplateAlternatePathDraftRef[] {
    return (work.alternate_paths ?? []).map((row) => {
        if ("transition_ref" in row && row.transition_ref?.trim()) {
            return {
                kind: "transition" as const,
                ref: row.transition_ref.trim(),
                ...(row.override_label?.trim() ? { override_label: row.override_label.trim() } : {}),
            };
        }
        const actionRef = (row as StageWorkTemplateActionRefV1).action_ref?.trim() ?? "";
        return {
            kind: "action" as const,
            ref: actionRef,
            ...((row as StageWorkTemplateActionRefV1).override_label?.trim()
                ? { override_label: (row as StageWorkTemplateActionRefV1).override_label!.trim() }
                : {}),
        };
    }).filter((row) => row.ref.length > 0);
}

export function setWorkTemplateAlternatePathDraftRefs(
    work: StageWorkTemplateV1,
    refs: StageWorkTemplateAlternatePathDraftRef[],
): StageWorkTemplateV1 {
    const alternate_paths: StageWorkTemplateAlternatePathRefV1[] = refs
        .map((row) => {
            const ref = row.ref.trim();
            if (!ref) return null;
            if (row.kind === "transition") {
                const entry: StageWorkTemplateAlternatePathRefV1 = { transition_ref: ref };
                if (row.override_label?.trim()) entry.override_label = row.override_label.trim();
                return entry;
            }
            const entry: StageWorkTemplateActionRefV1 = { action_ref: ref };
            if (row.override_label?.trim()) entry.override_label = row.override_label.trim();
            return entry;
        })
        .filter((row): row is StageWorkTemplateAlternatePathRefV1 => row != null);
    return { ...work, alternate_paths };
}

export function workTemplateOutcomeRefs(work: StageWorkTemplateV1): string[] {
    return (work.outcome_refs ?? []).map((row) => row.outcome_ref.trim()).filter(Boolean);
}

export function setWorkTemplateOutcomeRefs(
    work: StageWorkTemplateV1,
    refs: string[],
): StageWorkTemplateV1 {
    const outcome_refs = refs
        .map((ref) => ref.trim())
        .filter(Boolean)
        .map((outcome_ref) => ({ outcome_ref }));
    return { ...work, outcome_refs };
}

export function reorderWorkTemplateOutcomeRefs(
    work: StageWorkTemplateV1,
    refs: string[],
): StageWorkTemplateV1 {
    return setWorkTemplateOutcomeRefs(work, refs);
}

/** Mark a bucket explicitly empty (persisted as [] — not undefined). */
export function markWorkTemplateHelpfulActionsEmpty(work: StageWorkTemplateV1): StageWorkTemplateV1 {
    return { ...work, helpful_actions: [] };
}

export function markWorkTemplateAlternatePathsEmpty(work: StageWorkTemplateV1): StageWorkTemplateV1 {
    return { ...work, alternate_paths: [] };
}

export function markWorkTemplateOutcomeRefsEmpty(work: StageWorkTemplateV1): StageWorkTemplateV1 {
    return { ...work, outcome_refs: [] };
}
