/**
 * Assignments Focus Panel card — calm sectioned presentation model.
 *
 * Separates Family request / Proposed assignment / Commercial estimate /
 * Committed assignment / Readiness gaps without inventing a new card runtime.
 * Pure: no fetch, no Date.now, no mutation.
 *
 * @see docs/sprints/active/enrollment-assignment-effective-dates/current-state-audit.md (D8)
 * @see web/components/admin/focusPanel/cards/SchedulingCard.tsx (operator title Assignments)
 */

import {
    EFFECTIVE_DATE_LABELS,
    resolveEnrollmentDate,
    resolveOperationalStartDate,
    resolvePreferredWeekdays,
    resolveRequestedDaysPerWeek,
    resolveRequestedStart,
    type AssignmentCommitmentKind,
    type AssignmentDateCandidate,
} from "@/lib/enrollment/effectiveDateAuthority";
import type {
    AssignmentReadinessGap,
    AssignmentReadinessResult,
} from "@/lib/enrollment/assignmentProposalReadiness";
import {
    activeAssignmentQuoteSnapshot,
    type AssignmentQuoteSnapshot,
} from "@/lib/enrollment/assignmentQuoteSnapshot";
import { formatFocusPanelDate } from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import { formatWeekdays } from "@/lib/scheduling/projection/buildSchedulingProjection";

export const ASSIGNMENT_CARD_SECTION_TITLES = {
    family_request: "Family request",
    proposed_assignment: "Proposed assignment",
    commercial_estimate: "Commercial estimate",
    committed_assignment: "Committed assignment",
    readiness_gaps: "Readiness gaps",
} as const;

export type AssignmentCardSectionKey = keyof typeof ASSIGNMENT_CARD_SECTION_TITLES;

export type AssignmentCardField = {
    key: string;
    label: string;
    value: string | null;
    present: boolean;
};

export type AssignmentCardSection = {
    key: AssignmentCardSectionKey;
    title: string;
    fields: AssignmentCardField[];
    gaps: AssignmentReadinessGap[];
    empty: boolean;
};

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
    arriveTime?: string | null;
    departTime?: string | null;
    patternLabel?: string | null;
};

export type BuildAssignmentCardModelArgs = {
    processInstanceMetadata?: Record<string, unknown> | null;
    ocmStartDate?: string | null;
    opportunityDesiredStartDate?: string | null;
    agreementStartDate?: string | null;
    /** Participation schedule intent label before / alongside OA. */
    scheduleTypeLabel?: string | null;
    proposedAssignments?: readonly AssignmentCardAssignmentSummary[];
    committedAssignments?: readonly AssignmentCardAssignmentSummary[];
    /** When omitted, derived from process metadata via activeAssignmentQuoteSnapshot. */
    quoteSnapshot?: AssignmentQuoteSnapshot | null;
    readiness?: AssignmentReadinessResult | null;
};

export type AssignmentCardModel = {
    sections: AssignmentCardSection[];
    /** Compact orientation line for summary-strip consumers. */
    summaryLine: string;
    requestedStart: string | null;
    /** Resolved operational Start Date (first committed assignment / agreement fallback). */
    startDate: string | null;
    startDateSource: "committed_assignment" | "agreement_fallback" | null;
    readinessReady: boolean;
    readinessGapCount: number;
};

function field(key: string, label: string, value: string | null): AssignmentCardField {
    const present = value != null && String(value).trim().length > 0;
    return { key, label, value: present ? String(value).trim() : null, present };
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

function primarySummary(
    rows: readonly AssignmentCardAssignmentSummary[] | undefined,
): AssignmentCardAssignmentSummary | null {
    if (!rows || rows.length === 0) return null;
    return [...rows].sort((a, b) => {
        const as = (a.start_date || "").localeCompare(b.start_date || "");
        if (as !== 0) return as;
        return a.id.localeCompare(b.id);
    })[0]!;
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
    }));
}

function section(
    key: AssignmentCardSectionKey,
    fields: AssignmentCardField[],
    gaps: AssignmentReadinessGap[] = [],
): AssignmentCardSection {
    const empty =
        key === "readiness_gaps"
            ? gaps.length === 0
            : fields.every((f) => !f.present) && gaps.length === 0;
    return {
        key,
        title: ASSIGNMENT_CARD_SECTION_TITLES[key],
        fields,
        gaps,
        empty,
    };
}

function buildSummaryLine(args: {
    requestedStart: string | null;
    startDate: string | null;
    hasProposed: boolean;
    hasCommitted: boolean;
    hasQuote: boolean;
    readinessReady: boolean;
    readinessGapCount: number;
}): string {
    if (!args.readinessReady && args.readinessGapCount > 0) {
        return args.readinessGapCount === 1
            ? "1 readiness gap"
            : `${args.readinessGapCount} readiness gaps`;
    }
    if (args.hasCommitted && args.startDate) {
        return `Committed · ${EFFECTIVE_DATE_LABELS.startDate} ${formatDate(args.startDate)}`;
    }
    if (args.hasCommitted) {
        return "Committed assignment";
    }
    if (args.hasProposed) {
        return "Proposed assignment";
    }
    if (args.hasQuote) {
        return "Commercial estimate ready";
    }
    if (args.requestedStart) {
        return `${EFFECTIVE_DATE_LABELS.requestedStart} ${formatDate(args.requestedStart)}`;
    }
    return "No assignment yet";
}

/**
 * Build the Assignments card presentation model from participation + OA summaries.
 */
export function buildAssignmentCardModel(args: BuildAssignmentCardModelArgs): AssignmentCardModel {
    const meta = args.processInstanceMetadata ?? null;
    const requestedStart = resolveRequestedStart({
        processInstanceMetadata: meta,
        ocmStartDate: args.ocmStartDate,
        opportunityDesiredStartDate: args.opportunityDesiredStartDate,
    });
    const requestedDays = resolveRequestedDaysPerWeek(meta);
    const preferredWeekdays = resolvePreferredWeekdays(meta);
    const enrollment = resolveEnrollmentDate({ processInstanceMetadata: meta });

    const committedRows = args.committedAssignments ?? [];
    const proposedRows = args.proposedAssignments ?? [];
    const startResolved = resolveOperationalStartDate({
        committedAssignments: toDateCandidates(committedRows),
        agreementStartDate: args.agreementStartDate,
    });

    const quote =
        args.quoteSnapshot !== undefined
            ? args.quoteSnapshot
            : activeAssignmentQuoteSnapshot(meta);

    const proposed = primarySummary(proposedRows);
    const committed = primarySummary(committedRows);

    const familyFields: AssignmentCardField[] = [
        field("requested_start", EFFECTIVE_DATE_LABELS.requestedStart, formatDate(requestedStart)),
        field(
            "requested_days_per_week",
            EFFECTIVE_DATE_LABELS.requestedDaysPerWeek,
            requestedDays != null ? String(requestedDays) : null,
        ),
        field(
            "preferred_weekdays",
            EFFECTIVE_DATE_LABELS.preferredDays,
            preferredWeekdays.length > 0 ? formatWeekdays(preferredWeekdays) : null,
        ),
        field(
            "enrollment_date",
            EFFECTIVE_DATE_LABELS.enrollmentDate,
            formatDate(enrollment.enrollmentDate),
        ),
    ];

    const proposedFields: AssignmentCardField[] = [
        field(
            "proposed_schedule",
            EFFECTIVE_DATE_LABELS.proposedSchedule,
            proposed?.scheduleTypeLabel
                ?? proposed?.patternLabel
                ?? args.scheduleTypeLabel
                ?? null,
        ),
        field(
            "proposed_assignment_start",
            "Assignment start",
            formatDate(proposed?.start_date ?? null),
        ),
        field(
            "proposed_days",
            EFFECTIVE_DATE_LABELS.preferredDays,
            proposed?.weekdays && proposed.weekdays.length > 0
                ? formatWeekdays(proposed.weekdays)
                : null,
        ),
        field("proposed_hours", "Hours", formatHours(proposed?.arriveTime, proposed?.departTime)),
        field("proposed_room", "Room", proposed?.roomName ?? null),
        field("proposed_program", "Program", proposed?.programLabel ?? null),
    ];

    const quoteStatusLabel = quote
        ? quote.status.charAt(0).toUpperCase() + quote.status.slice(1)
        : null;
    const commercialFields: AssignmentCardField[] = [
        field("quote_offering", "Tuition plan", quote?.offering_label ?? quote?.offering_id ?? null),
        field(
            "quote_amount",
            "Estimate",
            quote ? formatMoneyCents(quote.amount_cents, quote.currency) : null,
        ),
        field("quote_status", "Status", quoteStatusLabel),
        field("quote_effective", "Effective", formatDate(quote?.effective_date ?? null)),
    ];

    const committedFields: AssignmentCardField[] = [
        field("start_date", EFFECTIVE_DATE_LABELS.startDate, formatDate(startResolved.startDate)),
        field(
            "committed_schedule",
            EFFECTIVE_DATE_LABELS.committedSchedule,
            committed?.scheduleTypeLabel ?? committed?.patternLabel ?? null,
        ),
        field(
            "committed_days",
            "Days",
            committed?.weekdays && committed.weekdays.length > 0
                ? formatWeekdays(committed.weekdays)
                : null,
        ),
        field("committed_hours", "Hours", formatHours(committed?.arriveTime, committed?.departTime)),
        field("committed_room", "Room", committed?.roomName ?? null),
        field("committed_program", "Program", committed?.programLabel ?? null),
    ];

    const readiness = args.readiness ?? { ready: true, gaps: [] };
    const readinessGaps = readiness.gaps ?? [];

    const sections: AssignmentCardSection[] = [
        section("family_request", familyFields),
        section("proposed_assignment", proposedFields),
        section("commercial_estimate", commercialFields),
        section("committed_assignment", committedFields),
        section("readiness_gaps", [], readinessGaps),
    ];

    const readinessReady = readiness.ready;
    const readinessGapCount = readinessGaps.length;

    return {
        sections,
        summaryLine: buildSummaryLine({
            requestedStart,
            startDate: startResolved.startDate,
            hasProposed: Boolean(proposed) || Boolean(args.scheduleTypeLabel?.trim()),
            hasCommitted: committedRows.length > 0 || startResolved.source === "agreement_fallback",
            hasQuote: Boolean(quote),
            readinessReady,
            readinessGapCount,
        }),
        requestedStart,
        startDate: startResolved.startDate,
        startDateSource: startResolved.source,
        readinessReady,
        readinessGapCount,
    };
}

/** Convenience: look up a section by key. */
export function assignmentCardSection(
    model: AssignmentCardModel,
    key: AssignmentCardSectionKey,
): AssignmentCardSection | null {
    return model.sections.find((s) => s.key === key) ?? null;
}

/** Convenience: look up a field value by section + field key. */
export function assignmentCardFieldValue(
    model: AssignmentCardModel,
    sectionKey: AssignmentCardSectionKey,
    fieldKey: string,
): string | null {
    const sec = assignmentCardSection(model, sectionKey);
    if (!sec) return null;
    return sec.fields.find((f) => f.key === fieldKey)?.value ?? null;
}
