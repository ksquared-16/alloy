"use client";

import {
    groupReadinessGapsByLevel,
    readinessDisplayReadyMessage,
} from "@/lib/completion/readinessDisplayPresentation";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

type Props = {
    readiness?: ReadinessResult | null;
    className?: string;
    compact?: boolean;
    title?: string;
};

/**
 * Read-only readiness gaps grouped by Recommended / Required / Enforced.
 * Gracefully renders nothing when readiness is absent.
 */
export default function OperationalReadinessGapsPanel({
    readiness,
    className = "",
    compact = false,
    title = "Required Information",
}: Props) {
    if (!readiness) return null;

    const groups = groupReadinessGapsByLevel(readiness);
    const ready = readiness.ok && groups.length === 0;

    return (
        <section
            className={`rounded-md border border-alloy-forge/12 bg-white/90 px-3 py-2.5 ${className}`}
            data-operational-readiness-panel="true"
            data-operational-readiness-state={ready ? "ready" : "gaps"}
            aria-label={title}
        >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/55">{title}</p>

            {ready ? (
                <p
                    className="mt-1 text-[11px] leading-snug text-alloy-pine"
                    data-operational-readiness-ready="true"
                >
                    {readinessDisplayReadyMessage()}
                </p>
            ) : (
                <div className="mt-2 space-y-2" data-operational-readiness-groups="true">
                    {groups.map((group) => (
                        <div
                            key={group.level}
                            data-operational-readiness-level={group.level}
                            data-operational-readiness-group="true"
                        >
                            <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/55">
                                {group.heading}
                            </p>
                            {!compact ? (
                                <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/45">
                                    {group.helper}
                                </p>
                            ) : null}
                            <ul className="mt-1 space-y-0.5">
                                {group.gaps.map((gap) => (
                                    <li
                                        key={`${group.level}-${gap.requirement_id}-${gap.label}`}
                                        className="text-[11px] leading-snug text-alloy-midnight/75"
                                        data-operational-readiness-gap="true"
                                        data-operational-readiness-gap-level={gap.level}
                                    >
                                        <span className="font-medium text-alloy-midnight">{gap.label}</span>
                                        {gap.missing_reason && !compact ? (
                                            <span className="text-alloy-midnight/50"> — {gap.missing_reason}</span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
