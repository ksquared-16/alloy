/**
 * Assignments Focus Panel card — collection of operational service offers.
 *
 * A child may have zero, one, or many assignment entries (core care, before care,
 * enrichment, …). Each entry owns its own schedule, dates, commercial terms,
 * quote, proposal/commitment state, and compact readiness.
 *
 * Family-request facts remain child-enrollment fields — not Assignment sections.
 * Interest is composed separately and never stored as commitment_kind.
 *
 * Pure: no fetch, no Date.now, no mutation.
 */

import {
    EFFECTIVE_DATE_LABELS,
    resolveOperationalStartDate,
    resolveRequestedStart,
    type AssignmentCommitmentKind,
    type AssignmentDateCandidate,
} from "@/lib/enrollment/effectiveDateAuthority";
import type {
    AssignmentReadinessFactorKey,
    AssignmentReadinessGap,
    AssignmentReadinessResult,
} from "@/lib/enrollment/assignmentProposalReadiness";
import {
    activeAssignmentQuoteSnapshot,
    type AssignmentQuoteSnapshot,
} from "@/lib/enrollment/assignmentQuoteSnapshot";
import { formatFocusPanelDate } from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import { formatWeekdays } from "@/lib/scheduling/projection/buildSchedulingProjection";

/** @deprecated Five-section chrome removed; retained only for migration helpers. */
export const ASSIGNMENT_CARD_SECTION_TITLES = {
    family_request: "Family request",
    proposed_assignment: "Proposed assignment",
    commercial_estimate: "Commercial estimate",
    committed_assignment: "Committed assignment",
    readiness_gaps: "Readiness gaps",
} as const;

/** @deprecated */
export type AssignmentCardSectionKey = keyof typeof ASSIGNMENT_CARD_SECTION_TITLES;

export type AssignmentCardField = {
    key: string;
    label: string;
    value: string | null;
    present: boolean;
    required?: boolean;
    missing?: boolean;
};

/** @deprecated Prefer AssignmentCardEntry */
export type AssignmentCardSection = {
    key: AssignmentCardSectionKey;
    title: string;
    fields: AssignmentCardField[];
    gaps: AssignmentReadinessGap[];
    empty: boolean;
};

export type AssignmentCardEntryState = "interested" | "proposed" | "committed";

/** Lightweight assignment row for presentation (proposed or committed OA summary). */
export type AssignmentCardAssignmentSummary = {
    id: string;
    start_date: string;
    end_date?: string | null;
    status: string;
    commitment_kind?: AssignmentCommitmentKind | string | null;
    weekdays?: number[] | null;
    scheduleTypeLabel?: string | null;
    roomName?: string | null;
    programLabel?: string | null;
    siteLabel?: string | null;
    arriveTime?: string | null;
    departTime?: string | null;
    patternLabel?: string | null;
    /** Operational assignment type / service category label. */
    assignmentTypeLabel?: string | null;
    assignmentTypeKey?: string | null;
    isPrimary?: boolean | null;
    /** When false, excluded from child Enrollment Start Date derivation. */
    establishesEnrollment?: boolean | null;
    tuitionPlanId?: string | null;
    tuitionPlanLabel?: string | null;
};

/** Family interest without an operational offer yet. */
export type AssignmentCardInterest = {
    id: string;
    label: string;
    assignmentTypeKey?: string | null;
    assignmentTypeLabel?: string | null;
};

export type BuildAssignmentCardModelArgs = {
    processInstanceMetadata?: Record<string, unknown> | null;
    ocmStartDate?: string | null;
    opportunityDesiredStartDate?: string | null;
    agreementStartDate?: string | null;
    scheduleTypeLabel?: string | null;
    siteLabel?: string | null;
    proposedAssignments?: readonly AssignmentCardAssignmentSummary[];
    committedAssignments?: readonly AssignmentCardAssignmentSummary[];
    /** Interests not yet backed by a proposed/committed OA row. */
    interests?: readonly AssignmentCardInterest[];
    quoteSnapshot?: AssignmentQuoteSnapshot | null;
    /** @deprecated Child-level readiness — prefer per-entry readiness on summaries. */
    readiness?: AssignmentReadinessResult | null;
    /** Optional per-entry readiness keyed by assignment id. */
    readinessByAssignmentId?: Readonly<Record<string, AssignmentReadinessResult>>;
};

export type AssignmentCardEntry = {
    id: string;
    /** Service / offering title for the row. */
    title: string;
    assignmentTypeKey: string | null;
    assignmentTypeLabel: string | null;
    state: AssignmentCardEntryState;
    stateLabel: string;
    fields: AssignmentCardField[];
    readinessSummary: string;
    readinessReady: boolean;
    readinessGapCount: number;
    readinessGaps: AssignmentReadinessGap[];
    quoteGeneratedAt: string | null;
    startDate: string | null;
    estimatedTuition: string | null;
    scheduleSummary: string | null;
    siteSummary: string | null;
    establishesEnrollment: boolean;
    /** True when this is interest-only (no OA row yet). */
    interestOnly: boolean;
};

export type AssignmentCardModel = {
    /** Independent service assignment entries (0..n). */
    entries: AssignmentCardEntry[];
    /** Child Enrollment Start Date from qualifying committed rows only. */
    enrollmentStartDate: string | null;
    enrollmentStartDateSource: "committed_assignment" | "agreement_fallback" | null;
    summaryLine: string;
    /** Family Requested Start — for Children/comparison only. */
    requestedStart: string | null;
    /** @deprecated Prefer enrollmentStartDate */
    startDate: string | null;
    /** @deprecated Prefer enrollmentStartDateSource */
    startDateSource: "committed_assignment" | "agreement_fallback" | null;
    /** @deprecated Prefer entries[0] — retained for single-entry callers. */
    state: "none" | "proposed" | "committed";
    stateLabel: string;
    /** @deprecated Flattened first entry fields for transitional callers. */
    fields: AssignmentCardField[];
    readinessSummary: string;
    readinessReady: boolean;
    readinessGapCount: number;
    readinessGaps: AssignmentReadinessGap[];
    quoteGeneratedAt: string | null;
    /** @deprecated Temporary adapter for callers still keyed by section. */
    sections: AssignmentCardSection[];
};

const OFFER_FACTOR_BY_FIELD: Partial<Record<string, AssignmentReadinessFactorKey[]>> = {
    site: ["site"],
    program: ["program"],
    room: ["room"],
    schedule: ["proposed_schedule"],
    start_date: ["assignment_start"],
    tuition_plan: ["tuition_plan"],
    estimated_tuition: ["tuition_plan"],
    quote: ["quote_generated"],
};

function field(
    key: string,
    label: string,
    value: string | null,
    opts?: { required?: boolean },
): AssignmentCardField {
    const present = value != null && String(value).trim().length > 0;
    const required = Boolean(opts?.required);
    return {
        key,
        label,
        value: present ? String(value).trim() : null,
        present,
        required,
        missing: required && !present,
    };
}

function formatDate(ymd: string | null): string | null {
    if (!ymd) return null;
    return formatFocusPanelDate(ymd) ?? ymd;
}

function formatMoneyCents(cents: number, currency: string): string {
    return (cents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: currency || "USD",
    });
}

function formatHours(arrive: string | null | undefined, depart: string | null | undefined): string | null {
    const a = arrive?.trim() || "";
    const d = depart?.trim() || "";
    if (!a && !d) return null;
    if (a && d) return `${a} – ${d}`;
    return a || d;
}

function toDateCandidates(
    rows: readonly AssignmentCardAssignmentSummary[] | undefined,
): AssignmentDateCandidate[] {
    if (!rows) return [];
    return rows.map((r) => ({
        id: r.id,
        start_date: r.start_date,
        end_date: r.end_date ?? null,
        status: r.status,
        commitment_kind: r.commitment_kind ?? null,
        establishes_enrollment: r.establishesEnrollment ?? null,
        is_primary: r.isPrimary ?? null,
    }));
}

function gapFactors(readiness: AssignmentReadinessResult | null | undefined): Set<AssignmentReadinessFactorKey> {
    const set = new Set<AssignmentReadinessFactorKey>();
    for (const g of readiness?.gaps ?? []) {
        if (g.factor) set.add(g.factor);
    }
    return set;
}

function fieldRequired(
    fieldKey: string,
    factors: Set<AssignmentReadinessFactorKey>,
): boolean {
    const mapped = OFFER_FACTOR_BY_FIELD[fieldKey];
    if (!mapped) return false;
    return mapped.some((f) => factors.has(f));
}

function buildScheduleLabel(
    row: AssignmentCardAssignmentSummary | null,
    fallbackType: string | null | undefined,
): string | null {
    const type = row?.scheduleTypeLabel ?? row?.patternLabel ?? fallbackType ?? null;
    const days =
        row?.weekdays && row.weekdays.length > 0 ? formatWeekdays(row.weekdays) : null;
    const hours = formatHours(row?.arriveTime, row?.departTime);
    const parts = [type, days, hours].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
}

function buildReadinessSummary(ready: boolean, gapCount: number): string {
    if (ready || gapCount === 0) return "Ready to commit";
    return gapCount === 1 ? "1 item required" : `${gapCount} items required`;
}

function entryStateLabel(state: AssignmentCardEntryState, startDate: string | null): string {
    if (state === "committed") {
        return startDate ? `Committed · Starts ${formatDate(startDate)}` : "Committed";
    }
    if (state === "proposed") return "Proposed";
    return "Interested";
}

function sortEntries(a: AssignmentCardEntry, b: AssignmentCardEntry): number {
    const rank = (s: AssignmentCardEntryState) =>
        s === "committed" ? 0 : s === "proposed" ? 1 : 2;
    const rd = rank(a.state) - rank(b.state);
    if (rd !== 0) return rd;
    return a.title.localeCompare(b.title);
}

function buildEntryFromAssignment(args: {
    row: AssignmentCardAssignmentSummary;
    state: "proposed" | "committed";
    meta: Record<string, unknown> | null;
    siteFallback: string | null;
    scheduleFallback: string | null;
    readiness: AssignmentReadinessResult;
    quote: AssignmentQuoteSnapshot | null;
}): AssignmentCardEntry {
    const { row, state, meta, siteFallback, scheduleFallback, readiness, quote } = args;
    const factors = gapFactors(readiness);
    const siteValue = row.siteLabel ?? siteFallback
        ?? (typeof meta?.location_label === "string" ? meta.location_label : null)
        ?? null;
    const programValue =
        row.programLabel
        ?? (typeof meta?.program_label === "string" ? meta.program_label : null)
        ?? null;
    const roomValue = row.roomName ?? null;
    const scheduleValue = buildScheduleLabel(row, scheduleFallback);
    const startValue = formatDate(row.start_date || null);
    const tuitionPlan =
        row.tuitionPlanLabel
        ?? quote?.offering_label
        ?? quote?.offering_id
        ?? row.tuitionPlanId
        ?? (typeof meta?.tuition_plan_id === "string" ? meta.tuition_plan_id : null);
    const estimate = quote
        ? formatMoneyCents(quote.amount_cents, quote.currency)
        : null;
    const quoteStatus = quote
        ? `Generated ${formatFocusPanelDate(quote.generated_at.slice(0, 10)) ?? quote.generated_at.slice(0, 10)}`
        : null;

    const title =
        row.assignmentTypeLabel?.trim()
        || programValue
        || row.scheduleTypeLabel
        || "Assignment";

    const fields: AssignmentCardField[] = [
        field("site", "Campus", siteValue, { required: fieldRequired("site", factors) }),
        field("program", "Program", programValue, { required: fieldRequired("program", factors) }),
        field("room", "Room", roomValue, { required: fieldRequired("room", factors) }),
        field("schedule", "Schedule", scheduleValue, {
            required: fieldRequired("schedule", factors),
        }),
        field("start_date", "Start Date", startValue, {
            required: fieldRequired("start_date", factors),
        }),
        field("tuition_plan", "Tuition Plan", tuitionPlan, {
            required: fieldRequired("tuition_plan", factors),
        }),
        field("estimated_tuition", "Estimated Tuition", estimate, {
            required: fieldRequired("estimated_tuition", factors),
        }),
        field("quote", "Quote", quoteStatus, {
            required: fieldRequired("quote", factors),
        }),
    ];

    const readinessReady = readiness.ready;
    const readinessGapCount = (readiness.gaps ?? []).length;

    return {
        id: row.id,
        title,
        assignmentTypeKey: row.assignmentTypeKey ?? null,
        assignmentTypeLabel: row.assignmentTypeLabel ?? null,
        state,
        stateLabel: entryStateLabel(state, row.start_date || null),
        fields,
        readinessSummary: buildReadinessSummary(readinessReady, readinessGapCount),
        readinessReady,
        readinessGapCount,
        readinessGaps: readiness.gaps ?? [],
        quoteGeneratedAt: quote?.generated_at ?? null,
        startDate: row.start_date || null,
        estimatedTuition: estimate,
        scheduleSummary: scheduleValue,
        siteSummary: siteValue,
        establishesEnrollment:
            row.establishesEnrollment === true
                ? true
                : row.establishesEnrollment === false
                  ? false
                  : row.isPrimary === true
                    ? true
                    : row.isPrimary === false
                      ? false
                      : true,
        interestOnly: false,
    };
}

function buildInterestEntry(interest: AssignmentCardInterest): AssignmentCardEntry {
    return {
        id: interest.id,
        title: interest.label,
        assignmentTypeKey: interest.assignmentTypeKey ?? null,
        assignmentTypeLabel: interest.assignmentTypeLabel ?? interest.label,
        state: "interested",
        stateLabel: "Interested",
        fields: [],
        readinessSummary: "Build offer",
        readinessReady: false,
        readinessGapCount: 0,
        readinessGaps: [],
        quoteGeneratedAt: null,
        startDate: null,
        estimatedTuition: null,
        scheduleSummary: null,
        siteSummary: null,
        establishesEnrollment: false,
        interestOnly: true,
    };
}

/**
 * Build the Assignments card presentation model — a collection of service entries.
 */
export function buildAssignmentCardModel(args: BuildAssignmentCardModelArgs): AssignmentCardModel {
    const meta = args.processInstanceMetadata ?? null;
    const requestedStart = resolveRequestedStart({
        processInstanceMetadata: meta,
        ocmStartDate: args.ocmStartDate,
        opportunityDesiredStartDate: args.opportunityDesiredStartDate,
    });

    const committedRows = args.committedAssignments ?? [];
    const proposedRows = args.proposedAssignments ?? [];
    const startResolved = resolveOperationalStartDate({
        committedAssignments: toDateCandidates(committedRows),
        agreementStartDate: args.agreementStartDate,
    });

    const readinessById = args.readinessByAssignmentId ?? {};
    const defaultReadiness = args.readiness ?? { ready: true, gaps: [] };

    const entries: AssignmentCardEntry[] = [];
    const seenIds = new Set<string>();

    for (const row of committedRows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        const quote =
            args.quoteSnapshot !== undefined && !row.id
                ? args.quoteSnapshot
                : activeAssignmentQuoteSnapshot(meta, row.id)
                  ?? (args.quoteSnapshot !== undefined ? null : activeAssignmentQuoteSnapshot(meta));
        entries.push(
            buildEntryFromAssignment({
                row,
                state: "committed",
                meta,
                siteFallback: args.siteLabel ?? null,
                scheduleFallback: args.scheduleTypeLabel ?? null,
                readiness: readinessById[row.id] ?? { ready: true, gaps: [] },
                quote,
            }),
        );
    }

    for (const row of proposedRows) {
        if (seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        const quote = activeAssignmentQuoteSnapshot(meta, row.id)
            ?? (args.quoteSnapshot !== undefined ? args.quoteSnapshot : activeAssignmentQuoteSnapshot(meta));
        entries.push(
            buildEntryFromAssignment({
                row,
                state: "proposed",
                meta,
                siteFallback: args.siteLabel ?? null,
                scheduleFallback: args.scheduleTypeLabel ?? null,
                readiness: readinessById[row.id] ?? defaultReadiness,
                quote,
            }),
        );
    }

    for (const interest of args.interests ?? []) {
        if (seenIds.has(interest.id)) continue;
        // Skip interest when an OA already covers the same type label.
        const covered = entries.some(
            (e) =>
                (interest.assignmentTypeKey
                    && e.assignmentTypeKey === interest.assignmentTypeKey)
                || e.title.toLowerCase() === interest.label.trim().toLowerCase(),
        );
        if (covered) continue;
        seenIds.add(interest.id);
        entries.push(buildInterestEntry(interest));
    }

    entries.sort(sortEntries);

    const first = entries[0] ?? null;
    const hasCommitted = entries.some((e) => e.state === "committed")
        || startResolved.source === "agreement_fallback";
    const hasProposed = entries.some((e) => e.state === "proposed");
    const childState: "none" | "proposed" | "committed" = hasCommitted
        ? "committed"
        : hasProposed
          ? "proposed"
          : entries.length > 0
            ? "proposed"
            : "none";

    const incomplete = entries.filter((e) => e.state === "proposed" && !e.readinessReady);
    const cardReadinessSummary =
        entries.length === 0
            ? hasCommitted && startResolved.startDate
                ? `Committed · ${EFFECTIVE_DATE_LABELS.startDate} ${formatDate(startResolved.startDate)}`
                : "No assignment yet"
            : incomplete.length === 0
              ? entries.some((e) => e.state === "proposed")
                  ? "Ready to commit"
                  : hasCommitted
                    ? `Committed · ${EFFECTIVE_DATE_LABELS.startDate} ${formatDate(startResolved.startDate) ?? ""}`.trim()
                    : "No assignment yet"
              : incomplete.length === 1
                ? incomplete[0]!.readinessSummary
                : `${incomplete.length} proposals need attention`;

    const summaryLine =
        entries.length === 0
            ? hasCommitted && startResolved.startDate
                ? `Committed · ${EFFECTIVE_DATE_LABELS.startDate} ${formatDate(startResolved.startDate)}`
                : "No assignment yet"
            : entries.length === 1
              ? `${entries[0]!.title} · ${entries[0]!.stateLabel}`
              : `${entries.length} assignments · ${entries.filter((e) => e.state === "committed").length} committed`;

    // Deprecated section adapter — keep authority field lookups working in older tests.
    const sections: AssignmentCardSection[] = [
        {
            key: "proposed_assignment",
            title: ASSIGNMENT_CARD_SECTION_TITLES.proposed_assignment,
            fields: first?.fields.filter((f) =>
                ["site", "program", "room", "schedule", "start_date"].includes(f.key),
            ) ?? [],
            gaps: [],
            empty: !hasProposed && !hasCommitted,
        },
        {
            key: "commercial_estimate",
            title: ASSIGNMENT_CARD_SECTION_TITLES.commercial_estimate,
            fields: first?.fields.filter((f) =>
                ["tuition_plan", "estimated_tuition", "quote"].includes(f.key),
            ) ?? [],
            gaps: [],
            empty: !first?.quoteGeneratedAt,
        },
        {
            key: "committed_assignment",
            title: ASSIGNMENT_CARD_SECTION_TITLES.committed_assignment,
            fields: [
                field("start_date", EFFECTIVE_DATE_LABELS.startDate, formatDate(startResolved.startDate)),
            ],
            gaps: [],
            empty: !hasCommitted,
        },
        {
            key: "readiness_gaps",
            title: ASSIGNMENT_CARD_SECTION_TITLES.readiness_gaps,
            fields: [],
            gaps: incomplete.flatMap((e) => e.readinessGaps),
            empty: incomplete.every((e) => e.readinessGapCount === 0),
        },
        {
            key: "family_request",
            title: ASSIGNMENT_CARD_SECTION_TITLES.family_request,
            fields: [
                field("requested_start", EFFECTIVE_DATE_LABELS.requestedStart, formatDate(requestedStart)),
            ],
            gaps: [],
            empty: !requestedStart,
        },
    ];

    return {
        entries,
        enrollmentStartDate: startResolved.startDate,
        enrollmentStartDateSource: startResolved.source,
        summaryLine,
        requestedStart,
        startDate: startResolved.startDate,
        startDateSource: startResolved.source,
        state: childState,
        stateLabel:
            childState === "committed"
                ? startResolved.startDate
                    ? `Committed · Effective ${formatDate(startResolved.startDate)}`
                    : "Committed"
                : childState === "proposed"
                  ? "Proposed assignment"
                  : "No assignment yet",
        fields: first?.fields ?? [],
        readinessSummary: cardReadinessSummary,
        readinessReady: incomplete.length === 0,
        readinessGapCount: incomplete.reduce((n, e) => n + e.readinessGapCount, 0),
        readinessGaps: incomplete.flatMap((e) => e.readinessGaps),
        quoteGeneratedAt: first?.quoteGeneratedAt ?? null,
        sections,
    };
}

/** @deprecated Prefer model.entries */
export function assignmentCardSection(
    model: AssignmentCardModel,
    key: AssignmentCardSectionKey,
): AssignmentCardSection | null {
    return model.sections.find((s) => s.key === key) ?? null;
}

/** @deprecated Prefer model.entries / model.fields */
export function assignmentCardFieldValue(
    model: AssignmentCardModel,
    sectionKey: AssignmentCardSectionKey,
    fieldKey: string,
): string | null {
    if (sectionKey === "family_request" && fieldKey === "requested_start") {
        return formatDate(model.requestedStart);
    }
    if (sectionKey === "committed_assignment" && fieldKey === "start_date") {
        return formatDate(model.enrollmentStartDate ?? model.startDate);
    }
    const fromOffer = model.fields.find((f) => f.key === fieldKey);
    if (fromOffer) return fromOffer.value;
    const sec = assignmentCardSection(model, sectionKey);
    if (!sec) return null;
    return sec.fields.find((f) => f.key === fieldKey)?.value ?? null;
}
