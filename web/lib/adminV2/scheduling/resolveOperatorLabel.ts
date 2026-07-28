/**
 * Operator-facing label resolution — never surface raw config/DB keys when a
 * registry label exists; missing labels use a safe placeholder (not the raw key).
 */

export const OPERATOR_LABEL_UNAVAILABLE = "Label unavailable";

export type LabeledOption = { key: string; label: string };

/**
 * Resolve a registry/config label for a stable key.
 * Returns `OPERATOR_LABEL_UNAVAILABLE` when the key is empty or unmatched —
 * never echoes the raw key to operators.
 */
export function resolveOperatorLabel(
    key: string | null | undefined,
    options: ReadonlyArray<LabeledOption> | null | undefined,
    fallback: string = OPERATOR_LABEL_UNAVAILABLE,
): string {
    const k = (key ?? "").trim();
    if (!k) return fallback;
    const hit = options?.find((o) => o.key === k);
    const label = hit?.label?.trim();
    if (label) return label;
    return fallback;
}

/** Space-mode keys used by Assignment Categories — operator copy only. */
const SPACE_MODE_LABELS: Record<string, string> = {
    any: "Any valid space",
    selected: "Selected spaces",
    program_match: "Spaces matching the selected Program",
};

export function resolveSpaceModeOperatorLabel(mode: string | null | undefined): string {
    const k = (mode ?? "").trim();
    if (!k) return OPERATOR_LABEL_UNAVAILABLE;
    return SPACE_MODE_LABELS[k] ?? OPERATOR_LABEL_UNAVAILABLE;
}
