import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    buildOperationalEnrollmentReadModelForAgreement,
    buildOperationalEnrollmentReadModelForMemberSite,
} from "@/lib/childcareOperational/operationalEnrollmentReadModel";
import {
    listChildEnrollmentAgreements,
} from "@/lib/childcareOperational/enrollmentAgreementService";
import { isAgreementOperationalStatus } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return adminContextFailureResponse(ctx);
    }

    const { searchParams } = new URL(request.url);
    const customerMemberId = (searchParams.get("customer_member_id") ?? "").trim();
    const siteLocationId = (searchParams.get("site_location_id") ?? "").trim();
    const agreementId = (searchParams.get("enrollment_agreement_id") ?? "").trim();

    if (!customerMemberId && !agreementId) {
        return NextResponse.json(
            {
                error: "customer_member_id or enrollment_agreement_id is required",
                code: "invalid_input",
            },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    try {
        if (agreementId) {
            const summary = await buildOperationalEnrollmentReadModelForAgreement(
                supabase,
                ctx.orgId,
                agreementId
            );
            return NextResponse.json({ summary });
        }

        if (siteLocationId) {
            const summary = await buildOperationalEnrollmentReadModelForMemberSite(
                supabase,
                ctx.orgId,
                customerMemberId,
                siteLocationId
            );
            return NextResponse.json({ summary });
        }

        const agreements = await listChildEnrollmentAgreements(supabase, ctx.orgId, {
            customerMemberId,
        });
        const operational = agreements.filter((a) => isAgreementOperationalStatus(a.status));

        if (operational.length === 0) {
            return NextResponse.json({
                summary: {
                    agreement: null,
                    placement: null,
                    scheduleAssignment: null,
                    schedulePattern: null,
                    labels: {
                        site: null,
                        program: null,
                        room: null,
                        schedule: null,
                    },
                    warnings: [],
                },
            });
        }

        if (operational.length > 1) {
            return NextResponse.json(
                {
                    error: "Multiple operational agreements found; specify site_location_id or enrollment_agreement_id",
                    code: "invalid_input",
                    details: {
                        agreement_ids: operational.map((a) => a.id),
                    },
                },
                { status: 400 }
            );
        }

        const summary = await buildOperationalEnrollmentReadModelForAgreement(
            supabase,
            ctx.orgId,
            operational[0].id
        );
        return NextResponse.json({ summary });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
