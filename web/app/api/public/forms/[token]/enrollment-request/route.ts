/**
 * GET  /api/public/forms/[token]/enrollment-request — the household's children and where each stands
 * POST /api/public/forms/[token]/enrollment-request — ask the school to consider an existing child
 *      { customer_member_id }                                   — or tell it about a NEW child:
 *      { new_child: { first_name, last_name, date_of_birth } }
 *
 * A new child is never created here. The statement becomes a Processing source
 * (`submitParticipantChildRequest`): the school reviews, corrects, rejects or commits it through the
 * canonical Processing new-child commit, and only that commit creates the child and makes its request.
 *
 * A REQUEST, never an enrolment: see `participantEnrollmentRequest`. Nothing here creates a child,
 * an offer, an Enrollment journey, a packet or a fee.
 *
 * Authority is the link, end to end. The household comes from the session the link opened (held to
 * the session's own child by the family resolver), the family episode from that same resolution, and
 * the participant must be the person the link was addressed to — and that person must belong to the
 * household. A child id from the browser selects among THIS household's children only.
 */

import { NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { resolveFamilyEnrollmentExperience } from "@/lib/enrollment/family/resolveFamilyEnrollmentExperience";
import {
    listOpenParticipantChildRequests,
    submitParticipantChildRequest,
} from "@/lib/pos/processingCase/sources/participantChildRequest";
import {
    listHouseholdChildrenForRequest,
    requestEnrollmentForExistingChild,
} from "@/lib/enrollment/family/participantEnrollmentRequest";

export const dynamic = "force-dynamic";

type Authorized = { orgId: string; customerId: string; opportunityId: string | null; personId: string };

async function authorize(
    supabase: ReturnType<typeof createServiceRoleClient>,
    token: string,
): Promise<{ ok: true; value: Authorized } | { ok: false; status: number; message: string }> {
    const access = await resolveParticipantEnrollmentFromToken(supabase, token);
    if (!access.ok) return { ok: false, status: access.error.code === "INVALID_LINK" ? 404 : 409, message: access.error.message };

    const family = await resolveFamilyEnrollmentExperience(supabase, {
        orgId: access.value.orgId,
        session: access.value.session as never,
    });
    if (!family.ok) return { ok: false, status: 409, message: "This link can't make requests for a family right now." };
    const snap = ((access.value.session as { crm_snapshot?: Record<string, unknown> | null }).crm_snapshot ?? {}) as Record<string, unknown>;
    const customerId = typeof snap.customer_id === "string" ? snap.customer_id : "";

    // The person this link was addressed to, and that person must be one of the household's adults.
    const { data: link } = await supabase
        .from("form_public_links")
        .select("metadata")
        .eq("org_id", access.value.orgId)
        .eq("id", access.value.linkId)
        .maybeSingle();
    const recipient = (() => {
        const v = ((link as { metadata?: Record<string, unknown> | null } | null)?.metadata ?? {}).recipient_person_id;
        return typeof v === "string" && v.trim() ? v.trim() : null;
    })();
    if (!recipient) return { ok: false, status: 403, message: "This link isn't addressed to a parent, so it can't make requests." };
    const { data: membership } = await supabase
        .from("customer_persons")
        .select("person_id")
        .eq("org_id", access.value.orgId)
        .eq("customer_id", customerId)
        .eq("person_id", recipient)
        .limit(1)
        .maybeSingle();
    if (!membership) return { ok: false, status: 403, message: "This link isn't addressed to a parent in this family." };

    return { ok: true, value: { orgId: access.value.orgId, customerId, opportunityId: family.value.opportunityId, personId: recipient } };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    const supabase = createServiceRoleClient();
    try {
        const auth = await authorize(supabase, token);
        if (!auth.ok) return publicErr(auth.message, auth.status);
        const { orgId, customerId } = auth.value;
        const children = await listHouseholdChildrenForRequest(supabase, { orgId, customerId });
        // New children the family told us about that are still with the school (or were not added).
        const requests = await listOpenParticipantChildRequests(supabase, { orgId, customerId })
            .then((rows) => rows.map((r) => ({ requestId: r.id, displayName: `${r.first_name} ${r.last_name}`, status: r.status })))
            .catch(() => []);
        return publicOk({ children, requests, canRequest: Boolean(auth.value.opportunityId) });
    } catch (e) {
        console.error("[enrollment-request GET]", e);
        return publicErr("We couldn't load your children just now. Please try again.", 500);
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return publicErr("Invalid request.", 400);
    }
    const newChild = body.new_child && typeof body.new_child === "object" && !Array.isArray(body.new_child)
        ? (body.new_child as Record<string, unknown>)
        : null;
    const customerMemberId = typeof body.customer_member_id === "string" ? body.customer_member_id.trim() : "";
    if (!customerMemberId && !newChild) return publicErr("Choose a child.", 400);

    const supabase = createServiceRoleClient();
    try {
        const auth = await authorize(supabase, token);
        if (!auth.ok) return publicErr(auth.message, auth.status);
        const { orgId, customerId, opportunityId, personId } = auth.value;

        if (newChild) {
            if (!opportunityId) {
                return publicErr("We can't add a request here right now. Please contact the school and they'll help you.", 409, { code: "no_family_episode" });
            }
            const submitted = await submitParticipantChildRequest(supabase, {
                orgId,
                customerId,
                opportunityId,
                requestedByPersonId: personId,
                child: { firstName: newChild.first_name, lastName: newChild.last_name, dateOfBirth: newChild.date_of_birth },
            });
            if (!submitted.ok) {
                const status = submitted.refusal.code === "invalid" ? 422 : 409;
                return publicErr(submitted.refusal.message, status, {
                    code: submitted.refusal.code,
                    ...(submitted.refusal.code === "invalid" ? { missing_fields: [submitted.refusal.field] } : {}),
                });
            }
            return publicOk({ sentForReview: true, created: submitted.created });
        }

        const result = await requestEnrollmentForExistingChild(supabase, { orgId, customerId, opportunityId, customerMemberId });
        if (!result.ok) {
            const status = result.refusal.code === "not_household_child" ? 404 : 409;
            return publicErr(result.refusal.message, status, { code: result.refusal.code });
        }
        return publicOk({ requested: true, created: result.created });
    } catch (e) {
        console.error("[enrollment-request POST]", e);
        return publicErr("We couldn't send your request just now. Please try again.", 500);
    }
}
