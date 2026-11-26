/**
 * Build an Assignments card model from Focus Panel truth + scheduling projection
 * for one child (customer_member grain). Pure assembly — no fetch.
 */

import {
    buildAssignmentCardModel,
    type AssignmentCardAssignmentSummary,
    type AssignmentCardModel,
    type BuildAssignmentCardModelArgs,
} from "@/lib/enrollment/buildAssignmentCardModel";
import {
    evaluateAssignmentProposalReadiness,
    assignmentFactorFromLifecycleRuleId,
    type AssignmentReadinessFactorKey,
} from "@/lib/enrollment/assignmentProposalReadiness";
import { activeAssignmentQuoteSnapshot } from "@/lib/enrollment/assignmentQuoteSnapshot";

type ProjAssignment = {
    id: string;
    startDate?: string | null;
    endDate?: string | null;
    status?: string | null;
    commitmentKind?: string | null;
    weekdays?: number[] | null;
    scheduleTypeLabel?: string | null;
    room?: { name?: string | null; program?: string | null } | null;
    patternLabel?: string | null;
    arriveTime?: string | null;
    departTime?: string | null;
    subjectType?: string | null;
};

type ChildProjection = {
    current?: { assignments?: ProjAssignment[] } | null;
    proposed?: { assignments?: ProjAssignment[] } | null;
    draft?: {
        startDate?: string | null;
        scheduleTypeLabel?: string | null;
        weekdays?: number[] | null;
    } | null;
} | null;

function asSummary(a: ProjAssignment, kind: "proposed" | "committed"): AssignmentCardAssignmentSummary {
    return {
        id: a.id,
        start_date: String(a.startDate ?? "").slice(0, 10),
        end_date: a.endDate ? String(a.endDate).slice(0, 10) : null,
        status: String(a.status ?? (kind === "proposed" ? "planned" : "active")),
        commitment_kind: a.commitmentKind ?? kind,
        weekdays: Array.isArray(a.weekdays) ? a.weekdays : null,
        scheduleTypeLabel: a.scheduleTypeLabel ?? a.patternLabel ?? null,
        roomName: a.room?.name ?? null,
        programLabel: a.room?.program ?? null,
        arriveTime: a.arriveTime ?? null,
        departTime: a.departTime ?? null,
        patternLabel: a.patternLabel ?? null,
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
    // Fallback: child row may carry participation keys after overlay.
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
    if (proposed.length === 0 && proj?.draft?.scheduleTypeLabel) {
        proposed.push({
            id: `draft:${args.customerMemberId}`,
            start_date: String(proj.draft.startDate ?? meta.start_date ?? "").slice(0, 10) || "1970-01-01",
            status: "planned",
            commitment_kind: "proposed",
            weekdays: proj.draft.weekdays ?? null,
            scheduleTypeLabel: proj.draft.scheduleTypeLabel,
        });
    }

    const factors = requiredAssignmentFactorsFromRuleIds(args.requiredRuleIds);
    const readiness =
        factors.length > 0
            ? evaluateAssignmentProposalReadiness({
                  requiredFactors: factors,
                  facts: {
                      processInstanceMetadata: meta,
                      locationId: (meta.location_id as string | null) ?? null,
                      programCategoryId: (meta.program_category_id as string | null) ?? null,
                      roomLocationId: (meta.program_room_cohort_key as string | null) ?? null,
                      scheduleType: (meta.schedule_type as string | null) ?? null,
                      hasProposedSchedule: proposed.length > 0,
                      proposedAssignmentStart: proposed[0]?.start_date ?? null,
                      tuitionPlanId: (meta.tuition_plan_id as string | null) ?? null,
                      hasQuoteSnapshot: Boolean(activeAssignmentQuoteSnapshot(meta)),
                      quoteAccepted: Boolean(meta.quote_accepted),
                      enrollmentPaperworkComplete: Boolean(meta.enrollment_date),
                  },
              })
            : { ready: true, gaps: [] };

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
        readiness,
        ...args.override,
    });
}
