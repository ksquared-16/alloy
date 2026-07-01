/**
 * Pure, domain-generic versioning model for effective-dated operational
 * configuration (Operational Configuration V1, Batch 1+).
 *
 * This is the platform primitive behind "configuration is versioned, never
 * overwritten". It is intentionally NOT childcare- or rate-specific: any table
 * that carries `effective_start` / `effective_end` (+ an optional `is_active`
 * flag) — rate plans, rate rules, capacity rules, ratio rules, operating
 * windows, schedule rules — composes the same version timeline and supersede
 * planning from here. One model, many configuration domains.
 *
 * Doctrine: supersede / change-later semantics (a new version row plus the prior
 * row's `effective_end` closed the day before) — never an in-place overwrite of
 * effective-dated truth. See docs/sprints/06_2026/operational_configuration_v1.md.
 *
 * Pure functions only — no DB, no IO. The authoritative "which row resolves"
 * remains the per-domain resolver (resolveConfigRule / resolveRate); this module
 * only classifies/sequences versions for authoring surfaces and validates the
 * shape of a supersede before a write service performs it.
 */

import {
    compareIsoDates,
    computePriorRowCloseDate,
    isInvalidSupersedeStartDate,
    validateEndOnOrAfterStart,
} from "@/lib/childcareOperational/effectiveDating";
import type { ConfigRuleEffectiveColumns } from "@/lib/childcareOperational/config/configRuleTypes";

/**
 * Lifecycle status of a single version relative to a reference date and its
 * lineage siblings:
 *  - current     — effective today and the winning (latest-starting) open row
 *  - scheduled   — a future version that has not started yet
 *  - superseded   — ended in the past because a later version took over
 *  - retired      — ended/deactivated with no successor (intentionally stopped)
 */
export type VersionStatus = "current" | "scheduled" | "superseded" | "retired";

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
    current: "Current",
    scheduled: "Scheduled",
    superseded: "Superseded",
    retired: "Retired",
};

/** Minimal shape a version row must expose to be classified/sequenced. */
export type EffectiveDatedVersionRow = ConfigRuleEffectiveColumns & {
    id: string;
    /** Optional hard-disable flag (present on rate plans; absent on rate rules). */
    is_active?: boolean;
};

export type VersionTimelineEntry<T extends EffectiveDatedVersionRow> = {
    row: T;
    status: VersionStatus;
    /** True for the single row that wins resolution today (the active version). */
    isCurrent: boolean;
    /** True for the latest-starting row in the lineage (newest authored version). */
    isLatest: boolean;
};

function isEffectiveToday(row: EffectiveDatedVersionRow, todayYmd: string): boolean {
    if (compareIsoDates(row.effective_start, todayYmd) > 0) return false;
    if (row.effective_end != null && compareIsoDates(todayYmd, row.effective_end) > 0) return false;
    return true;
}

function isScheduled(row: EffectiveDatedVersionRow, todayYmd: string): boolean {
    return compareIsoDates(row.effective_start, todayYmd) > 0;
}

/**
 * The id of the row that wins resolution today within a lineage: the active,
 * effective-today row with the latest effective_start. Mirrors the resolver's
 * "latest effective_start" tie-break so the timeline agrees with resolution.
 */
export function currentVersionId(
    lineage: readonly EffectiveDatedVersionRow[],
    todayYmd: string,
): string | null {
    let winner: EffectiveDatedVersionRow | null = null;
    for (const row of lineage) {
        if (row.is_active === false) continue;
        if (!isEffectiveToday(row, todayYmd)) continue;
        if (winner == null || compareIsoDates(row.effective_start, winner.effective_start) > 0) {
            winner = row;
        }
    }
    return winner?.id ?? null;
}

function hasLaterSibling(
    row: EffectiveDatedVersionRow,
    lineage: readonly EffectiveDatedVersionRow[],
): boolean {
    return lineage.some(
        (o) => o.id !== row.id && compareIsoDates(o.effective_start, row.effective_start) > 0,
    );
}

/**
 * Classify one row's lifecycle status within its lineage on a reference date.
 * `lineage` must be the set of versions sharing the same logical identity
 * (caller groups by domain-specific lineage key).
 */
export function classifyVersionStatus(
    row: EffectiveDatedVersionRow,
    lineage: readonly EffectiveDatedVersionRow[],
    todayYmd: string,
): VersionStatus {
    if (row.id === currentVersionId(lineage, todayYmd)) return "current";
    if (isScheduled(row, todayYmd)) return "scheduled";
    // Past or hard-disabled, and not the current winner: superseded if a newer
    // version exists, otherwise intentionally retired.
    return hasLaterSibling(row, lineage) ? "superseded" : "retired";
}

/**
 * Order a lineage for authoring display: Current first, then Scheduled (soonest
 * first), then ended versions newest-first (Superseded / Retired interleaved by
 * recency). Returns each row annotated with its status. Stable for equal keys.
 */
export function buildVersionTimeline<T extends EffectiveDatedVersionRow>(
    lineage: readonly T[],
    todayYmd: string,
): VersionTimelineEntry<T>[] {
    const currentId = currentVersionId(lineage, todayYmd);
    const latestStart = lineage.reduce<string | null>(
        (acc, r) => (acc == null || compareIsoDates(r.effective_start, acc) > 0 ? r.effective_start : acc),
        null,
    );
    const statusOrder: Record<VersionStatus, number> = {
        current: 0,
        scheduled: 1,
        superseded: 2,
        retired: 2,
    };
    return lineage
        .map((row) => {
            const status = classifyVersionStatus(row, lineage, todayYmd);
            return {
                row,
                status,
                isCurrent: row.id === currentId,
                isLatest: latestStart != null && row.effective_start === latestStart,
            };
        })
        .sort((a, b) => {
            const oa = statusOrder[a.status];
            const ob = statusOrder[b.status];
            if (oa !== ob) return oa - ob;
            // Scheduled: soonest first; ended: most recent start first.
            if (a.status === "scheduled") return compareIsoDates(a.row.effective_start, b.row.effective_start);
            return compareIsoDates(b.row.effective_start, a.row.effective_start);
        });
}

export type SupersedePlanError = {
    code: "invalid_input" | "validation_failed";
    message: string;
};

export type SupersedePlanResult =
    | { ok: true; closeDate: string }
    | { ok: false; error: SupersedePlanError };

/**
 * Validate a supersede and compute the prior row's close date (the calendar day
 * before the new version's effective_start). Pure: a write service calls this,
 * then performs the close + insert. Mirrors the placement/assignment supersede
 * discipline so every domain validates versioning identically.
 */
export function planSupersede(input: {
    priorStart: string;
    priorEnd: string | null | undefined;
    newStart: string;
}): SupersedePlanResult {
    const { priorStart, priorEnd, newStart } = input;
    if (
        isInvalidSupersedeStartDate({
            priorStartDate: priorStart,
            priorEndDate: priorEnd,
            newStartDate: newStart,
        })
    ) {
        return {
            ok: false,
            error: {
                code: "validation_failed",
                message:
                    "New version effective_start must be after the prior version start and any prior end date",
            },
        };
    }
    const closeDate = computePriorRowCloseDate(newStart);
    const rangeError = validateEndOnOrAfterStart(priorStart, closeDate);
    if (rangeError) {
        return { ok: false, error: { code: "validation_failed", message: rangeError.message } };
    }
    return { ok: true, closeDate };
}

/**
 * Whether a version may be hard-voided (rollback of a not-yet-started version).
 * Only a scheduled row with no later sibling is voidable; once a version has
 * been effective for any past date it is operational/financial history and must
 * be ended via retire/supersede, never deleted.
 */
export function canVoidVersion(
    row: EffectiveDatedVersionRow,
    lineage: readonly EffectiveDatedVersionRow[],
    todayYmd: string,
): boolean {
    return isScheduled(row, todayYmd) && !hasLaterSibling(row, lineage);
}
