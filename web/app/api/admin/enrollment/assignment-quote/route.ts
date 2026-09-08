import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { buildAssignmentTuitionView } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";
import { generateAssignmentQuoteSnapshot } from "@/lib/enrollment/generateAssignmentQuote";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST /api/admin/enrollment/assignment-quote
 *
 * Resolve an assignment's tuition and record the resulting ESTIMATE for the assignment card.
 *
 * ── THE NAME IS HISTORICAL; THERE IS NO QUOTE DOMAIN ──
 *
 * This route does not create a quote entity and drives no quote lifecycle. A resolution for an
 * assignment that is proposed or future-effective is still a resolution for that assignment. What
 * an operator ACCEPTS is an effective-dated `enrollment_pricing_terms` row, written by the
 * registered `enrollment.pricing.accept` / `.override` actions — not by this route, and not by any
 * route.
 *
 * ── WHY IT WAS REWRITTEN ──
 *
 * It selected `program_key`, `schedule_key` and `billing_period` from `commercial_tuition_rates` —
 * columns dropped by `20260702000002_commercial_tuition_rates_v2` — so every call answered 500 and
 * the mounted "Generate quote" control had never worked against the current schema. It also read
 * the assignment's program, schedule and site out of `process_instances.metadata`: a fourth copy of
 * facts whose owners are the assignment, the placement and the schedule.
 *
 * Both are fixed the same way. Facts come from their owners, matching comes from Commercial
 * Execution, and this route composes neither.
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

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const customerMemberId = str(body.customer_member_id);
    const opportunityId = str(body.opportunity_id);
    /** An explicit choice among the applicable options, when the operator has made one. */
    const selectedSourceId = str(body.selected_source_id) || str(body.offering_id);

    if (!customerMemberId) {
        return NextResponse.json({ error: "Missing customer_member_id" }, { status: 400 });
    }
    if (!opportunityId) {
        return NextResponse.json({ error: "Missing opportunity_id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // The ASSIGNMENT, which is what is being priced.
    const { data: ocm } = await supabase
        .from("opportunity_customer_members")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_member_id", customerMemberId)
        .maybeSingle();
    const ocmId = (ocm as { id?: string } | null)?.id ?? "";
    if (!ocmId) {
        return NextResponse.json({ error: "no_assignment_for_child" }, { status: 404 });
    }

    const view = await buildAssignmentTuitionView(supabase, {
        orgId: ctx.orgId,
        opportunityCustomerMemberId: ocmId,
    });
    if (!view) {
        return NextResponse.json({ error: "no_assignment_for_child" }, { status: 404 });
    }

    // Ambiguity and no-match are ANSWERS, returned as themselves. Neither is resolved by picking.
    const chosen =
        (selectedSourceId ? view.applicable.find((o) => o.sourceId === selectedSourceId) : null)
        ?? view.recommended;
    if (!chosen) {
        return NextResponse.json(
            {
                error: view.state === "ambiguous" ? "tuition_ambiguous" : "no_tuition_for_assignment",
                state: view.state,
                view,
            },
            { status: 409 },
        );
    }

    const { data: piRows, error: piErr } = await supabase
        .from("process_instances")
        .select("id, metadata")
        .eq("org_id", ctx.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", customerMemberId)
        .eq("context_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(1);
    if (piErr) return NextResponse.json({ error: piErr.message }, { status: 500 });

    const pi = (piRows ?? [])[0] as { id: string; metadata: Record<string, unknown> | null } | undefined;
    if (!pi) {
        return NextResponse.json({ error: "no_enrollment_process_instance" }, { status: 404 });
    }

    const generated = generateAssignmentQuoteSnapshot({
        metadata: pi.metadata,
        resolved: {
            rateId: chosen.sourceId,
            rateCents: chosen.amountCents,
            billingPeriod: chosen.cadenceKey,
            rateLabel: chosen.amountLabel,
            isLocationOverride: chosen.scope === "location",
        },
        programKey: view.facts.programKey,
        scheduleKey: view.facts.attendanceType,
        locationId: view.facts.locationId,
        offeringId: chosen.sourceId,
        offeringLabel: chosen.amountLabel,
        offeringVersionKey: view.configVersion,
        effectiveDate: view.facts.asOf,
        actorUserId: ctx.userId ?? null,
        snapshotId: randomUUID(),
        // The resolution's own identity travels with the estimate, so what the operator saw can be
        // compared with what the assignment says later.
        pricingInputsExtra: {
            resolution_key: view.resolutionKey,
            config_version: view.configVersion,
            days_per_week: view.facts.daysPerWeek,
            fact_sources: view.factSources,
        },
    });
    if (!generated.ok) {
        return NextResponse.json({ error: generated.error }, { status: 409 });
    }

    const { error: updateError } = await supabase
        .from("process_instances")
        .update({ metadata: generated.metadata })
        .eq("id", pi.id)
        .eq("org_id", ctx.orgId);
    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, snapshot: generated.snapshot, view });
}
