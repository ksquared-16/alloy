"use client";

import type { FieldSurfaceAvailabilityRow } from "@/lib/fields/fieldSurfaceAvailability";
import { FIELD_CONSUMER_SURFACE_LABELS } from "@/lib/fields/fieldSurfaceAvailability";

type Props = {
    rows: readonly FieldSurfaceAvailabilityRow[];
    compact?: boolean;
    /** When true, only surfaces unavailable reasons are shown — silence is success. */
    unavailableOnly?: boolean;
};

function badgeClass(status: FieldSurfaceAvailabilityRow["status"]): string {
    return status === "available"
        ? "border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
        : "border-alloy-stone/35 bg-alloy-stone/[0.06] text-alloy-midnight/55";
}

export default function FieldSurfaceAvailabilityBadges({
    rows,
    compact = false,
    unavailableOnly = false,
}: Props) {
    const available = rows.filter((r) => r.status === "available");
    const unavailable = rows.filter((r) => r.status === "unavailable");

    if (unavailableOnly) {
        if (unavailable.length === 0) return null;
        return (
            <ul className="space-y-1 text-[11px] leading-snug text-alloy-midnight/55" data-testid="field-surface-availability">
                {unavailable.map((row) => (
                    <li key={row.surface} data-surface-unavailable={row.surface}>
                        <span className="font-medium text-alloy-midnight/70">
                            {FIELD_CONSUMER_SURFACE_LABELS[row.surface]}:
                        </span>{" "}
                        {row.reason}
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div className="space-y-2" data-testid="field-surface-availability">
            {!compact ? (
                <div className="flex flex-wrap gap-1.5">
                    {available.map((row) => (
                        <span
                            key={row.surface}
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeClass("available")}`}
                            title={row.reason}
                            data-surface-available={row.surface}
                        >
                            {FIELD_CONSUMER_SURFACE_LABELS[row.surface]}
                        </span>
                    ))}
                </div>
            ) : null}
            {!compact && unavailable.length > 0 ? (
                <ul className="space-y-1 text-[11px] leading-snug text-alloy-midnight/55">
                    {unavailable.map((row) => (
                        <li key={row.surface} data-surface-unavailable={row.surface}>
                            <span className="font-medium text-alloy-midnight/70">
                                {FIELD_CONSUMER_SURFACE_LABELS[row.surface]}:
                            </span>{" "}
                            {row.reason}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
