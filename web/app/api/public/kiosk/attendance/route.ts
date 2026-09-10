/**
 * The kiosk's one write, through the canonical Attendance substrate.
 *
 * ── AUTHORITY IS RE-DECIDED HERE, NOT CARRIED ──
 *
 * The browser sends the same code it sent to `identify`, and this route resolves
 * the person and the per-child decision AGAIN from the database. Nothing about
 * who may act on whom travels in the request. That is what makes the absence of a
 * human session safe: there is no token representing "already identified", so
 * there is nothing to steal, replay past a revocation, or edit in a devtools
 * console. A code revoked between the two calls stops working on the second.
 *
 * ── NO NEW ATTENDANCE PATH ──
 *
 * Facts are authored by `recordAttendanceEvent`, the same invariant-owning
 * substrate the operator console and the registered actions use. There is no
 * kiosk table, no kiosk RPC and no direct write. Idempotency is Thread 2's:
 * `(org_id, idempotency_key)` with a payload fingerprint, insert-with-conflict
 * then re-read. This route DERIVES a key per child from the client's operation
 * token, and does not implement dedupe of its own — a second dedupe layer would
 * be a second answer to the same question.
 *
 * ── ONE CHILD FAILING DOES NOT FAIL THE SIBLINGS ──
 *
 * Each child is authorized, guarded and authored independently, and the response
 * reports per child. A family checking in two children where one is not eligible
 * gets one arrival and one "see a member of staff", which is the truth.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveAttendanceServiceDate } from "@/lib/childcareOperational/attendance/attendanceServiceDate";
import { resolveAttendanceProvenance } from "@/lib/childcareOperational/attendance/attendanceProvenance";
import { recordAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";
import { resolveAttendanceSubject } from "@/lib/childcareOperational/attendance/resolveAttendanceSubject";
import {
    KIOSK_GENERIC_DENIAL,
    resolveKioskInteraction,
    resolveKioskRequestDevice,
} from "@/lib/childcareOperational/attendance/kiosk/kioskRequestContext";
import { resolveKioskServiceDay } from "@/lib/childcareOperational/attendance/kiosk/kioskServiceDayGuard";
import type { KioskOperation } from "@/lib/childcareOperational/attendance/kiosk/kioskChildEligibility";

function operationOf(raw: unknown): KioskOperation | null {
    const v = String(raw ?? "").trim();
    return v === "check_in" || v === "check_out" ? v : null;
}

type ChildOutcome = {
    child_id: string;
    display_name: string;
    recorded: boolean;
    message: string | null;
};

export async function POST(request: NextRequest) {
    const supabase = createAdminClient();

    const device = await resolveKioskRequestDevice(request, supabase, "capture");
    if (!device.ok) {
        return NextResponse.json(
            { error: KIOSK_GENERIC_DENIAL },
            {
                status: device.status,
                headers: device.retryAfter ? { "retry-after": String(device.retryAfter) } : undefined,
            },
        );
    }

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: KIOSK_GENERIC_DENIAL }, { status: 400 });
    }

    const operation = operationOf(body.operation);
    if (!operation) return NextResponse.json({ error: KIOSK_GENERIC_DENIAL }, { status: 400 });

    const requested = Array.isArray(body.child_ids) ? body.child_ids.map((v) => String(v)) : [];
    if (requested.length === 0) return NextResponse.json({ error: KIOSK_GENERIC_DENIAL }, { status: 400 });

    /*
     * THE OPERATION TOKEN IS THE RETRY IDENTITY.
     *
     * The browser mints it once per confirm and resends it on retry, so a double
     * tap, a network retry and a replayed request all carry the same identity and
     * converge on one fact per child. Absent one we generate a fresh id, which is
     * the honest default: an unlabelled request is a new decision.
     */
    const operationToken = String(body.operation_token ?? "").trim() || randomUUID();
    const correlationId = randomUUID();

    const serviceDate = await resolveAttendanceServiceDate(supabase, device.device.orgId);
    const session = await resolveKioskInteraction({
        request,
        supabase,
        device: device.device,
        code: String(body.code ?? ""),
        operation,
        serviceDate,
    });

    const decided = new Map(session.children.map((c) => [c.childId, c]));
    const outcomes: ChildOutcome[] = [];

    for (const childId of requested) {
        const option = decided.get(childId);
        // A child that is not in the decided set was never eligible AND may not
        // even be at this site. Both answer the same way: the request cannot
        // reach past what the gateway returned.
        if (!option || !option.eligibility.allowed) {
            outcomes.push({
                child_id: childId,
                display_name: option?.displayName ?? "",
                recorded: false,
                message: KIOSK_GENERIC_DENIAL,
            });
            continue;
        }

        const subject = await resolveAttendanceSubject(supabase, device.device.orgId, childId);
        if (!subject.ok) {
            outcomes.push({ child_id: childId, display_name: option.displayName, recorded: false, message: KIOSK_GENERIC_DENIAL });
            continue;
        }

        // Thread 4's answer, consumed rather than re-decided. A closed day refuses;
        // a known-away child does not, because a plan reality overtook is still a
        // plan and the fact is what changed.
        const day = await resolveKioskServiceDay({
            supabase,
            orgId: device.device.orgId,
            siteLocationId: device.device.siteLocationId,
            childId,
            roomLocationId: subject.subject.placementRoomLocationId,
            serviceDate,
        });
        if (!day.operable) {
            outcomes.push({ child_id: childId, display_name: option.displayName, recorded: false, message: KIOSK_GENERIC_DENIAL });
            continue;
        }

        const provenance = resolveAttendanceProvenance({
            channel: "kiosk",
            // The DEVICE is the producer; the ADULT is the actor. Two fields, never one.
            producerKey: device.device.producerKey,
            actorPersonId: session.personId,
            correlationId,
        });

        try {
            await recordAttendanceEvent(supabase, {
                orgId: device.device.orgId,
                enrollmentAgreementId: subject.subject.enrollmentAgreementId,
                eventKind: operation === "check_in" ? "check_in" : "check_out",
                eventAt: new Date().toISOString(),
                serviceDate,
                roomLocationId: operation === "check_in" ? subject.subject.placementRoomLocationId : null,
                actor: {
                    actorType: provenance.actorType,
                    actorUserId: provenance.actorUserId,
                    actorPersonId: provenance.actorPersonId,
                    actorLabel: provenance.actorLabel,
                    sourceType: provenance.sourceType,
                    sourceKey: provenance.sourceKey,
                },
                // Per child, so one confirm authoring three siblings is three
                // distinct identities that each converge on retry.
                idempotencyKey: `kiosk:${operationToken}:${operation}:${childId}`,
                correlationId,
            } as Parameters<typeof recordAttendanceEvent>[1]);
            outcomes.push({ child_id: childId, display_name: option.displayName, recorded: true, message: null });
        } catch {
            outcomes.push({ child_id: childId, display_name: option.displayName, recorded: false, message: KIOSK_GENERIC_DENIAL });
        }
    }

    return NextResponse.json({ operation, service_date: serviceDate, results: outcomes });
}
