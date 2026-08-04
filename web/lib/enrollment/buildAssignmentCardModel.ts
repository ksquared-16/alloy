/**
 * Assignments Focus Panel card — operational assignment offer model.
 *
 * The card answers: where is this child being assigned, when, on what schedule,
 * and under what commercial arrangement? Family-request facts (Requested Start /
 * Days / Preferred Weekdays) are child-enrollment fields — not Assignment sections.
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
    /** Config/readiness marks this offer field as required. */
    required?: boolean;
    /** Required and currently empty. */
    missing?: boolean;
};

/** @deprecated Prefer AssignmentCardModel.fields */
export type AssignmentCardSection = {
    key: AssignmentCardSectionKey;
    title: string;
    fields: AssignmentCardField[];
    gaps: AssignmentReadinessGap[];
    empty: boolean;
};

export type AssignmentCardState = "none" | "proposed" | "committed";

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
    quoteSnapshot?: AssignmentQuoteSnapshot | null;
    readiness?: AssignmentReadinessResult | null;
};

export type AssignmentCardModel = {
    /** Compact operational state for the offer. */
    state: AssignmentCardState;
    stateLabel: string;
    /** Offer fields in reading order (site → … → quote). */
    fields: AssignmentCardField[];
    /** e.g. "Ready to commit" / "3 items required". */
    readinessSummary: string;
    readinessReady: boolean;
    readinessGapCount: number;
    readinessGaps: AssignmentReadinessGap[];
    summaryLine: string;
    /** Family Requested Start — for Children/comparison only; not an Assignment section. */
    requestedStart: string | null;
    startDate: string | null;
    startDateSource: "committed_assignment" | "agreement_fallback" | null;
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

function buildSummaryLine(args: {
    state: AssignmentCardState;
    startDate: string | null;
    readinessSummary: string;
    readinessReady: boolean;
}): string {
    if (!args.readinessReady) return args.readinessSummary;
    if (args.state === "committed" && args.startDate) {
        return `Committed · ${EFFECTIVE_DATE_LABELS.startDate} ${formatDate(args.startDate)}`;
    }
    if (args.state === "committed") return "Committed";
    if (args.state === "proposed") return "Proposed assignment";
    return "No assignment yet";
}

function stateLabelFor(state: AssignmentCardState, startDate: string | null): string {
    if (state === "committed") {
        return startDate
            ? `Committed · Effective ${formatDate(startDate)}`
            : "Committed";
    }
    if (state === "proposed") return "Proposed assignment";
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
    const active = committed ?? proposed;

    const hasCommitted =
        committedRows.length > 0 || startResolved.source === "agreement_fallback";
    const hasProposed =
        Boolean(proposed) || Boolean(args.scheduleTypeLabel?.trim()) || Boolean(quote);
    const state: AssignmentCardState = hasCommitted
        ? "committed"
        : hasProposed
          ? "proposed"
          : "none";

    const readiness = args.readiness ?? { ready: true, gaps: [] };
    const factors = gapFactors(readiness);

    const siteValue =
        active?.siteLabel
        ?? args.siteLabel
        ?? (typeof meta?.location_label === "string" ? meta.location_label : null)
        ?? null;
    const programValue =
        active?.programLabel
        ?? (typeof meta?.program_label === "string" ? meta.program_label : null)
        ?? null;
    const roomValue = active?.roomName ?? null;
    const scheduleValue = buildScheduleLabel(
        active,
        args.scheduleTypeLabel
            ?? (typeof meta?.schedule_type === "string" ? meta.schedule_type : null),
    );
    const startValue =
        state === "committed"
            ? formatDate(startResolved.startDate)
            : formatDate(proposed?.start_date ?? startResolved.startDate);
    const tuitionPlan =
        quote?.offering_label
        ?? quote?.offering_id
        ?? (typeof meta?.tuition_plan_id === "string" ? meta.tuition_plan_id : null);
    const estimate = quote
        ? formatMoneyCents(quote.amount_cents, quote.currency)
        : null;
    const quoteStatus = quote
        ? `Generated ${formatFocusPanelDate(quote.generated_at.slice(0, 10)) ?? quote.generated_at.slice(0, 10)}`
        : null;

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
    const readinessSummary = buildReadinessSummary(readinessReady, readinessGapCount);
    const stateLabel = stateLabelFor(state, startResolved.startDate);

    // Deprecated section adapter — keep authority field lookups working in older tests
    // without driving the public card chrome.
    const sections: AssignmentCardSection[] = [
        {
            key: "proposed_assignment",
            title: ASSIGNMENT_CARD_SECTION_TITLES.proposed_assignment,
            fields: fields.filter((f) =>
                ["site", "program", "room", "schedule", "start_date"].includes(f.key),
            ),
            gaps: [],
            empty: state === "none",
        },
        {
            key: "commercial_estimate",
            title: ASSIGNMENT_CARD_SECTION_TITLES.commercial_estimate,
            fields: fields.filter((f) =>
                ["tuition_plan", "estimated_tuition", "quote"].includes(f.key),
            ),
            gaps: [],
            empty: !quote,
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
            gaps: readiness.gaps ?? [],
            empty: readinessGapCount === 0,
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
        state,
        stateLabel,
        fields,
        readinessSummary,
        readinessReady,
        readinessGapCount,
        readinessGaps: readiness.gaps ?? [],
        summaryLine: buildSummaryLine({
            state,
            startDate: startResolved.startDate,
            readinessSummary,
            readinessReady,
        }),
        requestedStart,
        startDate: startResolved.startDate,
        startDateSource: startResolved.source,
        quoteGeneratedAt: quote?.generated_at ?? null,
        sections,
    };
}

/** @deprecated Prefer model.fields */
export function assignmentCardSection(
    model: AssignmentCardModel,
    key: AssignmentCardSectionKey,
): AssignmentCardSection | null {
    return model.sections.find((s) => s.key === key) ?? null;
}

/** @deprecated Prefer model.fields */
export function assignmentCardFieldValue(
    model: AssignmentCardModel,
    sectionKey: AssignmentCardSectionKey,
    fieldKey: string,
): string | null {
    if (sectionKey === "family_request" && fieldKey === "requested_start") {
        return formatDate(model.requestedStart);
    }
    if (sectionKey === "committed_assignment" && fieldKey === "start_date") {
        return formatDate(model.startDate);
    }
    const fromOffer = model.fields.find((f) => f.key === fieldKey);
    if (fromOffer) return fromOffer.value;
    const sec = assignmentCardSection(model, sectionKey);
    if (!sec) return null;
    return sec.fields.find((f) => f.key === fieldKey)?.value ?? null;
}
