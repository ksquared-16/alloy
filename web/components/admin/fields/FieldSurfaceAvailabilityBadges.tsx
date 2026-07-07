"use client";

import type { FieldSurfaceAvailabilityRow } from "@/lib/fields/fieldSurfaceAvailability";
import { FIELD_CONSUMER_SURFACE_LABELS } from "@/lib/fields/fieldSurfaceAvailability";

type Props = {
    rows: readonly FieldSurfaceAvailabilityRow[];
    compact?: boolean;
};

function badgeClass(status: FieldSurfaceAvailabilityRow["status"]): string {
    return status === "available"
        ? "border-alloy-pine/30 bg-alloy-pine/[0.08] text-alloy-pine"
        : "border-alloy-stone/35 bg-alloy-stone/[0.06] text-alloy-midnight/55";
}

export default function FieldSurfaceAvailabilityBadges({ rows, compact = false }: Props) {
    const available = rows.filter((r) => r.status === "available");
    const unavailable = rows.filter((r) => r.status === "unavailable");

    return (
        <div className="space-y-2" data-testid="field-surface-availability">
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
