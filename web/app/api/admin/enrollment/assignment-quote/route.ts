import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { generateAssignmentQuoteSnapshot } from "@/lib/enrollment/generateAssignmentQuote";
import type { TuitionRateCandidate } from "@/lib/adminV2/runtime/focusPanel/financialConfig/resolveEnrollmentTuitionRate";
import {
    ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY,
    activeAssignmentQuoteSnapshot,
} from "@/lib/enrollment/assignmentQuoteSnapshot";

/**
 * POST /api/admin/enrollment/assignment-quote
 *
 * Generate an immutable commercial assignment quote/estimate snapshot for a child's
 * enrollment process instance. Persists onto process_instances.metadata only —
 * never posts ledger charges, invoices, or payments.
 *
 * Body: { customer_member_id, opportunity_id, offering_id? }
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const customerMemberId =
        typeof body.customer_member_id === "string" ? body.customer_member_id.trim() : "";
    const opportunityId =
        typeof body.opportunity_id === "string" ? body.opportunity_id.trim() : "";
    const offeringId =
        typeof body.offering_id === "string" && body.offering_id.trim()
            ? body.offering_id.trim()
            : null;

    if (!customerMemberId) {
        return NextResponse.json({ error: "Missing customer_member_id" }, { status: 400 });
    }
    if (!opportunityId) {
        return NextResponse.json({ error: "Missing opportunity_id" }, { status: 400 });
    }
    // Operator must lock in an explicit plan — never silent auto-match on persist.
    if (!offeringId) {
        return NextResponse.json(
            { error: "Select a tuition plan to lock in the quote." },
            { status: 400 },
        );
    }

    const supabase = createAdminClient();

    const { data: piRows, error: piErr } = await supabase
        .from("process_instances")
        .select("id, metadata")
        .eq("org_id", ctx.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", customerMemberId)
        .eq("context_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(1);

    if (piErr) {
        return NextResponse.json({ error: piErr.message }, { status: 500 });
    }

    const pi = (piRows ?? [])[0] as
        | { id: string; metadata: Record<string, unknown> | null }
        | undefined;
    if (!pi) {
        return NextResponse.json({ error: "no_enrollment_process_instance" }, { status: 404 });
    }

    const metadata = (pi.metadata ?? {}) as Record<string, unknown>;
    const programCategoryId =
        typeof metadata.program_category_id === "string" && metadata.program_category_id.trim()
            ? metadata.program_category_id.trim()
            : null;
    const scheduleKey =
        typeof metadata.schedule_type === "string" && metadata.schedule_type.trim()
            ? metadata.schedule_type.trim()
            : null;
    const locationId =
        typeof metadata.location_id === "string" && metadata.location_id.trim()
            ? metadata.location_id.trim()
            : null;

    let programKey: string | null = null;
    if (programCategoryId) {
        const { data: cat } = await supabase
            .from("location_program_categories")
            .select("key")
            .eq("org_id", ctx.orgId)
            .eq("id", programCategoryId)
            .maybeSingle();
        const key = (cat as { key?: string | null } | null)?.key;
        programKey = typeof key === "string" && key.trim() ? key.trim() : null;
    }

    let rateQuery = supabase
        .from("commercial_tuition_rates")
        .select("id, program_key, schedule_key, rate_cents, billing_period, location_id, is_active, not_offered")
        .eq("org_id", ctx.orgId)
        .eq("is_active", true)
        .eq("not_offered", false);

    if (locationId) {
        rateQuery = rateQuery.or(`location_id.is.null,location_id.eq.${locationId}`);
    } else {
        rateQuery = rateQuery.is("location_id", null);
    }

    const { data: rateRows, error: rateError } = await rateQuery;
    if (rateError) {
        return NextResponse.json({ error: rateError.message }, { status: 500 });
    }

    const rates = (rateRows ?? []) as TuitionRateCandidate[];

    const effectiveDateRaw =
        typeof metadata.start_date === "string" && metadata.start_date.trim()
            ? metadata.start_date.trim()
            : new Date().toISOString();

    const result = generateAssignmentQuoteSnapshot({
        metadata,
        rates,
        programKey,
        scheduleKey,
        locationId,
        offeringId,
        effectiveDate: effectiveDateRaw,
        actorUserId: ctx.userId,
        snapshotId: crypto.randomUUID(),
        pricingInputsExtra: {
            customer_member_id: customerMemberId,
            opportunity_id: opportunityId,
            program_category_id: programCategoryId,
        },
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const { error: updateErr } = await supabase
        .from("process_instances")
        .update({
            metadata: result.metadata,
            updated_at: new Date().toISOString(),
        })
        .eq("id", pi.id)
        .eq("org_id", ctx.orgId);

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const active = activeAssignmentQuoteSnapshot(result.metadata);

    return NextResponse.json({
        ok: true,
        process_instance_id: pi.id,
        snapshot: result.snapshot,
        active_snapshot: active,
        metadata_keys: {
            tuition_plan_id: result.metadata.tuition_plan_id ?? null,
            [ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY]: Array.isArray(
                result.metadata[ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY],
            )
                ? (result.metadata[ASSIGNMENT_QUOTE_SNAPSHOTS_METADATA_KEY] as unknown[]).length
                : 0,
        },
        // Explicit: this route never posts financial truth.
        ledger_posted: false,
        invoice_created: false,
        payment_created: false,
    });
}
