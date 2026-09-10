/**
 * "Who is at the tablet, and which of their children may they act on here?"
 *
 * Public in the sense that no Alloy human session exists — the sender is
 * authenticated as the KIOSK DEVICE, by a credential presented in a header and
 * resolved against a hashed column. No org, site or capability is accepted from
 * the browser.
 *
 * ── THIS ROUTE AUTHORS NOTHING ──
 *
 * It reads. It is still rate-limited, because code entry is the one guessable
 * surface the product exposes and an unbounded one would be an oracle for who
 * attends the centre.
 *
 * ── EVERY FAILURE LOOKS THE SAME ──
 *
 * Wrong code, revoked code, unknown person, person with no children at this site:
 * all return an empty child list and the same generic message. A caller cannot
 * learn from this endpoint whether a family exists, and a denial never names a
 * restriction, a relationship, or a safeguarding fact — those live in
 * `internalReason`, which is deliberately not serialised here.
 */

import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveAttendanceServiceDate } from "@/lib/childcareOperational/attendance/attendanceServiceDate";
import {
    KIOSK_GENERIC_DENIAL,
    resolveKioskInteraction,
    resolveKioskRequestDevice,
} from "@/lib/childcareOperational/attendance/kiosk/kioskRequestContext";
import type { KioskOperation } from "@/lib/childcareOperational/attendance/kiosk/kioskChildEligibility";

function operationOf(raw: unknown): KioskOperation | null {
    const v = String(raw ?? "").trim();
    return v === "check_in" || v === "check_out" ? v : null;
}

export async function POST(request: NextRequest) {
    const supabase = createAdminClient();

    const device = await resolveKioskRequestDevice(request, supabase, "identify");
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

    const serviceDate = await resolveAttendanceServiceDate(supabase, device.device.orgId);
    const session = await resolveKioskInteraction({
        request,
        supabase,
        device: device.device,
        code: String(body.code ?? ""),
        operation,
        serviceDate,
    });

    /*
     * ONLY WHAT A LOBBY MAY SEE.
     *
     * A child's name and whether this operation is available to them. No person
     * id, no relationship, no reason beyond the generic one — and no signal at
     * all distinguishing "wrong code" from "no children here", because the shape
     * is identical in both cases.
     */
    return NextResponse.json({
        site_name: device.device.label,
        operation,
        service_date: serviceDate,
        children: session.children.map((c) => ({
            child_id: c.childId,
            display_name: c.displayName,
            eligible: c.eligibility.allowed,
            message: c.eligibility.allowed ? null : c.eligibility.publicReason,
        })),
    });
}
