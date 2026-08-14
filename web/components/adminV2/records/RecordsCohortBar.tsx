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
                                active
                                    ? "bg-alloy-midnight text-white"
                                    : "bg-alloy-midnight/5 text-alloy-midnight/70 hover:bg-alloy-midnight/10",
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
                    className="w-48 rounded border border-admin-border bg-white px-2 py-1 text-[12px] text-alloy-midnight placeholder:text-alloy-midnight/40"
                />
                {trailing}
            </div>
        </div>
    );
}
