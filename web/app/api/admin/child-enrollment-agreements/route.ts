import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    createChildEnrollmentAgreement,
    listChildEnrollmentAgreements,
} from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    operationalEnrollmentErrorResponse,
    parseJsonObject,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { searchParams } = new URL(request.url);
    const customerMemberId = (searchParams.get("customer_member_id") ?? "").trim();
    const siteLocationId = (searchParams.get("site_location_id") ?? "").trim();
    const opportunityId = (searchParams.get("opportunity_id") ?? "").trim();
    const opportunityCustomerMemberId = (
        searchParams.get("opportunity_customer_member_id") ?? ""
    ).trim();
    const status = (searchParams.get("status") ?? "").trim();

    const supabase = createAdminClient();
    try {
        const agreements = await listChildEnrollmentAgreements(supabase, ctx.orgId, {
            customerMemberId: customerMemberId || undefined,
            siteLocationId: siteLocationId || undefined,
            opportunityId: opportunityId || undefined,
            opportunityCustomerMemberId: opportunityCustomerMemberId || undefined,
            status: status || undefined,
        });
        return NextResponse.json({ agreements });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const customerMemberId = String(body.customer_member_id ?? "").trim();
    const siteLocationId = String(body.site_location_id ?? "").trim();
    if (!customerMemberId || !siteLocationId) {
        return NextResponse.json(
            {
                error: "customer_member_id and site_location_id are required",
                code: "invalid_input",
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ctx.orgId,
            customerMemberId,
            siteLocationId,
            startDate: body.start_date != null ? String(body.start_date) : null,
            opportunityId: body.opportunity_id != null ? String(body.opportunity_id) : null,
            opportunityCustomerMemberId:
                body.opportunity_customer_member_id != null
                    ? String(body.opportunity_customer_member_id)
                    : null,
            customerId: body.customer_id != null ? String(body.customer_id) : null,
            personId: body.person_id != null ? String(body.person_id) : null,
            sourceKey: body.source_key != null ? String(body.source_key) : undefined,
            activationPolicyKey:
                body.activation_policy_key != null ? String(body.activation_policy_key) : null,
            metadata: parseJsonObject(body.metadata),
            actorUserId: ctx.userId,
            todayYmd,
        });
        return NextResponse.json({ agreement }, { status: 201 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
