/**
 * Centralized Business Process display labels for Work Items — never expose raw UUIDs.
 */

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const WORK_ITEM_BP_FALLBACK_PROCESS_LABEL = "Business process";

function humanizeKey(key: string): string {
    const cleaned = key.replace(/[_-]+/g, " ").trim();
    if (!cleaned) return key;
    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isUuidLike(value: string | null | undefined): boolean {
    const trimmed = value?.trim();
    if (!trimmed) return false;
    return UUID_RE.test(trimmed);
}

export function resolveWorkItemBpDisplayLabel(
    processKey: string | null | undefined,
    processLabels?: Record<string, string> | null,
    fallbackLabel = WORK_ITEM_BP_FALLBACK_PROCESS_LABEL,
): string {
    const key = processKey?.trim();
    if (!key) return "General work";

    const catalogLabel = processLabels?.[key]?.trim();
    if (catalogLabel && !isUuidLike(catalogLabel)) return catalogLabel;

    if (isUuidLike(key)) return fallbackLabel;

    const humanized = humanizeKey(key);
    if (isUuidLike(humanized.replace(/\s/g, ""))) return fallbackLabel;
    return humanized || fallbackLabel;
}
