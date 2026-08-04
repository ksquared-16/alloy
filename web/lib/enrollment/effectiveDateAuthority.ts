/**
 * Enrollment Assignment & Effective Dates — canonical date authority.
 *
 * Semantic distinctions (do not collapse):
 *   Requested Start  → family preferred start (participation / proposal)
 *   Enrollment Date  → paperwork completion fact (process outcome)
 *   Start Date       → effective date of the first committed operational assignment
 *
 * @see docs/sprints/active/enrollment-assignment-effective-dates/current-state-audit.md
 * @see docs/platform/planning/assignment-proposed-commitment-authority.md
 */

export const ENROLLMENT_DATE_METADATA_KEY = "enrollment_date" as const;
export const REQUESTED_DAYS_PER_WEEK_METADATA_KEY = "requested_days_per_week" as const;

/** Operator-facing labels — configuration may override presentation, not calculation. */
export const EFFECTIVE_DATE_LABELS = {
    requestedStart: "Requested Start",
    enrollmentDate: "Enrollment Date",
    startDate: "Start Date",
    requestedDaysPerWeek: "Requested days per week",
    preferredDays: "Preferred days",
    proposedSchedule: "Proposed schedule",
    committedSchedule: "Committed schedule",
} as const;

export type AssignmentCommitmentKind = "proposed" | "committed";

export type AssignmentDateCandidate = {
    id: string;
    start_date: string;
    end_date?: string | null;
    status: string;
    commitment_kind?: AssignmentCommitmentKind | string | null;
    /** When true, row was formally corrected out of Start Date eligibility. */
    excluded_from_start_date?: boolean;
};

export type EnrollmentDateStamp = {
    enrollment_date: string;
    source: "paperwork_completion_outcome" | "authorized_correction" | "compat_approve_enrollment";
    stamped_at: string;
    actor_user_id?: string | null;
    reason?: string | null;
    previous_enrollment_date?: string | null;
};

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

function ymdOrNull(v: unknown): string | null {
    const s = trimOrNull(v);
    if (!s) return null;
    // Accept ISO date or datetime; normalize to YYYY-MM-DD.
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
}

/**
 * Whether a schedule_assignments (or equivalent) row qualifies as a committed
 * operational assignment that may define Start Date.
 *
 * Canceled and non-committed (proposed) rows do not qualify.
 * Superseded history rows still retain their original start_date for derivation
 * of the *first* committed start — supersede closes a prior row but does not
 * erase that it was once the first commitment. We therefore include superseded
 * committed rows when scanning for the earliest start, unless explicitly
 * excluded via correction metadata.
 */
export function assignmentQualifiesForStartDate(row: AssignmentDateCandidate): boolean {
    const kind = (row.commitment_kind ?? "committed").toString().trim().toLowerCase();
    if (kind !== "committed") return false;
    if (row.excluded_from_start_date) return false;
    const status = (row.status ?? "").toString().trim().toLowerCase();
    if (status === "canceled") return false;
    const start = ymdOrNull(row.start_date);
    return Boolean(start);
}

/**
 * Start Date = effective start of the child's first committed operational assignment.
 * Authority: earliest qualifying committed schedule_assignment.start_date.
 * Optional agreement fallback when materialization created a relationship without an OA row.
 */
export function resolveOperationalStartDate(args: {
    committedAssignments: AssignmentDateCandidate[];
    agreementStartDate?: string | null;
}): { startDate: string | null; source: "committed_assignment" | "agreement_fallback" | null; assignmentId: string | null } {
    const qualifying = args.committedAssignments
        .filter(assignmentQualifiesForStartDate)
        .map((row) => ({ row, start: ymdOrNull(row.start_date)! }))
        .sort((a, b) => {
            if (a.start !== b.start) return a.start.localeCompare(b.start);
            return a.row.id.localeCompare(b.row.id);
        });

    if (qualifying.length > 0) {
        const first = qualifying[0]!;
        return {
            startDate: first.start,
            source: "committed_assignment",
            assignmentId: first.row.id,
        };
    }

    const agreement = ymdOrNull(args.agreementStartDate);
    if (agreement) {
        return { startDate: agreement, source: "agreement_fallback", assignmentId: null };
    }

    return { startDate: null, source: null, assignmentId: null };
}

/**
 * Requested Start — family preferred timing on the enrollment proposal / participation.
 * Never rewritten by commitment.
 */
export function resolveRequestedStart(args: {
    processInstanceMetadata?: Record<string, unknown> | null;
    /** Legacy OCM column — only when explicitly allowed by caller. */
    ocmStartDate?: string | null;
    opportunityDesiredStartDate?: string | null;
}): string | null {
    const meta = args.processInstanceMetadata;
    const fromPi = meta ? ymdOrNull(meta.start_date) : null;
    if (fromPi) return fromPi;
    const fromOcm = ymdOrNull(args.ocmStartDate);
    if (fromOcm) return fromOcm;
    return ymdOrNull(args.opportunityDesiredStartDate);
}

/**
 * Enrollment Date from process-instance authority (paperwork completion fact).
 * Opportunity metadata is a compat projection only — prefer process grain.
 */
export function resolveEnrollmentDate(args: {
    processInstanceMetadata?: Record<string, unknown> | null;
    opportunityMetadata?: Record<string, unknown> | null;
}): { enrollmentDate: string | null; source: "process_instance" | "opportunity_compat" | null } {
    const fromPi = args.processInstanceMetadata
        ? ymdOrNull(args.processInstanceMetadata[ENROLLMENT_DATE_METADATA_KEY])
        : null;
    if (fromPi) return { enrollmentDate: fromPi, source: "process_instance" };

    const fromOpp = args.opportunityMetadata
        ? ymdOrNull(args.opportunityMetadata[ENROLLMENT_DATE_METADATA_KEY])
        : null;
    if (fromOpp) return { enrollmentDate: fromOpp, source: "opportunity_compat" };

    return { enrollmentDate: null, source: null };
}

/**
 * Stamp Enrollment Date onto process-instance metadata.
 * Does not silently overwrite an existing value unless this is an authorized correction.
 */
export function mergeEnrollmentDateOntoProcessMetadata(
    existingMetadata: Record<string, unknown> | null | undefined,
    stamp: EnrollmentDateStamp,
): { metadata: Record<string, unknown>; wrote: boolean; refusedOverwrite: boolean } {
    const meta = {
        ...(existingMetadata && typeof existingMetadata === "object" ? existingMetadata : {}),
    };
    const prior = ymdOrNull(meta[ENROLLMENT_DATE_METADATA_KEY]);
    const next = ymdOrNull(stamp.enrollment_date);
    if (!next) {
        return { metadata: meta, wrote: false, refusedOverwrite: false };
    }

    if (prior && prior === next && stamp.source !== "authorized_correction") {
        return { metadata: meta, wrote: false, refusedOverwrite: false };
    }

    if (prior && prior !== next && stamp.source !== "authorized_correction") {
        // Reopening / re-confirming must not silently rewrite history.
        return { metadata: meta, wrote: false, refusedOverwrite: true };
    }

    meta[ENROLLMENT_DATE_METADATA_KEY] = next;
    const evidence: Record<string, unknown> = {
        source: stamp.source,
        stamped_at: stamp.stamped_at,
    };
    if (stamp.actor_user_id) evidence.actor_user_id = stamp.actor_user_id;
    if (stamp.reason) evidence.reason = stamp.reason;
    if (prior) evidence.previous_enrollment_date = prior;
    else if (stamp.previous_enrollment_date) {
        evidence.previous_enrollment_date = stamp.previous_enrollment_date;
    }

    const history = Array.isArray(meta.enrollment_date_history)
        ? [...(meta.enrollment_date_history as unknown[])]
        : [];
    history.push(evidence);
    meta.enrollment_date_history = history;
    meta.enrollment_date_evidence = evidence;

    return { metadata: meta, wrote: true, refusedOverwrite: false };
}

export function resolveRequestedDaysPerWeek(
    metadata: Record<string, unknown> | null | undefined,
): number | null {
    if (!metadata || typeof metadata !== "object") return null;
    const raw = metadata[REQUESTED_DAYS_PER_WEEK_METADATA_KEY];
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
    if (typeof raw === "string" && raw.trim()) {
        const n = Number(raw.trim());
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return null;
}

export function resolvePreferredWeekdays(
    metadata: Record<string, unknown> | null | undefined,
): number[] {
    if (!metadata || typeof metadata !== "object") return [];
    const raw = metadata.weekdays;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((d) => (typeof d === "number" ? d : Number(d)))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}
