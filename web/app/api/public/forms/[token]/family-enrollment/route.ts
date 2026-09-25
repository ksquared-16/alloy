/**
 * THE FAMILY JOURNEY, FROM ONE CHILD'S LINK.
 *
 * A parent arrives on a link minted for one child's session. This answers "what does my family's
 * enrolment look like" — who is enrolling, how far each has got, what is owed — so the participant
 * stops experiencing two disconnected journeys.
 *
 * ── THE BOUNDARY ──
 *
 * The token proves access to ONE child's session. It is not authority over a sibling's evidence, so
 * this returns a sibling's NAME and PROGRESS and never their answers, uploads, or documents. Every
 * row is confined to the same organization, the same household and the same live enrolment episode,
 * and the episode is resolved from canonical process state rather than from anything the caller
 * supplies.
 *
 * Read-only. It composes existing per-child projections and Financials output; it writes nothing and
 * stores no rollup.
 */
import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { resolveFamilyEnrollmentExperience } from "@/lib/enrollment/family/resolveFamilyEnrollmentExperience";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, token);
    if (!access.ok) return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409);

    const session = access.value.session as unknown as {
        id: string;
        process_instance_id: string | null;
        status: string | null;
        crm_snapshot: Record<string, unknown> | null;
    };

    /*
     * The focused child is read from the session's own snapshot, never from the query string. A
     * caller-supplied child id would let one family's link ask about another child.
     */
    const snap = (session.crm_snapshot ?? {}) as Record<string, unknown>;
    const focused = typeof snap.customer_member_id === "string" ? snap.customer_member_id : null;

    try {
        const family = await resolveFamilyEnrollmentExperience(supabase, {
            orgId: access.value.orgId,
            session,
            focusedCustomerMemberId: focused,
            // Financials is composed by the caller that owns the fee requirement; the family shell
            // never reaches into it, so that it cannot start computing a position of its own.
            financials: null,
        });

        if (!family.ok) {
            /*
             * "No live episode" is an ordinary answer — a single child enrolling alone has no family
             * journey. 200 with a null experience, because this is not an error the parent caused.
             */
            return publicOk({ family: null, reason: family.refusal.code });
        }

        return publicOk({ family: family.value });
    } catch (e) {
        console.error("[family-enrollment]", e);
        return publicErr("We could not load your family's enrollment just now. Please refresh to try again.", 500);
    }
}
