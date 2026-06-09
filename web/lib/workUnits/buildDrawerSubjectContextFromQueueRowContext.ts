/**
 * Map queue row `_queue_row_context.drawer_open` → drawer runtime `DrawerSubjectContext`.
 */

import type {
    DrawerSubjectContext,
    DrawerSubjectFocusMode,
    QueueRowContext,
} from "@/lib/workUnits/lifecycleSubjectContracts";

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function resolveDrawerSubjectFocusMode(
    drawerOpen: QueueRowContext["drawer_open"],
): DrawerSubjectFocusMode {
    if (drawerOpen.active_subject_group?.length) return "subject_group_highlight";
    const subjectType = drawerOpen.active_subject?.subject_type;
    if (subjectType && subjectType !== "case") return "subject_highlight";
    return "case_default";
}

function resolveLifecycleVisualStageKey(
    context: QueueRowContext,
    drawerOpen: QueueRowContext["drawer_open"],
): string {
    return (
        trimOrNull(drawerOpen.stage_focus_key)
        ?? trimOrNull(drawerOpen.active_subject?.stage_key)
        ?? trimOrNull(context.row_status_key)
        ?? ""
    );
}

/** Build drawer subject payload from queue row context — null when context or drawer_open absent. */
export function buildDrawerSubjectContextFromQueueRowContext(
    context: QueueRowContext | null | undefined,
): DrawerSubjectContext | null {
    if (!context?.drawer_open) return null;

    const drawerOpen = context.drawer_open;
    const active_subject_group =
        drawerOpen.active_subject_group?.length ? drawerOpen.active_subject_group : undefined;

    return {
        active_subject: drawerOpen.active_subject ?? undefined,
        active_subject_group,
        focus_mode: resolveDrawerSubjectFocusMode(drawerOpen),
        lifecycle_visual_stage_key: resolveLifecycleVisualStageKey(context, drawerOpen),
        stage_focus_label: trimOrNull(context.row_stage) ?? undefined,
        related_subjects: context.related_subjects_summary ?? [],
    };
}

/** Dev/diagnostic data attributes for opportunity drawer shell when subject context is wired. */
export function drawerSubjectContextDiagnosticAttrs(
    context: DrawerSubjectContext | null | undefined,
): Record<string, string> {
    if (!context) {
        return { "data-drawer-active-subject-present": "false" };
    }
    const attrs: Record<string, string> = {
        "data-drawer-active-subject-present": context.active_subject ? "true" : "false",
        "data-drawer-subject-focus-mode": context.focus_mode,
    };
    const subjectType = trimOrNull(context.active_subject?.subject_type);
    if (subjectType) attrs["data-drawer-active-subject-type"] = subjectType;
    const stageKey = trimOrNull(context.lifecycle_visual_stage_key);
    if (stageKey) attrs["data-drawer-stage-focus-key"] = stageKey;
    if (context.active_subject_group?.length) {
        attrs["data-drawer-active-subject-group-count"] = String(context.active_subject_group.length);
    }
    return attrs;
}
