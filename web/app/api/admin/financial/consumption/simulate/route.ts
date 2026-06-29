import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";
import { draftConsumption, previewConsumption } from "@/lib/operationalConsumption/consumptionService";
import type { OperationalFactDto } from "@/lib/operationalConsumption/consumptionTypes";

/**
 * Operational Consumption Simulator (Slice 1). Resolves a normalized operational
 * fact into a Consumption Event + Resolved Obligation(s) + draft Charge preview.
 * Role-gated POST:
 *   action=preview — resolve only (writes nothing).
 *   action=draft   — persist only safe draft objects: the Consumption Event, the
 *                    Resolved Obligation, and (via the Commercial Model lifecycle
 *                    service) an idempotent status='draft' charge.
 * Never posts; never mutates a posted charge; no invoices/ledger/payments/AR.
 */
function str(v: unknown): string | null {
    return v != null && String(v).trim() ? String(v).trim() : null;
}

function parseWeekdays(v: unknown): number[] | null {
    if (!Array.isArray(v)) return null;
    const out = v.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    return out.length ? out : null;
}

function num(v: unknown): number | null {
    return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

function factFrom(body: Record<string, unknown>): OperationalFactDto {
    const context = body.context && typeof body.context === "object" && !Array.isArray(body.context)
        ? (body.context as Record<string, unknown>)
        : null;
    const scheduleChangeKind = str(body.schedule_change_kind);
    // For schedule facts an event_key may be omitted (the change kind derives it); default
    // the family to "schedule" when a schedule signal is present, else "agreement".
    const isSchedule = scheduleChangeKind != null || str(body.source_family) === "schedule" || (str(body.event_key) ?? "").startsWith("schedule.");
    return {
        eventKey: String(body.event_key ?? "").trim(),
        sourceFamily: str(body.source_family) ?? (isSchedule ? "schedule" : "agreement"),
        sourceEntityType: str(body.source_entity_type) ?? "child_enrollment_agreements",
        sourceEntityId: String(body.source_entity_id ?? "").trim(),
        subjectType: str(body.subject_type),
        subjectId: str(body.subject_id),
        locationId: str(body.location_id),
        occursOn: str(body.occurs_on),
        effectiveOn: str(body.effective_on),
        eventDate: str(body.event_date),
        servicePeriodStart: str(body.service_period_start),
        quantity: num(body.quantity),
        unitAmountCents: num(body.unit_amount_cents),
        idempotencyKey: str(body.idempotency_key),
        context,
        // --- schedule consumption (Slice 2) ---
        scheduleChangeKind: scheduleChangeKind as OperationalFactDto["scheduleChangeKind"],
        scheduleBasis: str(body.schedule_basis),
        weekdays: parseWeekdays(body.weekdays),
        priorScheduleBasis: str(body.prior_schedule_basis),
        ageGroupKey: str(body.age_group_key),
        ratePlanKey: str(body.rate_plan_key),
        periodStart: str(body.period_start),
        periodEnd: str(body.period_end),
        proratedDays: num(body.prorated_days),
        periodDays: num(body.period_days),
    };
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON", code: "invalid_input" }, { status: 400 });
    }

    const action = String(body.action ?? "preview").trim();
    const supabase = createAdminClient();
    try {
        const today = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const fact = factFrom(body);
        const isSchedule = fact.sourceFamily === "schedule" || fact.scheduleChangeKind != null || fact.eventKey.startsWith("schedule.");
        if (!fact.eventKey && !isSchedule) {
            return NextResponse.json({ error: "event_key is required", code: "invalid_input" }, { status: 400 });
        }
        if (!fact.sourceEntityId) {
            return NextResponse.json({ error: "source_entity_id is required", code: "invalid_input" }, { status: 400 });
        }

        if (action === "preview") {
            const result = await previewConsumption(supabase, ctx.orgId, fact, today);
            return NextResponse.json(result, { status: 200 });
        }
        if (action === "draft") {
            const result = await draftConsumption(supabase, ctx.orgId, fact, today, ctx.userId);
            return NextResponse.json(result, { status: 200 });
        }
        return NextResponse.json({ error: `Unknown action: ${action}`, code: "invalid_input" }, { status: 400 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
