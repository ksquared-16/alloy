/**
 * The server entry for authoring a service-day exception.
 *
 * ── WHY THIS EXISTS RATHER THAN THE GENERIC SERVER ENTRY POINT ──
 *
 * That entry point governs the GENERIC intake: any modality, any subject, any
 * vocabulary. It requires `operational_expectations.author`, a capability seeded
 * only to the org `admin` role, and that is the right gate for a caller who may
 * author anything about anything.
 *
 * Marking a child off sick is not that caller. Routing it through the generic
 * entry would force one of two bad outcomes: grant every nursery operator a
 * capability to author arbitrary expectations across the whole organisation, or
 * make the feature unusable by the people whose job it is. The first is a real
 * privilege escalation dressed as a convenience.
 *
 * So this is the same shape as the feature-flag decision the program owner
 * already accepted: a PURPOSE-SCOPED door. It reaches the same one intake, the
 * same validation, the same atomic commit — and it can only ever author the
 * attendance service-day vocabulary, because the command builders are the only
 * way in and they hard-code the purpose. The generic entry is untouched and still
 * requires its own capability; there is a test that fails if that stops being
 * true.
 *
 * ── THE CAPABILITY IT DOES REQUIRE ──
 *
 * `attendance.record` plus site scope — Thread 2A's gate, unchanged, asserted
 * before any write, on a service-role path that will not re-ask.
 *
 * Strictly, stating what is EXPECTED is a different act from witnessing what
 * HAPPENED, and a distinct `attendance.plan` capability is the accurate long-term
 * grain. It is recorded as convergence debt rather than invented here: the
 * boundary that actually protects a child — may this person affect this child's
 * day at this site — is already enforced by the capability we have, and adding an
 * RBAC migration ahead of the outstanding migration-ledger repair would buy a
 * naming improvement with real promotion risk.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabaseAdmin";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { assertAttendanceCaptureAllowed } from "@/lib/childcareOperational/attendance/attendancePermissions";
import { ATTENDANCE_EXPECTATION_PURPOSE } from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { authorOperationalExpectation } from "@/lib/operationalExpectations/intake/authorOperationalExpectation";
import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import type { AuthoringGateway } from "@/lib/operationalExpectations/intake/authoringGateway";
import type { AuthoringInput, AuthoringResult } from "@/lib/operationalExpectations/intake/authoringTypes";

/** Denied before anything was written, with the reason the route should report. */
export type ServiceDayExceptionDenial = {
    status: "denied";
    httpStatus: 403;
    code: string;
    message: string;
};

export type ServiceDayExceptionOutcome = AuthoringResult | ServiceDayExceptionDenial;

/**
 * Authorize, then author.
 *
 * `siteLocationId` is the site of the SUBJECT, resolved by the caller from
 * canonical records — never read from a request body, or a caller could name the
 * scope it is about to be checked against.
 */
export async function authorServiceDayException(params: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string | null | undefined;
    dim: AdminAccessScopeDimensions;
    /** The site the exception belongs to, server-resolved. */
    siteLocationId: string | null;
    /**
     * Locations the exception names beyond the site — a room-grain closure. They
     * are scope-checked exactly like the rooms on an attendance fact.
     */
    grainLocationIds?: readonly (string | null | undefined)[];
    input: AuthoringInput;
    /** Substituted in tests; production uses the service-role Supabase gateway. */
    gateway?: AuthoringGateway;
}): Promise<ServiceDayExceptionOutcome> {
    const authorized = await assertAttendanceCaptureAllowed({
        supabase: params.supabase,
        orgId: params.orgId,
        userId: params.actorUserId,
        dim: params.dim,
        siteLocationId: params.siteLocationId,
        roomLocationIds: params.grainLocationIds,
    });
    if (!authorized.ok) {
        return {
            status: "denied",
            httpStatus: 403,
            code: authorized.code,
            message: authorized.message,
        };
    }

    /*
     * The authoring context is built HERE from the values the gate just verified.
     * It is never assembled from caller input, and the actor on the tuple is the
     * authenticated principal — an operator cannot author a plan as someone else.
     */
    const gateway =
        params.gateway ?? createSupabaseAuthoringGateway(createAdminClient(), ATTENDANCE_EXPECTATION_PURPOSE);

    return authorOperationalExpectation(
        params.input,
        {
            orgId: params.orgId,
            actorUserId: params.actorUserId ?? null,
            actorLabel: null,
            actorAuthenticated: true,
        },
        gateway,
    );
}
