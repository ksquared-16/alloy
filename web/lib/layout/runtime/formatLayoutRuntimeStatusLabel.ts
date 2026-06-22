import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import {
    ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY,
    ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY,
} from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";

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

type LayoutRuntimeStatusDomain = "child_enrollment" | "opportunity" | "generic";

function vocabularyForDomain(domain: LayoutRuntimeStatusDomain): Map<string, string> | null {
    if (domain === "child_enrollment") {
        return new Map(ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY.map((row) => [row.status_key, row.status_label]));
    }
    if (domain === "opportunity") {
        return new Map(ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY.map((row) => [row.status_key, row.status_label]));
    }
    return null;
}

function resolveStatusDomain(refKey: string | undefined): LayoutRuntimeStatusDomain {
    const normalized = normalizeRefKeyOnRead(refKey?.trim() ?? "");
    if (!normalized) return "generic";
    if (
        normalized.includes("outcome_status")
        || normalized.startsWith("inquiry_child.")
        || normalized === "child.status"
    ) {
        return "child_enrollment";
    }
    if (
        normalized.startsWith("opportunity.")
        || normalized === "status_key"
        || normalized === "lifecycle_status"
    ) {
        return "opportunity";
    }
    if (normalized.includes("child.") && normalized.includes("status")) return "child_enrollment";
    return "generic";
}

/** Prefer hydrated labels; resolve configured status vocabulary by field domain. */
export function formatLayoutRuntimeStatusLabel(
    raw: unknown,
    options?: { refKey?: string; renderHint?: string | null },
): string | null {
    if (raw === undefined || raw === null || raw === "") return null;
    const text = String(raw).trim();
    if (!text || text === "—") return null;

    const shouldFormat =
        options?.renderHint === "status"
        || (options?.refKey ? isLayoutRuntimeStatusRefKey(options.refKey) : false)
        || looksLikeStatusKeyToken(text);

    if (!shouldFormat) return text;

    const domain = resolveStatusDomain(options?.refKey);
    const vocabulary = vocabularyForDomain(domain);
    const fromVocabulary = vocabulary?.get(text);
    if (fromVocabulary) return fromVocabulary;

    if (domain === "child_enrollment" && looksLikeStatusKeyToken(text)) {
        const familyLabel = vocabularyForDomain("opportunity")?.get(text);
        if (familyLabel) return familyLabel;
    }

    if (!looksLikeStatusKeyToken(text)) return text;
    return humanizeSnakeCaseToken(text, vocabulary ? Object.fromEntries(vocabulary) : undefined);
}
