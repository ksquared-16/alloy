/**
 * Build an Assignments card model from Focus Panel truth + scheduling projection
 * for one child (customer_member grain). Pure assembly — no fetch.
 *
 * Emits one card entry per proposed/committed OA (and optional interests).
 */

import {
    buildAssignmentCardModel,
    type AssignmentCardAssignmentSummary,
    type AssignmentCardInterest,
    type AssignmentCardModel,
    type BuildAssignmentCardModelArgs,
} from "@/lib/enrollment/buildAssignmentCardModel";
import {
    evaluateAssignmentProposalReadiness,
    assignmentFactorFromLifecycleRuleId,
    type AssignmentReadinessFactorKey,
    type AssignmentReadinessResult,
} from "@/lib/enrollment/assignmentProposalReadiness";
import { activeAssignmentQuoteSnapshot } from "@/lib/enrollment/assignmentQuoteSnapshot";

type ProjAssignment = {
    id: string;
    /** Projection uses effectiveFrom; some adapters use startDate. */
    startDate?: string | null;
    effectiveFrom?: string | null;
    endDate?: string | null;
    effectiveTo?: string | null;
    status?: string | null;
    commitmentKind?: string | null;
    weekdays?: number[] | null;
    scheduleTypeLabel?: string | null;
    room?: { name?: string | null; program?: string | null } | null;
    patternLabel?: string | null;
    arriveTime?: string | null;
    departTime?: string | null;
    subjectType?: string | null;
    isPrimary?: boolean | null;
    assignmentType?: {
        key?: string | null;
        label?: string | null;
    } | null;
};

type ChildProjection = {
    current?: { assignments?: ProjAssignment[]; scheduleTypeLabel?: string | null } | null;
    proposed?: { assignments?: ProjAssignment[]; scheduleTypeLabel?: string | null } | null;
    draft?: {
        startDate?: string | null;
        scheduleTypeLabel?: string | null;
        weekdays?: number[] | null;
    } | null;
} | null;

function asSummary(a: ProjAssignment, kind: "proposed" | "committed"): AssignmentCardAssignmentSummary {
    const start = String(a.startDate ?? a.effectiveFrom ?? "").slice(0, 10);
    const endRaw = a.endDate ?? a.effectiveTo ?? null;
    return {
        id: a.id,
        start_date: start,
        end_date: endRaw ? String(endRaw).slice(0, 10) : null,
        status: String(a.status ?? (kind === "proposed" ? "planned" : "active")),
        commitment_kind: a.commitmentKind ?? kind,
        weekdays: Array.isArray(a.weekdays) ? a.weekdays : null,
        scheduleTypeLabel: a.scheduleTypeLabel ?? a.patternLabel ?? null,
        roomName: a.room?.name ?? null,
        programLabel: a.room?.program ?? null,
        arriveTime: a.arriveTime ?? null,
        departTime: a.departTime ?? null,
        patternLabel: a.patternLabel ?? null,
        assignmentTypeLabel: a.assignmentType?.label ?? null,
        assignmentTypeKey: a.assignmentType?.key ?? null,
        isPrimary: a.isPrimary ?? null,
        // Non-primary concurrent services do not establish Enrollment Start by default.
        establishesEnrollment: a.isPrimary === false ? false : true,
    };
}

function metaFromTruth(truth: Record<string, unknown>, customerMemberId: string): Record<string, unknown> {
    const bag = truth._enrollment_participation_by_member;
    if (bag && typeof bag === "object" && !Array.isArray(bag)) {
        const row = (bag as Record<string, unknown>)[customerMemberId];
        if (row && typeof row === "object" && !Array.isArray(row)) {
            return row as Record<string, unknown>;
        }
    }
    const children = Array.isArray(truth._inquiry_children) ? (truth._inquiry_children as Record<string, unknown>[]) : [];
    const child = children.find((c) => String(c.customer_member_id ?? "") === customerMemberId);
    if (!child) return {};
    const meta: Record<string, unknown> = {};
    for (const key of [
        "start_date",
        "schedule_type",
        "program_category_id",
        "location_id",
        "program_room_cohort_key",
        "requested_days_per_week",
        "weekdays",
        "tuition_plan_id",
        "quote_accepted",
        "enrollment_date",
        "assignment_quote_snapshots",
        "assignment_interests",
    ]) {
        if (child[key] !== undefined) meta[key] = child[key];
        const nested = child.participation_metadata;
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
            const n = nested as Record<string, unknown>;
            if (n[key] !== undefined) meta[key] = n[key];
        }
    }
    return meta;
}

function interestsFromMeta(meta: Record<string, unknown>): AssignmentCardInterest[] {
    const raw = meta.assignment_interests;
    if (!Array.isArray(raw)) return [];
    const out: AssignmentCardInterest[] = [];
    for (const row of raw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : null;
        const label =
            (typeof r.label === "string" && r.label.trim() ? r.label.trim() : null)
            ?? (typeof r.offering_label === "string" && r.offering_label.trim()
                ? r.offering_label.trim()
                : null);
        if (!id || !label) continue;
        out.push({
            id,
            label,
            assignmentTypeKey:
                typeof r.assignment_type_key === "string" ? r.assignment_type_key : null,
            assignmentTypeLabel:
                typeof r.assignment_type_label === "string" ? r.assignment_type_label : null,
        });
    }
    return out;
}

export function requiredAssignmentFactorsFromRuleIds(
    ruleIds: readonly string[] | null | undefined,
): AssignmentReadinessFactorKey[] {
    if (!ruleIds?.length) return [];
    const out: AssignmentReadinessFactorKey[] = [];
    const seen = new Set<string>();
    for (const id of ruleIds) {
        const factor = assignmentFactorFromLifecycleRuleId(id);
        if (!factor || seen.has(factor)) continue;
        seen.add(factor);
        out.push(factor);
    }
    return out;
}

function readinessForRow(args: {
    row: AssignmentCardAssignmentSummary;
    meta: Record<string, unknown>;
    factors: AssignmentReadinessFactorKey[];
}): AssignmentReadinessResult {
    if (args.factors.length === 0) return { ready: true, gaps: [] };
    const quote = activeAssignmentQuoteSnapshot(args.meta, args.row.id);
    return evaluateAssignmentProposalReadiness({
        requiredFactors: args.factors,
        facts: {
            processInstanceMetadata: args.meta,
            locationId: (args.meta.location_id as string | null) ?? null,
            programCategoryId: (args.meta.program_category_id as string | null) ?? null,
            roomLocationId: args.row.roomName ? "present" : ((args.meta.program_room_cohort_key as string | null) ?? null),
            scheduleType: args.row.scheduleTypeLabel ?? (args.meta.schedule_type as string | null) ?? null,
            hasProposedSchedule: true,
            proposedAssignmentStart: args.row.start_date || null,
            tuitionPlanId: args.row.tuitionPlanId ?? (args.meta.tuition_plan_id as string | null) ?? null,
            hasQuoteSnapshot: Boolean(quote),
            quoteAccepted: Boolean(args.meta.quote_accepted),
            enrollmentPaperworkComplete: Boolean(args.meta.enrollment_date),
        },
    });
}

export function buildAssignmentCardModelForChild(args: {
    truth: Record<string, unknown>;
    customerMemberId: string;
    projection?: ChildProjection;
    /** Lifecycle rule ids configured as required for the current stage/outcome. */
    requiredRuleIds?: readonly string[] | null;
    override?: Partial<BuildAssignmentCardModelArgs>;
}): AssignmentCardModel {
    const meta = {
        ...metaFromTruth(args.truth, args.customerMemberId),
        ...(args.override?.processInstanceMetadata ?? {}),
    };
    const proj = args.projection ?? null;
    const proposed = (proj?.proposed?.assignments ?? [])
        .filter((a) => a.subjectType !== "staff")
        .map((a) => asSummary(a, "proposed"));
    const committed = (proj?.current?.assignments ?? [])
        .filter((a) => a.subjectType !== "staff")
        .map((a) => asSummary(a, "committed"));

    // Draft schedule intent (pre-OA) is proposed truth — not committed.
    if (proposed.length === 0 && committed.length === 0 && proj?.draft?.scheduleTypeLabel) {
        proposed.push({
            id: `draft:${args.customerMemberId}`,
            start_date: String(proj.draft.startDate ?? meta.start_date ?? "").slice(0, 10) || "1970-01-01",
            status: "planned",
            commitment_kind: "proposed",
            weekdays: proj.draft.weekdays ?? null,
            scheduleTypeLabel: proj.draft.scheduleTypeLabel,
            assignmentTypeLabel: "Proposed schedule",
            establishesEnrollment: true,
            isPrimary: true,
        });
    }

    const factors = requiredAssignmentFactorsFromRuleIds(args.requiredRuleIds);
    const readinessByAssignmentId: Record<string, AssignmentReadinessResult> = {};
    for (const row of [...proposed, ...committed]) {
        readinessByAssignmentId[row.id] = readinessForRow({ row, meta, factors });
    }

    return buildAssignmentCardModel({
        processInstanceMetadata: meta,
        ocmStartDate: null,
        opportunityDesiredStartDate:
            typeof args.truth.metadata === "object" && args.truth.metadata
                ? ((args.truth.metadata as Record<string, unknown>).desired_start_date as string | null)
                : null,
        agreementStartDate: null,
        scheduleTypeLabel: (meta.schedule_type as string | null) ?? proj?.draft?.scheduleTypeLabel ?? null,
        proposedAssignments: proposed,
        committedAssignments: committed,
        interests: interestsFromMeta(meta),
        readinessByAssignmentId,
        ...args.override,
    });
}
