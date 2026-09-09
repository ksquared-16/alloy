import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    correctAttendanceEvent,
    listAttendanceEvents,
    recordAttendanceEvent,
} from "@/lib/childcareOperational/attendance/attendanceService";
import type { AttendanceActorContext } from "@/lib/childcareOperational/attendance/attendanceTypes";
import { resolveAttendanceServiceDate } from "@/lib/childcareOperational/attendance/attendanceServiceDate";
import { operationalEnrollmentErrorResponse } from "@/lib/childcareOperational/operationalEnrollmentApi";
import {
    operatorChannelForSurface,
    resolveAttendanceProvenance,
} from "@/lib/childcareOperational/attendance/attendanceProvenance";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const supabase = createAdminClient();
    try {
        const events = await listAttendanceEvents(supabase, ctx.orgId, {
            enrollmentAgreementId: (searchParams.get("enrollment_agreement_id") ?? "").trim() || undefined,
            siteLocationId: (searchParams.get("site_location_id") ?? "").trim() || undefined,
            customerMemberId: (searchParams.get("customer_member_id") ?? "").trim() || undefined,
            serviceDateStart: (searchParams.get("service_date_start") ?? "").trim() || undefined,
            serviceDateEnd: (searchParams.get("service_date_end") ?? "").trim() || undefined,
        });
        return NextResponse.json({ events });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
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

    // Correlation identifies THIS invocation for audit trace. It is never an
    // identity or an authorization input, so accepting a caller-supplied value is
    // safe — and useful, because an integration can tie its own retry log to ours.
    const correlationId =
        body.correlation_id != null && String(body.correlation_id).trim()
            ? String(body.correlation_id).trim()
            : randomUUID();

    /*
     * PROVENANCE IS DERIVED, NEVER ACCEPTED.
     *
     * This route used to read `actor_type` and `source_type` off the body, so a
     * caller could file a fact stamped `parent` or `system` while authenticated
     * as an operator. The fact was real and its provenance was fiction. Both now
     * come from the authenticated principal and this route's own trusted channel;
     * body values for them are ignored, not rejected, so existing callers keep
     * working while losing the ability to lie.
     */
    let provenance;
    try {
        provenance = resolveAttendanceProvenance({
            channel: operatorChannelForSurface(
                body.operational_context != null ? String(body.operational_context) : null
            ),
            actorUserId: ctx.userId,
            actorLabel: body.actor_label != null ? String(body.actor_label) : null,
            correlationId,
        });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "provenance could not be established", code: "forbidden" },
            { status: 403 }
        );
    }

    const actor: AttendanceActorContext = {
        actorType: provenance.actorType,
        actorUserId: provenance.actorUserId,
        actorPersonId: provenance.actorPersonId,
        actorLabel: provenance.actorLabel,
        sourceType: provenance.sourceType,
        sourceKey: provenance.sourceKey,
    };

    const eventAt = body.event_at != null ? String(body.event_at) : new Date().toISOString();
    const supabase = createAdminClient();
    // Derive the org-local service day from the event instant unless explicitly given.
    const bodyServiceDate = body.service_date != null ? String(body.service_date) : "";
    let serviceDate = bodyServiceDate;
    if (!serviceDate) {
        try {
            serviceDate = await resolveAttendanceServiceDate(supabase, ctx.orgId, eventAt);
        } catch (e) {
            return operationalEnrollmentErrorResponse(e);
        }
    }

    const common = {
        orgId: ctx.orgId,
        eventKind: String(body.event_kind ?? "") as never,
        eventAt,
        serviceDate,
        roomLocationId: body.room_location_id != null ? String(body.room_location_id) : null,
        fromRoomLocationId: body.from_room_location_id != null ? String(body.from_room_location_id) : null,
        toRoomLocationId: body.to_room_location_id != null ? String(body.to_room_location_id) : null,
        reasonKey: body.reason_key != null ? String(body.reason_key) : null,
        note: body.note != null ? String(body.note) : null,
        actor,
        idempotencyKey:
            body.idempotency_key != null && String(body.idempotency_key).trim()
                ? String(body.idempotency_key).trim()
                : null,
        correlationId,
    };

    const entryType = body.entry_type != null ? String(body.entry_type) : "original";
    try {
        if (entryType === "correction" || entryType === "reversal") {
            const correctsEventId = String(body.corrects_event_id ?? "").trim();
            if (!correctsEventId) {
                return NextResponse.json(
                    { error: "corrects_event_id is required for correction/reversal", code: "invalid_input" },
                    { status: 400 }
                );
            }
            const event = await correctAttendanceEvent(supabase, {
                ...common,
                entryType,
                correctsEventId,
            });
            return NextResponse.json({ event }, { status: 201 });
        }

        const enrollmentAgreementId = String(body.enrollment_agreement_id ?? "").trim();
        if (!enrollmentAgreementId) {
            return NextResponse.json(
                { error: "enrollment_agreement_id is required", code: "invalid_input" },
                { status: 400 }
            );
        }
        const event = await recordAttendanceEvent(supabase, { ...common, enrollmentAgreementId });
        return NextResponse.json({ event }, { status: 201 });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
