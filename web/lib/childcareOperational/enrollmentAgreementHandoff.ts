/**
 * Idempotent operational enrollment handoff from approved opportunity / OCM rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { emitOperationalEnrollmentHandoffSummaryEvent } from "@/lib/childcareOperational/operationalEnrollmentEvents";
import {
    applyChildEnrollmentMaterialization,
    type HandoffStepOutcome,
    type ResolvedEnrollmentFacts,
} from "@/lib/childcareOperational/materializeChildEnrollment";

export type { HandoffStepOutcome };

const HANDOFF_SOURCE_KEY = "approve_enrollment_handoff";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

export type ChildOperationalEnrollmentHandoffResult = {
    opportunity_customer_member_id: string;
    customer_member_id: string | null;
    site_location_id: string | null;
    skipped: boolean;
    skip_reason?: string;
    agreement: {
        outcome: HandoffStepOutcome | "error";
        id?: string;
        error?: string;
    };
    placement: {
        outcome: HandoffStepOutcome;
        id?: string;
        warning?: string;
    };
    schedule_assignment: {
        outcome: HandoffStepOutcome;
        id?: string;
        warning?: string;
    };
    warnings: string[];
};

export type OperationalEnrollmentHandoffResult = {
    ok: boolean;
    error?: string;
    partial: boolean;
    opportunity_id: string;
    children: ChildOperationalEnrollmentHandoffResult[];
};

type OcmHandoffRow = {
    id: string;
    customer_member_id: string | null;
    location_id: string | null;
    program_category_id: string | null;
    program_room_cohort_key: string | null;
    schedule_type: string | null;
    start_date: string | null;
    person_id?: string | null;
};

export type ExecuteOperationalEnrollmentHandoffInput = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    actorUserId?: string | null;
    todayYmd: string;
    enrollmentDateYmd?: string | null;
    emitEvents?: boolean;
    correlationId?: string | null;
};

async function loadHandoffContext(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<{
    opportunityLocationId: string | null;
    customerId: string | null;
    ocmRows: OcmHandoffRow[];
}> {
    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("location_id, customer_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .maybeSingle();

    if (oppErr) {
        throw new OperationalEnrollmentServiceError("db_error", oppErr.message);
    }
    if (!opp) {
        throw new OperationalEnrollmentServiceError("not_found", "Opportunity not found");
    }

    const { data: ocmData, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, location_id, program_category_id, program_room_cohort_key, schedule_type, start_date, person_id"
        )
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    if (ocmErr) {
        throw new OperationalEnrollmentServiceError("db_error", ocmErr.message);
    }

    const oppRow = opp as { location_id?: string | null; customer_id?: string | null };
    return {
        opportunityLocationId: trimOrNull(oppRow.location_id),
        customerId: trimOrNull(oppRow.customer_id),
        ocmRows: (ocmData ?? []) as OcmHandoffRow[],
    };
}

async function handoffSingleChild(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    customerId: string | null;
    opportunityLocationId: string | null;
    ocm: OcmHandoffRow;
    todayYmd: string;
    startDateYmd: string;
    actorUserId?: string | null;
    emitEvents: boolean;
    correlationId?: string | null;
}): Promise<ChildOperationalEnrollmentHandoffResult> {
    const warnings: string[] = [];
    const result: ChildOperationalEnrollmentHandoffResult = {
        opportunity_customer_member_id: input.ocm.id,
        customer_member_id: trimOrNull(input.ocm.customer_member_id),
        site_location_id: null,
        skipped: false,
        agreement: { outcome: "skipped" },
        placement: { outcome: "skipped" },
        schedule_assignment: { outcome: "skipped" },
        warnings,
    };

    const customerMemberId = trimOrNull(input.ocm.customer_member_id);
    if (!customerMemberId) {
        result.skipped = true;
        result.skip_reason = "missing_customer_member_id";
        result.agreement = { outcome: "skipped" };
        return result;
    }

    let siteLocationId = trimOrNull(input.ocm.location_id);
    if (!siteLocationId && input.opportunityLocationId) {
        siteLocationId = input.opportunityLocationId;
        warnings.push("site_resolved_from_opportunity_location_id");
    }
    result.site_location_id = siteLocationId;

    if (!siteLocationId) {
        result.skipped = true;
        result.skip_reason = "missing_site_location_id";
        result.agreement = { outcome: "error", error: "No site location on OCM or opportunity" };
        return result;
    }

    // Legacy path resolves facts from the OCM row, then delegates to the shared materialization core.
    const facts: ResolvedEnrollmentFacts = {
        customerMemberId,
        siteLocationId,
        startDate: input.startDateYmd,
        programCategoryId: trimOrNull(input.ocm.program_category_id),
        roomLocationId: trimOrNull(input.ocm.program_room_cohort_key),
        scheduleType: trimOrNull(input.ocm.schedule_type),
        opportunityCustomerMemberId: input.ocm.id,
        personId: trimOrNull(input.ocm.person_id),
    };

    const trio = await applyChildEnrollmentMaterialization(input.supabase, {
        orgId: input.orgId,
        opportunityId: input.opportunityId,
        customerId: input.customerId,
        facts,
        todayYmd: input.todayYmd,
        sourceKey: HANDOFF_SOURCE_KEY,
        actorUserId: input.actorUserId,
        emitEvents: input.emitEvents,
        correlationId: input.correlationId,
        agreementMetadata: { handoff: true, ...(warnings.length ? { handoff_warnings: [...warnings] } : {}) },
    });

    result.agreement = trio.agreement;
    result.placement = trio.placement;
    result.schedule_assignment = trio.schedule_assignment;
    result.warnings = [...warnings, ...trio.warnings];
    return result;
}

export async function executeOperationalEnrollmentHandoffFromApprovedOpportunity(
    input: ExecuteOperationalEnrollmentHandoffInput
): Promise<OperationalEnrollmentHandoffResult> {
    const emitEvents = input.emitEvents !== false;
    const ctx = await loadHandoffContext(input.supabase, input.orgId, input.opportunityId);

    const children: ChildOperationalEnrollmentHandoffResult[] = [];
    const allWarnings: string[] = [];
    let hasAgreementError = false;

    for (const ocm of ctx.ocmRows) {
        const startDateYmd =
            trimOrNull(ocm.start_date) ??
            trimOrNull(input.enrollmentDateYmd) ??
            input.todayYmd;

        const childResult = await handoffSingleChild({
            supabase: input.supabase,
            orgId: input.orgId,
            opportunityId: input.opportunityId,
            customerId: ctx.customerId,
            opportunityLocationId: ctx.opportunityLocationId,
            ocm,
            todayYmd: input.todayYmd,
            startDateYmd,
            actorUserId: input.actorUserId,
            emitEvents,
            correlationId: input.correlationId,
        });
        children.push(childResult);
        allWarnings.push(...childResult.warnings);

        if (childResult.agreement.outcome === "error" && !childResult.skipped) {
            hasAgreementError = true;
        }
    }

    const partial =
        allWarnings.length > 0 ||
        children.some(
            (c) =>
                c.placement.outcome === "warning" ||
                c.schedule_assignment.outcome === "warning" ||
                c.placement.warning != null ||
                c.schedule_assignment.warning != null
        );

    if (emitEvents && children.length > 0) {
        await emitOperationalEnrollmentHandoffSummaryEvent({
            orgId: input.orgId,
            opportunityId: input.opportunityId,
            partial,
            childCount: children.length,
            warnings: allWarnings,
            ctx: {
                actorUserId: input.actorUserId,
                correlationId: input.correlationId,
            },
        });
    }

    if (hasAgreementError) {
        const failed = children.find((c) => c.agreement.outcome === "error");
        return {
            ok: false,
            error: failed?.agreement.error ?? "Operational enrollment agreement handoff failed",
            partial,
            opportunity_id: input.opportunityId,
            children,
        };
    }

    return {
        ok: true,
        partial,
        opportunity_id: input.opportunityId,
        children,
    };
}
