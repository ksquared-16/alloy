import type { SupabaseClient } from "@supabase/supabase-js";
import {
    deriveAgreementStatusFromStartDate,
    isAgreementNonTerminalStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
import type { ChildEnrollmentAgreementRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import {
    assertValidIsoDate,
    isStartDateAfterToday,
    shouldTransitionAgreementEndingToEnded,
    validateEndOnOrAfterStart,
} from "@/lib/childcareOperational/effectiveDating";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { validateSiteLocationRef } from "@/lib/childcareOperational/validateChildcareLocationRefs";
import {
    emitAgreementCanceledEvent,
    emitAgreementEndedEvent,
    emitAgreementEndingScheduledEvent,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";

export type CreateChildEnrollmentAgreementInput = {
    orgId: string;
    customerMemberId: string;
    siteLocationId: string;
    startDate?: string | null;
    opportunityId?: string | null;
    opportunityCustomerMemberId?: string | null;
    customerId?: string | null;
    personId?: string | null;
    sourceKey?: string;
    activationPolicyKey?: string | null;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    todayYmd: string;
};

export async function getAgreementById(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string
): Promise<ChildEnrollmentAgreementRow | null> {
    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", agreementId)
        .maybeSingle();

    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as ChildEnrollmentAgreementRow) : null;
}

/** Operational (non-terminal) agreement for child × site, if any. */
/**
 * The statuses that make an agreement OPERATIONAL for scheduling. Exported so the bulk owner filters
 * on exactly this set — a second literal here is how the plural and singular paths would silently
 * come to disagree about which agreements count.
 */
export const OPERATIONAL_AGREEMENT_STATUSES = ["pending_start", "active", "ending"] as const;

export async function getOperationalAgreementForMemberSite(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string,
    siteLocationId: string
): Promise<ChildEnrollmentAgreementRow | null> {
    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .select("*")
        .eq("org_id", orgId)
        .eq("customer_member_id", customerMemberId)
        .eq("site_location_id", siteLocationId)
        .in("status", OPERATIONAL_AGREEMENT_STATUSES)
        .maybeSingle();

    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as ChildEnrollmentAgreementRow) : null;
}

export type ListChildEnrollmentAgreementsFilters = {
    customerMemberId?: string;
    siteLocationId?: string;
    opportunityId?: string;
    opportunityCustomerMemberId?: string;
    status?: string;
};

export async function listChildEnrollmentAgreements(
    supabase: SupabaseClient,
    orgId: string,
    filters: ListChildEnrollmentAgreementsFilters = {}
): Promise<ChildEnrollmentAgreementRow[]> {
    let q = supabase.from("child_enrollment_agreements").select("*").eq("org_id", orgId);

    if (filters.customerMemberId) {
        q = q.eq("customer_member_id", filters.customerMemberId);
    }
    if (filters.siteLocationId) {
        q = q.eq("site_location_id", filters.siteLocationId);
    }
    if (filters.opportunityId) {
        q = q.eq("opportunity_id", filters.opportunityId);
    }
    if (filters.opportunityCustomerMemberId) {
        q = q.eq("opportunity_customer_member_id", filters.opportunityCustomerMemberId);
    }
    if (filters.status) {
        q = q.eq("status", filters.status);
    }

    q = q.order("created_at", { ascending: false });

    const { data, error } = await q;
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return (data ?? []) as ChildEnrollmentAgreementRow[];
}

export async function createChildEnrollmentAgreement(
    supabase: SupabaseClient,
    input: CreateChildEnrollmentAgreementInput
): Promise<ChildEnrollmentAgreementRow> {
    const orgId = input.orgId;
    const customerMemberId = trimOrNull(input.customerMemberId);
    const siteLocationId = trimOrNull(input.siteLocationId);
    if (!customerMemberId || !siteLocationId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "customerMemberId and siteLocationId are required"
        );
    }

    const startDate = trimOrNull(input.startDate);
    if (startDate) assertValidIsoDate(startDate, "startDate");

    const siteCheck = await validateSiteLocationRef(supabase, orgId, siteLocationId);
    if (!siteCheck.ok) {
        throw new OperationalEnrollmentServiceError("validation_failed", siteCheck.error.message, {
            field: "site_location_id",
        });
    }

    const existing = await getOperationalAgreementForMemberSite(
        supabase,
        orgId,
        customerMemberId,
        siteLocationId
    );
    if (existing) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "An operational agreement already exists for this child at this site",
            { agreement_id: existing.id }
        );
    }

    const status = deriveAgreementStatusFromStartDate(startDate, input.todayYmd);
    const row = {
        org_id: orgId,
        opportunity_id: trimOrNull(input.opportunityId),
        opportunity_customer_member_id: trimOrNull(input.opportunityCustomerMemberId),
        customer_member_id: customerMemberId,
        customer_id: trimOrNull(input.customerId),
        person_id: trimOrNull(input.personId),
        site_location_id: siteLocationId,
        status,
        start_date: startDate,
        end_date: null,
        activation_policy_key: trimOrNull(input.activationPolicyKey),
        source_key: trimOrNull(input.sourceKey) ?? "manual",
        metadata: input.metadata ?? {},
        created_by: trimOrNull(input.actorUserId),
        updated_by: trimOrNull(input.actorUserId),
    };

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .insert(row)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "insert failed");
    }
    return data as ChildEnrollmentAgreementRow;
}

export async function cancelAgreementBeforeStart(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    actorUserId?: string | null
): Promise<ChildEnrollmentAgreementRow> {
    const agreement = await getAgreementById(supabase, orgId, agreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", "Agreement not found");
    }
    if (agreement.status !== "pending_start") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Only pending_start agreements can be canceled before start",
            { status: agreement.status }
        );
    }

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .update({
            status: "canceled",
            updated_by: trimOrNull(actorUserId),
        })
        .eq("org_id", orgId)
        .eq("id", agreementId)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "update failed");
    }
    const row = data as ChildEnrollmentAgreementRow;
    await emitAgreementCanceledEvent({
        orgId,
        agreementId: row.id,
        customerMemberId: row.customer_member_id,
        siteLocationId: row.site_location_id,
        ctx: { actorUserId },
    });
    return row;
}

export async function markAgreementEnding(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    endDate: string,
    todayYmd: string,
    actorUserId?: string | null
): Promise<ChildEnrollmentAgreementRow> {
    assertValidIsoDate(endDate, "endDate");
    assertValidIsoDate(todayYmd, "todayYmd");

    const agreement = await getAgreementById(supabase, orgId, agreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", "Agreement not found");
    }
    if (agreement.status !== "active") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Only active agreements can be marked ending",
            { status: agreement.status }
        );
    }

    const rangeError = validateEndOnOrAfterStart(agreement.start_date, endDate);
    if (rangeError) {
        throw new OperationalEnrollmentServiceError("validation_failed", rangeError.message);
    }

    if (!isStartDateAfterToday(endDate, todayYmd)) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "end_date must be after today when marking agreement ending"
        );
    }

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .update({
            status: "ending",
            end_date: endDate,
            updated_by: trimOrNull(actorUserId),
        })
        .eq("org_id", orgId)
        .eq("id", agreementId)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "update failed");
    }
    const row = data as ChildEnrollmentAgreementRow;
    await emitAgreementEndingScheduledEvent({
        orgId,
        agreementId: row.id,
        customerMemberId: row.customer_member_id,
        siteLocationId: row.site_location_id,
        endDate: row.end_date ?? endDate,
        ctx: { actorUserId },
    });
    return row;
}

export async function markAgreementEnded(
    supabase: SupabaseClient,
    orgId: string,
    agreementId: string,
    actorUserId?: string | null,
    endDate?: string | null
): Promise<ChildEnrollmentAgreementRow> {
    const agreement = await getAgreementById(supabase, orgId, agreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", "Agreement not found");
    }
    if (!isAgreementNonTerminalStatus(agreement.status)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Agreement is already terminal",
            { status: agreement.status }
        );
    }

    const resolvedEnd = trimOrNull(endDate) ?? agreement.end_date;
    if (resolvedEnd) assertValidIsoDate(resolvedEnd, "endDate");

    const { data, error } = await supabase
        .from("child_enrollment_agreements")
        .update({
            status: "ended",
            end_date: resolvedEnd,
            updated_by: trimOrNull(actorUserId),
        })
        .eq("org_id", orgId)
        .eq("id", agreementId)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "update failed");
    }
    const row = data as ChildEnrollmentAgreementRow;
    if (trimOrNull(actorUserId)) {
        await emitAgreementEndedEvent({
            orgId,
            agreementId: row.id,
            customerMemberId: row.customer_member_id,
            siteLocationId: row.site_location_id,
            endDate: row.end_date,
            ctx: { actorUserId },
        });
    }
    return row;
}

/** Transition ending agreements whose end_date is before todayYmd to ended. */
export async function transitionEndingAgreementsToEnded(
    supabase: SupabaseClient,
    orgId: string,
    todayYmd: string,
    filter?: { customerMemberId?: string; siteLocationId?: string }
): Promise<ChildEnrollmentAgreementRow[]> {
    assertValidIsoDate(todayYmd, "todayYmd");

    let q = supabase
        .from("child_enrollment_agreements")
        .select("*")
        .eq("org_id", orgId)
        .eq("status", "ending");

    if (filter?.customerMemberId) {
        q = q.eq("customer_member_id", filter.customerMemberId);
    }
    if (filter?.siteLocationId) {
        q = q.eq("site_location_id", filter.siteLocationId);
    }

    const { data, error } = await q;
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }

    const rows = (data ?? []) as ChildEnrollmentAgreementRow[];
    const updated: ChildEnrollmentAgreementRow[] = [];

    for (const row of rows) {
        if (!shouldTransitionAgreementEndingToEnded(row.status, row.end_date, todayYmd)) continue;
        const ended = await markAgreementEnded(supabase, orgId, row.id, null, row.end_date);
        updated.push(ended);
    }

    return updated;
}
