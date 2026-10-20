import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { buildOpportunityTuitionViews } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import type { FinancialConfigApiResponse } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/financial-config/opportunity/[id]
 *
 * The tuition standing of every assignment on an opportunity: what the catalog offers, what is
 * recommended, what has been accepted, and whether the assignment has moved since.
 *
 * ── WHY THIS ROUTE WAS REWRITTEN ──
 *
 * It selected `program_key`, `schedule_key` and `billing_period` from `commercial_tuition_rates` —
 * columns `20260702000002_commercial_tuition_rates_v2` DROPPED in July, in favour of
 * `variant_id` / `cadence_key` / `payer_type`. PostgREST answered `42703 column
 * commercial_tuition_rates.program_key does not exist`, so this route returned 500 and the surface
 * above it could never show a tuition figure at all. Its unit tests stayed green throughout,
 * because they built their own rows in the dropped shape.
 *
 * It also carried its own matching algorithm — a third one, beside Commercial Execution's and the
 * childcare rate plans' — which is how it drifted from the schema without anyone noticing. There is
 * now exactly one: `resolveAssignmentPricingOptions`, reached through
 * `buildAssignmentTuitionView`, which this route and the assignment-tuition route both call.
 *
 * Read-only. No mutations. Accepting a price is a registered action, not a GET.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: opportunityId } = await context.params;
    if (!opportunityId) {
        return NextResponse.json({ error: "Missing opportunity id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: opp } = await supabase
        .from("opportunities")
        .select("id")
        .eq("id", opportunityId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!opp) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    /*
     * A DRAFT ROOM CHOICE. The Assignments card asks "what would tuition be in the room I just
     * picked?" before saving. The room's Program arrives as a category id and resolves to its key
     * here; the one named child's view is resolved in that program and marked `draft`. Nothing is
     * written, and a commit still re-reads the saved assignment.
     */
    const draftMemberId = request.nextUrl.searchParams.get("draft_customer_member_id")?.trim() || null;
    const draftProgramCategoryId = request.nextUrl.searchParams.get("draft_program_category_id")?.trim() || null;
    let draft: { customerMemberId: string; programKey: string } | null = null;
    if (draftMemberId && draftProgramCategoryId) {
        const { data: category } = await supabase
            .from("location_program_categories")
            .select("key")
            .eq("id", draftProgramCategoryId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const key = typeof category?.key === "string" ? category.key.trim() : "";
        if (key) draft = { customerMemberId: draftMemberId, programKey: key };
    }

    const views = await buildOpportunityTuitionViews(supabase, {
        orgId: ctx.orgId,
        opportunityId,
        draft,
    });

    /*
     * The legacy `resolvedRate` shape is still emitted, populated ONLY from a deterministic
     * recommendation. Ambiguity and no-match stay null there, because a caller reading the old
     * field must never be handed one of several equally-valid answers as though it were the answer.
     * Everything richer lives on `assignments`.
     */
    const body: FinancialConfigApiResponse = {
        enrollments: views.map((v) => ({
            ocmId: v.opportunityCustomerMemberId,
            childLabel: v.childLabel,
            programKey: v.facts.programKey,
            scheduleKey: v.facts.attendanceType,
            locationId: v.facts.locationId,
            resolvedRate:
                v.recommended
                    ? {
                          rateId: v.recommended.sourceId,
                          rateCents: v.recommended.amountCents,
                          billingPeriod: v.recommended.cadenceKey,
                          rateLabel: v.recommended.amountLabel,
                          isLocationOverride: v.recommended.scope === "location",
                      }
                    : null,
        })),
        assignments: views,
    };
    return NextResponse.json(body);
}
