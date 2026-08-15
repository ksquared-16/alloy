"use client";

/**
 * Cohort tabs + local filter — the section's controls, shared by Staff and Children.
 *
 * ── LOCAL FILTER, NOT A SECOND SEARCH ──
 *
 * The text box filters the cohort ALREADY LOADED, client-side. It is presentation, not retrieval:
 * Global Search remains the one identity index, and building a second one here would give the
 * platform two places to disagree about who exists. Search answers "I know who I'm looking for";
 * Records answers "show me the cohort I need to review" — and once that cohort is on screen,
 * narrowing it is a display concern.
 */

import type { RecordCohort } from "@/lib/adminV2/records/recordCohorts";
import { cohortCount } from "@/lib/adminV2/records/recordCohorts";
import { WS_FIELD_SEARCH_CHROME } from "@/components/workspace/workspaceTokens";

export default function RecordsCohortBar<T>({
    cohorts,
    activeCohortKey,
    onCohortChange,
    records,
    activeCohortTotal,
    filter,
    onFilterChange,
    filterPlaceholder,
    trailing,
}: {
    cohorts: readonly RecordCohort<T>[];
    activeCohortKey: string;
    onCohortChange: (key: string) => void;
    /**
     * The COMPLETE population, for surfaces that load it (Staff). Counts are derived from it.
     * Omit it when membership is server-owned — see `activeCohortTotal`.
     */
    records?: readonly T[];
    /**
     * The active cohort's true total, for server-owned surfaces (Children).
     *
     * Only the ACTIVE cohort has one: the server answered for that cohort alone. The others show NO
     * count rather than a page length dressed as a total — an inaccurate count is worse than none,
     * because it looks authoritative.
     */
    activeCohortTotal?: number;
    filter: string;
    onFilterChange: (value: string) => void;
    filterPlaceholder: string;
    /** Section command (e.g. Add staff). Kept out of the body — this is chrome. */
    trailing?: React.ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 px-1 pb-2" data-records-cohort-bar="true">
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Record cohorts">
                {cohorts.map((cohort) => {
                    const active = cohort.key === activeCohortKey;
                    const count = records
                        ? cohortCount(cohort, records)
                        : active
                          ? (activeCohortTotal ?? null)
                          : null;
                    return (
                        <button
                            key={cohort.key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            data-records-cohort={cohort.key}
                            data-records-cohort-active={active ? "true" : "false"}
                            data-records-cohort-count={count ?? undefined}
                            onClick={() => onCohortChange(cohort.key)}
                            className={[
                                "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                                // Bend Pine is the platform's SELECTION semantic (workspace
                                // doctrine: pine for action/selection, never decoration). The
                                // solid midnight chip these used read as a second, darker
                                // vocabulary beside every other selected thing in the product.
                                active
                                    ? "bg-alloy-juniper/[0.12] text-alloy-juniper"
                                    : "text-alloy-midnight/65 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight",
                            ].join(" ")}
                        >
                            {cohort.label}
                            {/* "How many" is most of why an operator switches cohort — and an empty
                                cohort says 0 rather than vanishing. A count is shown only when it is
                                TRUE for the whole cohort. */}
                            {count != null ? (
                                <span className="ml-1.5 tabular-nums opacity-60">{count}</span>
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <div className="ml-auto flex items-center gap-2">
                <input
                    type="search"
                    value={filter}
                    onChange={(e) => onFilterChange(e.target.value)}
                    placeholder={filterPlaceholder}
                    aria-label={filterPlaceholder}
                    data-records-filter="true"
                    className={`w-48 ${WS_FIELD_SEARCH_CHROME}`}
                />
                {trailing}
            </div>
        </div>
    );
}
