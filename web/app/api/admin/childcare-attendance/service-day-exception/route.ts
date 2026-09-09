/**
 * Service-day exceptions — the operator commands for "she's off sick", "he's on
 * holiday", "we're shut on the 25th", and the changes to those.
 *
 * ── WHAT THIS ROUTE DOES NOT DO ──
 *
 * It creates no absence record, writes no closure row, and does not touch the
 * committed schedule. Each command authors ONE statement about what is expected,
 * so the schedule underneath stays true and a child who turns up during her own
 * holiday still reads as present-and-unexpected rather than quietly becoming
 * ordinary.
 *
 * ── THE SUBJECT'S SITE IS RESOLVED HERE, NOT ACCEPTED ──
 *
 * Same rule as attendance capture: the caller names a child or a room, and the
 * server works out which site that is before checking whether the caller may act
 * there. A body-supplied site would let a caller declare the scope it is about to
 * be measured against.
 *
 * Operator-facing copy stays in operator language. The vocabulary underneath is
 * the platform's business, not something to make a nursery manager read.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { resolveEffectiveSiteLocationId } from "@/lib/admin/accessScope";
import { authorServiceDayException } from "@/lib/childcareOperational/attendance/authorServiceDayException";
import {
    closeOperatingGrain,
    correctChildAway,
    markChildAway,
    reopenOperatingGrain,
    reviseChildAway,
    withdrawChildAway,
    type ClosableGrainKind,
    type ServiceDayDateRange,
} from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import { ATTENDANCE_SUBJECT_KINDS } from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import type { AuthoringInput } from "@/lib/operationalExpectations/intake/authoringTypes";

const CHILD_ACTIONS = ["mark_child_away", "revise_child_away", "withdraw_child_away", "correct_child_away"] as const;
const GRAIN_ACTIONS = ["close_grain", "reopen_grain"] as const;
type ChildAction = (typeof CHILD_ACTIONS)[number];
type GrainAction = (typeof GRAIN_ACTIONS)[number];

function bad(message: string, code = "invalid_input", status = 400) {
    return NextResponse.json({ error: message, code }, { status });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The site a child's exception belongs to.
 *
 * A child with agreements at two sites is AMBIGUOUS, not "probably the first
 * one": guessing would let a caller scoped to one site author against the other.
 * The caller resolves it by naming the agreement, which the roster always knows.
 */
async function resolveChildSite(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    childId: string,
    enrollmentAgreementId: string | null,
): Promise<{ ok: true; siteLocationId: string } | { ok: false; code: string; message: string }> {
    const q = supabase
        .from("child_enrollment_agreements")
        .select("site_location_id")
        .eq("org_id", orgId)
        .eq("customer_member_id", childId);
    const { data, error } = enrollmentAgreementId ? await q.eq("id", enrollmentAgreementId) : await q;

    if (error) {
        return { ok: false, code: "site_unresolved", message: "This child's site could not be checked." };
    }
    const sites = [
        ...new Set(
            ((data ?? []) as { site_location_id?: string | null }[])
                .map((r) => (r.site_location_id ?? "").trim())
                .filter(Boolean),
        ),
    ];
    if (sites.length === 0) {
        return { ok: false, code: "site_unresolved", message: "This child is not enrolled at a site." };
    }
    if (sites.length > 1) {
        return {
            ok: false,
            code: "site_ambiguous",
            message: "This child is enrolled at more than one site — say which enrolment this applies to.",
        };
    }
    return { ok: true, siteLocationId: sites[0] };
}

export async function POST(request: NextRequest) {
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);
    const ctx = gate.access;

    let body: Record<string, unknown> = {};
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return bad("Invalid JSON");
    }

    const action = String(body.action ?? "").trim();
    const isChild = (CHILD_ACTIONS as readonly string[]).includes(action);
    const isGrain = (GRAIN_ACTIONS as readonly string[]).includes(action);
    if (!isChild && !isGrain) return bad(`Unknown action '${action}'.`);

    const fromDate = String(body.from_date ?? "").trim();
    const toDate = String(body.to_date ?? "").trim() || null;
    if (!ISO_DATE.test(fromDate)) return bad("A start date (YYYY-MM-DD) is required.");
    if (toDate && !ISO_DATE.test(toDate)) return bad("The end date must be YYYY-MM-DD.");
    if (toDate && toDate < fromDate) return bad("The end date must be on or after the start date.");
    const range: ServiceDayDateRange = { fromDate, toDate };

    const reasonKey = String(body.reason_key ?? "").trim();
    if (!reasonKey) return bad("A reason is required.");
    const note = body.note != null ? String(body.note) : null;

    const predecessorId = String(body.predecessor_id ?? "").trim() || null;
    const needsPredecessor = action !== "mark_child_away" && action !== "close_grain";
    if (needsPredecessor && !predecessorId) {
        return bad("This change needs to say which plan it replaces.", "missing_predecessor");
    }

    // Retry safety is the caller's to claim, exactly as it is for attendance
    // capture: supply a key and a repeat is the same act, omit it and it is a new
    // one. The server never silently coalesces two distinct decisions.
    const idempotencyKey = String(body.idempotency_key ?? "").trim() || randomUUID();
    const actorUserId = ctx.userId;
    if (!actorUserId) return bad("An authenticated operator is required.", "unauthorized", 403);

    const common = { idempotencyKey, actorUserId, reasonKey, note };
    const supabase = createAdminClient();

    let input: AuthoringInput;
    let siteLocationId: string | null;
    let grainLocationIds: string[] = [];

    if (isChild) {
        const childId = String(body.child_id ?? "").trim();
        if (!childId) return bad("A child is required.");
        const site = await resolveChildSite(
            supabase,
            ctx.orgId,
            childId,
            String(body.enrollment_agreement_id ?? "").trim() || null,
        );
        if (!site.ok) {
            return NextResponse.json({ error: site.message, code: site.code }, { status: 403 });
        }
        siteLocationId = site.siteLocationId;

        const args = { ...common, childId, range, predecessorId: predecessorId as string };
        input =
            action === ("mark_child_away" satisfies ChildAction)
                ? markChildAway({ ...common, childId, range })
                : action === "revise_child_away"
                  ? reviseChildAway(args)
                  : action === "withdraw_child_away"
                    ? withdrawChildAway(args)
                    : correctChildAway(args);
    } else {
        const grainKind = String(body.grain_kind ?? "").trim();
        const grainId = String(body.grain_id ?? "").trim();
        if (grainKind !== ATTENDANCE_SUBJECT_KINDS.site && grainKind !== ATTENDANCE_SUBJECT_KINDS.operationalGroup) {
            return bad("A closure applies to a site or a room.");
        }
        if (!grainId) return bad("A site or room is required.");

        // A room resolves to its site by ancestry, so a room-grain closure is
        // scope-checked against the site that actually contains it.
        siteLocationId =
            grainKind === ATTENDANCE_SUBJECT_KINDS.site
                ? grainId
                : await resolveEffectiveSiteLocationId(supabase, ctx.orgId, grainId);
        if (!siteLocationId) {
            return NextResponse.json(
                { error: "That room is not part of a site you can act on.", code: "site_unresolved" },
                { status: 403 },
            );
        }
        grainLocationIds = [grainId];

        const args = {
            ...common,
            grainKind: grainKind as ClosableGrainKind,
            grainId,
            range,
            predecessorId: predecessorId as string,
        };
        input = action === ("close_grain" satisfies GrainAction) ? closeOperatingGrain(args) : reopenOperatingGrain(args);
    }

    const outcome = await authorServiceDayException({
        supabase,
        orgId: ctx.orgId,
        actorUserId,
        dim: gate.dim,
        siteLocationId,
        grainLocationIds,
        input,
    });

    switch (outcome.status) {
        case "denied":
            return NextResponse.json({ error: outcome.message, code: outcome.code }, { status: outcome.httpStatus });
        case "authored":
            return NextResponse.json(
                {
                    exception: {
                        id: outcome.act.id,
                        change_of: outcome.act.supersedesExpectationId,
                        history_id: outcome.act.lineageRootId,
                        recorded_at: outcome.act.authoredAt,
                    },
                    idempotent: outcome.idempotent,
                },
                { status: 201 },
            );
        case "rejected":
            return NextResponse.json(
                { error: outcome.message, code: outcome.code },
                { status: outcome.code === "unauthorized" ? 403 : 400 },
            );
        case "conflict":
            return NextResponse.json({ error: outcome.message, code: outcome.code }, { status: 409 });
        case "disabled":
            return NextResponse.json(
                { error: "Planned absences are not switched on for this organisation.", code: "not_enabled" },
                { status: 409 },
            );
        default:
            return NextResponse.json({ error: "That change could not be saved.", code: "failed" }, { status: 500 });
    }
}
