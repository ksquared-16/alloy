import type { OiOrgCalcTarget } from "@/lib/metrics/oiOrgCalcMeasurements";

export function formatOiOrgCalcTargetLabel(
    target: OiOrgCalcTarget | null | undefined,
    unit: "seats" | "percent" | "children" = "seats",
): string {
    if (!target) return "No goal";
    if (target.kind === "count_min") {
        if (unit === "percent") return `Warn below ${target.value}%`;
        if (unit === "children") return `Warn below ${target.value} children`;
        return `Warn below ${target.value} seats`;
    }
    return `Healthy between ${target.min}% and ${target.max}%`;
}

export function oiOrgCalcTargetForCountMin(
    target: OiOrgCalcTarget | null | undefined,
): { kind: "count_min"; value: number } | null {
    return target?.kind === "count_min" ? target : null;
}

export function oiOrgCalcTargetForRateRange(
    target: OiOrgCalcTarget | null | undefined,
): { kind: "rate_range"; min: number; max: number } | null {
    return target?.kind === "rate_range" ? target : null;
}
