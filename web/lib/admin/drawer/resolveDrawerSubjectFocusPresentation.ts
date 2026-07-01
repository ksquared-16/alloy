import type { DrawerSubjectContext } from "@/lib/workUnits/lifecycleSubjectContracts";

export type DrawerSubjectFocusPresentation = {
    showFocusStrip: boolean;
    stripLabel: string | null;
    stageFocusLabel: string | null;
    lifecycleStageFocusKey: string | null;
    shouldOverrideLifecycleRail: boolean;
    highlightSubjectIds: string[];
    dataAttributes: Record<string, string>;
};

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function humanizeStageKey(key: string): string {
    const t = key.trim();
    if (!t) return "";
    return t
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveStageFocusLabel(context: DrawerSubjectContext): string | null {
    const explicit = trimOrNull(context.stage_focus_label);
    if (explicit) return explicit;
    const key = trimOrNull(context.lifecycle_visual_stage_key);
    return key ? humanizeStageKey(key) : null;
}

function collectHighlightSubjectIds(context: DrawerSubjectContext): string[] {
    const ids = new Set<string>();
    const add = (value: unknown) => {
        const t = trimOrNull(value);
        if (t) ids.add(t);
    };

    if (context.focus_mode === "subject_group_highlight" && context.active_subject_group?.length) {
        for (const subject of context.active_subject_group) {
            add(subject.subject_id);
        }
    } else if (
        context.focus_mode === "subject_highlight"
        && context.active_subject
        && context.active_subject.subject_type !== "case"
    ) {
        add(context.active_subject.subject_id);
    }

    for (const related of context.related_subjects ?? []) {
        const matchesGroup =
            context.focus_mode === "subject_group_highlight"
            && context.active_subject_group?.some((s) => s.subject_id === related.subject_id);
        const matchesActive =
            context.focus_mode === "subject_highlight"
            && context.active_subject?.subject_id === related.subject_id;
        if (matchesGroup || matchesActive) {
            add(related.subject_id);
        }
    }

    return [...ids];
}

function buildStripLabel(context: DrawerSubjectContext, stageLabel: string | null): string | null {
    const stagePart = stageLabel ?? trimOrNull(context.lifecycle_visual_stage_key);

    if (context.focus_mode === "subject_group_highlight" && context.active_subject_group?.length) {
        const count = context.active_subject_group.length;
        const childWord = count === 1 ? "child" : "children";
        return stagePart ? `${count} ${childWord} — ${stagePart}` : `${count} ${childWord} in focus`;
    }

    if (
        context.focus_mode === "subject_highlight"
        && context.active_subject
        && context.active_subject.subject_type !== "case"
    ) {
        const name =
            trimOrNull(
                context.related_subjects?.find((r) => r.subject_id === context.active_subject?.subject_id)?.display_name,
            )
            ?? trimOrNull(context.active_subject.subject_id);
        return stagePart ? `Focused: ${name} — ${stagePart}` : `Focused: ${name}`;
    }

    return null;
}

/** Visible drawer subject focus — no strip for case_default / missing context. */
export function resolveDrawerSubjectFocusPresentation(
    context: DrawerSubjectContext | null | undefined,
): DrawerSubjectFocusPresentation {
    const empty: DrawerSubjectFocusPresentation = {
        showFocusStrip: false,
        stripLabel: null,
        stageFocusLabel: null,
        lifecycleStageFocusKey: null,
        shouldOverrideLifecycleRail: false,
        highlightSubjectIds: [],
        dataAttributes: { "data-drawer-subject-focus-visible": "false" },
    };

    if (!context) return empty;

    const stageFocusLabel = resolveStageFocusLabel(context);
    const lifecycleStageFocusKey = trimOrNull(context.lifecycle_visual_stage_key);
    const shouldOverrideLifecycleRail =
        context.focus_mode === "subject_highlight" || context.focus_mode === "subject_group_highlight";
    const stripLabel = buildStripLabel(context, stageFocusLabel);
    const showFocusStrip = Boolean(stripLabel);
    const highlightSubjectIds = shouldOverrideLifecycleRail ? collectHighlightSubjectIds(context) : [];

    const dataAttributes: Record<string, string> = {
        "data-drawer-subject-focus-visible": showFocusStrip ? "true" : "false",
        "data-drawer-subject-focus-mode": context.focus_mode,
    };
    if (lifecycleStageFocusKey) dataAttributes["data-drawer-stage-focus-key"] = lifecycleStageFocusKey;
    const activeType = trimOrNull(context.active_subject?.subject_type);
    if (activeType) dataAttributes["data-drawer-active-subject-type"] = activeType;
    const activeId = trimOrNull(context.active_subject?.subject_id);
    if (activeId) dataAttributes["data-drawer-active-subject-id"] = activeId;
    if (context.active_subject_group?.length) {
        dataAttributes["data-drawer-active-subject-group-count"] = String(context.active_subject_group.length);
    }
    if (highlightSubjectIds.length) {
        dataAttributes["data-drawer-highlight-subject-ids"] = highlightSubjectIds.join(",");
    }

    return {
        showFocusStrip,
        stripLabel,
        stageFocusLabel,
        lifecycleStageFocusKey,
        shouldOverrideLifecycleRail,
        highlightSubjectIds,
        dataAttributes,
    };
}

/** Whether an inquiry-child row should receive queue-row subject highlight styling. */
export function inquiryChildRowMatchesSubjectFocus(
    row: { person_id?: string | null; customer_member_id?: string | null; ocm_id?: string | null; id?: string | null },
    highlightSubjectIds: string[],
): boolean {
    if (!highlightSubjectIds.length) return false;
    const candidates = [
        row.person_id,
        row.customer_member_id,
        row.ocm_id,
        row.id,
    ].map((v) => trimOrNull(v));
    return candidates.some((id) => id && highlightSubjectIds.includes(id));
}
