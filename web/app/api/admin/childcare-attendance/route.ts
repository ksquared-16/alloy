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

    const actor: AttendanceActorContext = {
        actorType: String(body.actor_type ?? "staff") as AttendanceActorContext["actorType"],
        actorUserId: ctx.userId,
        actorPersonId: body.actor_person_id != null ? String(body.actor_person_id) : null,
        actorLabel: body.actor_label != null ? String(body.actor_label) : null,
        sourceType: (body.source_type != null
            ? String(body.source_type)
            : "operator_action") as AttendanceActorContext["sourceType"],
        sourceKey: body.source_key != null ? String(body.source_key) : undefined,
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
