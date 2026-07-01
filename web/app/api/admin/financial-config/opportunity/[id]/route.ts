import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { formatRateCents } from "@/lib/commercial/tuitionRates";
import type { TuitionBillingPeriod } from "@/lib/commercial/tuitionRates";
import type { FinancialConfigApiResponse, FinancialConfigEnrollment } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import { resolveEnrollmentTuitionRate } from "@/lib/adminV2/runtime/focusPanel/financialConfig/resolveEnrollmentTuitionRate";

function formatRateLabel(rateCents: number, billingPeriod: TuitionBillingPeriod): string {
    const amount = formatRateCents(rateCents);
    const periodLabel: Record<TuitionBillingPeriod, string> = {
        monthly: "month",
        weekly: "week",
        biweekly: "2 weeks",
        annual: "year",
    };
    return `${amount}/${periodLabel[billingPeriod]}`;
}

/**
 * GET /api/admin/financial-config/opportunity/[id]
 *
 * Returns per-child tuition rate resolutions for the given opportunity.
 * Matches each child's desired_program_type + desired_schedule_type against
 * commercial_tuition_rates (org default, with location override when present).
 *
 * Used by the Financial Configuration card expanded overlay.
 * Read-only. No mutations.
 */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    if (!opportunityId) {
        return NextResponse.json({ error: "Missing opportunity id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Verify opportunity belongs to org
    const { data: opp } = await supabase
        .from("opportunities")
        .select("id")
        .eq("id", opportunityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (!opp) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fetch OCMs with child names via join to customer_members
    const { data: ocmRows, error: ocmError } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, desired_program_type, desired_schedule_type, location_id, customer_members(first_name, last_name)"
        )
        .eq("org_id", ctx.orgId)
        .eq("opportunity_id", opportunityId);

    if (ocmError) {
        return NextResponse.json({ error: ocmError.message }, { status: 500 });
    }

    // Collect all location IDs to fetch relevant rates
    const locationIds = [
        ...new Set(
            (ocmRows ?? [])
                .map((r) => (r as Record<string, unknown>).location_id as string | null)
                .filter((id): id is string => id != null)
        ),
    ];

    // Fetch active tuition rates for org (org defaults + relevant locations)
    let rateQuery = supabase
        .from("commercial_tuition_rates")
        .select("id, program_key, schedule_key, rate_cents, billing_period, location_id, is_active, not_offered")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .eq("not_offered", false);

    if (locationIds.length > 0) {
        rateQuery = rateQuery.or(
            `location_id.is.null,location_id.in.(${locationIds.join(",")})`
        );
    } else {
        rateQuery = rateQuery.is("location_id", null);
    }

    const { data: rateRows, error: rateError } = await rateQuery;
    if (rateError) {
        return NextResponse.json({ error: rateError.message }, { status: 500 });
    }

    // Already filtered to active=true, not_offered=false in the query above.
    const rates = (rateRows ?? []) as Array<{
        id: string;
        program_key: string;
        schedule_key: string;
        rate_cents: number;
        billing_period: TuitionBillingPeriod;
        location_id: string | null;
    }>;

    const enrollments: FinancialConfigEnrollment[] = (ocmRows ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const member = r.customer_members as { first_name?: string | null; last_name?: string | null } | null;
        const firstName = member?.first_name ?? null;
        const lastName = member?.last_name ?? null;
        const childLabel =
            [firstName, lastName].filter(Boolean).join(" ").trim() || "Child";

        const programKey = typeof r.desired_program_type === "string" ? r.desired_program_type : null;
        const scheduleKey = typeof r.desired_schedule_type === "string" ? r.desired_schedule_type : null;
        const locationId = typeof r.location_id === "string" ? r.location_id : null;

        const resolvedRate = resolveEnrollmentTuitionRate(
            rates,
            programKey,
            scheduleKey,
            locationId,
            formatRateLabel,
        );

        return {
            ocmId: String(r.id ?? ""),
            childLabel,
            programKey,
            scheduleKey,
            locationId,
            resolvedRate,
        };
    });

    const response: FinancialConfigApiResponse = { enrollments };
    return NextResponse.json(response);
}
