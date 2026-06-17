import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";

/** True when a layout refKey represents a status/lifecycle value column. */
export function isLayoutRuntimeStatusRefKey(refKey: string): boolean {
    return /(?:^|\.)(?:status|lifecycle_status|stage|outcome_status)(?:_key|_label|_name)?$/i.test(
        refKey.trim(),
    );
}

function looksLikeStatusKeyToken(value: string): boolean {
    const trimmed = value.trim();
    return /^[a-z][a-z0-9_]*$/i.test(trimmed) && trimmed.includes("_");
}

/** Prefer hydrated labels; humanize raw status keys for operator display. */
export function formatLayoutRuntimeStatusLabel(
    raw: unknown,
    options?: { refKey?: string; renderHint?: string | null },
): string | null {
    if (raw === undefined || raw === null || raw === "") return null;
    const text = String(raw).trim();
    if (!text || text === "—") return null;

    const shouldHumanize =
        options?.renderHint === "status"
        || (options?.refKey ? isLayoutRuntimeStatusRefKey(options.refKey) : false)
        || looksLikeStatusKeyToken(text);

    if (!shouldHumanize || !looksLikeStatusKeyToken(text)) return text;
    return humanizeSnakeCaseToken(text);
}
