import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { previewDraftChargeForAgreementPeriod } from "@/lib/financials/chargeResolution/draftChargeResolutionService";
import { buildDraftChargePreviewDto } from "@/lib/financials/chargeResolution/previewDraftChargePresentation";
import type { ServicePeriod } from "@/lib/financials/chargeResolution/resolveDraftCharges";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Financial Charge Preview API (P3.3.1) — read-only.
 *
 * Resolves what a draft charge WOULD be for a billable source + service period —
 * resolved rate, schedule basis, quantity, amount, currency, responsibility,
 * resolution key, and (advisory) what a write would do — WITHOUT writing any
 * charge. Strictly Financial Resolution preview: no posting, no invoices, no AR,
 * no ledger/GL writes. The drafting (write) path is the separate, explicit
 * surface; this endpoint never mutates.
 *
 * This is the generic financial preview surface. The childcare/enrollment
 * billable source is selected here via the `enrollment_agreement_id` parameter
 * (a billable-source-specific input); the returned DTO names the source
 * generically as `billableSource.type = "enrollment_agreement"`.
 *
 * Financial role-gated (admin/ops) to match the money write posture, even though
 * it is read-only.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const enrollmentAgreementId = (searchParams.get("enrollment_agreement_id") ?? "").trim();
    const periodStart = (searchParams.get("period_start") ?? "").trim();
    const periodEnd = (searchParams.get("period_end") ?? "").trim();
    const periodKey = (searchParams.get("period_key") ?? "").trim() || periodStart.slice(0, 7);
    const asOfDate = (searchParams.get("as_of") ?? "").trim() || undefined;
    const planKey = (searchParams.get("plan_key") ?? "").trim() || undefined;
    const ageGroupParam = searchParams.get("age_group_key");

    if (!enrollmentAgreementId) {
        return NextResponse.json(
            { error: "enrollment_agreement_id is required", code: "invalid_input" },
            { status: 400 }
        );
    }
    if (!ISO_DATE_RE.test(periodStart) || !ISO_DATE_RE.test(periodEnd)) {
        return NextResponse.json(
            { error: "period_start and period_end must be YYYY-MM-DD", code: "invalid_input" },
            { status: 400 }
        );
    }
    if (periodEnd < periodStart) {
        return NextResponse.json(
            { error: "period_end must be on or after period_start", code: "invalid_input" },
            { status: 400 }
        );
    }
    if (asOfDate && !ISO_DATE_RE.test(asOfDate)) {
        return NextResponse.json(
            { error: "as_of must be YYYY-MM-DD", code: "invalid_input" },
            { status: 400 }
        );
    }

    const period: ServicePeriod = { key: periodKey, start: periodStart, end: periodEnd };

    const supabase = createAdminClient();
    try {
        const preview = await previewDraftChargeForAgreementPeriod(supabase, {
            orgId: ctx.orgId,
            enrollmentAgreementId,
            period,
            asOfDate,
            planKey,
            // `age_group_key` omitted => derive from placement; empty string => explicit null.
            ageGroupKey: ageGroupParam === null ? undefined : ageGroupParam.trim() || null,
        });
        const dto = buildDraftChargePreviewDto(preview, period);
        return NextResponse.json({ preview: dto, period });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
