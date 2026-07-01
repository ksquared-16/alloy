import { isUuidLike } from "@/lib/admin/overviewRelationshipLabels";
import { opportunityDisplayLocationFromRecord } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import { logDrawerRawValueGuard } from "@/lib/perf/drawerPresentationGatePerf";

/** Internal snake_case keys and UUIDs must never appear as operator-facing labels. */
export function isRawInternalDisplayValue(value: unknown): boolean {
    if (value == null) return true;
    const t = String(value).trim();
    if (!t) return true;
    if (isUuidLike(t)) return true;
    if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(t)) return true;
    return false;
}

export function displaySafeLabel(
    value: unknown,
    opts?: { field?: string; suppressLog?: boolean }
): string | null {
    const t = value == null ? "" : String(value).trim();
    if (!t || isRawInternalDisplayValue(t)) {
        if (t && opts?.field && !opts.suppressLog) {
            logDrawerRawValueGuard({ field: opts.field, raw_value: t, suppressed: true });
        }
        return null;
    }
    return t;
}

export function opportunityStatusDisplayLabelSafe(
    record: Record<string, unknown>,
    fallbackLabel?: string | null
): string | null {
    const fromRecord = displaySafeLabel(record._status_display, { field: "status_display" });
    if (fromRecord) return fromRecord;
    const fromFallback = displaySafeLabel(fallbackLabel, { field: "status_preview", suppressLog: true });
    if (fromFallback) return fromFallback;
    const stage = displaySafeLabel(record._pipeline_stage_name ?? record._stage_name, {
        field: "pipeline_stage",
    });
    if (stage) return stage;
    return null;
}

export function opportunityLocationDisplayLabelSafe(
    record: Record<string, unknown>,
    fallbackLabel?: string | null
): string | null {
    const fromFallback = displaySafeLabel(fallbackLabel, { field: "location_preview", suppressLog: true });
    if (fromFallback) return fromFallback;

    const resolved = opportunityDisplayLocationFromRecord(record);
    if (resolved.kind === "none") return null;

    const childLabels = resolved.locations
        .map((loc) => displaySafeLabel(loc.name, { field: "location_child" }))
        .filter((l): l is string => l != null);
    if (childLabels.length === 1) return childLabels[0]!;
    if (resolved.kind === "multiple") {
        const multi = displaySafeLabel(resolved.label, { field: "location_multiple" });
        return multi;
    }
    return displaySafeLabel(resolved.label, { field: "location_label" });
}
