/**
 * Shared Process Summary metric presentation — builder preview and runtime use the same rules.
 */

/** Consistent empty metric placeholder when a calculation resolves without a value. */
export const PROCESS_SUMMARY_METRIC_EMPTY = "—";

export type FormattedProcessSummaryMetric =
    | { kind: "value"; title: string; displayValue: string }
    | { kind: "empty"; title: string };

function normalizePhrase(value: string | null | undefined): string {
    return (value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

export function sameMetricPhrase(a: string | null | undefined, b: string | null | undefined): boolean {
    const left = normalizePhrase(a);
    const right = normalizePhrase(b);
    return Boolean(left && right && left === right);
}

/** True when the resolved metric has a displayable numeric/formatted result. */
export function metricHasDisplayValue(value: string | null | undefined): boolean {
    if (value == null) return false;
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== "—" && trimmed !== "-";
}

/**
 * Format one Process Summary metric line block.
 * Configured title wins; definition label is fallback only — never shown together with title.
 */
export function formatProcessSummaryMetric(args: {
    configuredTitle: string | null | undefined;
    definitionLabel: string | null | undefined;
    value: string | null | undefined;
}): FormattedProcessSummaryMetric {
    const title = args.configuredTitle?.trim() || args.definitionLabel?.trim() || "Metric";
    if (metricHasDisplayValue(args.value)) {
        return { kind: "value", title, displayValue: args.value!.trim() };
    }
    return { kind: "empty", title };
}

/** Supporting metric with a value uses compact `title: value`; empty uses title + em dash on separate lines. */
export function formatSupportingMetricInline(
    formatted: FormattedProcessSummaryMetric,
): string {
    if (formatted.kind === "value") {
        return `${formatted.title}: ${formatted.displayValue}`;
    }
    return `${formatted.title}\n${PROCESS_SUMMARY_METRIC_EMPTY}`;
}
