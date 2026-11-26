"use client";

import type { FieldSurfaceAvailabilityBadge } from "@/lib/fields/fieldSurfaceAvailability";

export type FieldSurfaceAvailabilityBadgesProps = {
    badges: readonly FieldSurfaceAvailabilityBadge[];
    compact?: boolean;
    testId?: string;
};

export default function FieldSurfaceAvailabilityBadges({
    badges,
    compact = false,
    testId,
}: FieldSurfaceAvailabilityBadgesProps) {
    return (
        <ul
            className={["flex flex-wrap gap-1.5", compact ? "" : "max-w-md"].join(" ")}
            data-testid={testId}
        >
            {badges.map((badge) => (
                <li key={badge.surface}>
                    <span
                        className={[
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-snug",
                            badge.status === "available"
                                ? "border-alloy-pine/30 bg-alloy-pine/[0.08] text-alloy-midnight/80"
                                : "border-alloy-stone/25 bg-alloy-stone/[0.06] text-alloy-midnight/45",
                        ].join(" ")}
                        title={badge.reason ?? badge.label}
                        data-field-surface-badge={badge.surface}
                        data-field-surface-status={badge.status}
                    >
                        {badge.label}
                    </span>
                </li>
            ))}
        </ul>
    );
}
