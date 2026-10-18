/**
 * A FAMILY ASKS TO ENROLL ANOTHER OF ITS CHILDREN — a request, never an enrolment.
 *
 * Director policy: an authorized participant may request Enrollment for an existing child of their
 * household. The request does NOT create a second child, an accepted offer, an Enrolling journey, a
 * packet or a fee, and it does not bypass eligibility, waitlist or placement. It enters the normal
 * admissions workflow.
 *
 * The canonical "this child is being considered" record is the child's Enrollment Participation on
 * the family's episode, written by `ensureOpportunityCustomerMemberParticipation` with the
 * historical `new_inquiry` status — exactly what an operator's "add inquiry child" writes. Nothing
 * else is written: no process instance (lead and decision are family-grain; the child's track is
 * created by the operator's Decision outcome), no stage move, no packet, no fee.
 *
 * Start Enrollment is deliberately NOT used: it stamps the participation Enrolling, creates the
 * child's Enrollment journey and launches the packet — the very things this request must not do.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";
import { isReusableActiveParticipationStatus } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import { CONCLUDED_ENROLLMENT_PROCESS_STATES } from "@/lib/process/processInstances";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

/** Where a household child stands, in the family's words. Never an internal status key. */
export type HouseholdChildRequestStatus =
    /** Nothing open: the family may ask. */
    | "available"
    /** The school is considering this child (an inquiry, decision or offer is open). */
    | "being_reviewed"
    | "waitlisted"
    | "in_progress"
    | "enrolled";

export type HouseholdChildForRequest = {
    readonly customerMemberId: string;
    readonly displayName: string;
    readonly status: HouseholdChildRequestStatus;
};

export const REQUEST_SOURCE = "participant_enrollment_request" as const;

type Member = { id: string; display_name: string | null; first_name: string | null; last_name: string | null };

/** The household's active children, each with where they stand. Read-only. */
export async function listHouseholdChildrenForRequest(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string },
): Promise<HouseholdChildForRequest[]> {
    const { data: memberRows, error } = await supabase
        .from("customer_members")
        .select("id, display_name, first_name, last_name")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("relationship", "child")
        .eq("is_active", true);
    if (error) throw new Error(error.message);
    const members = (memberRows ?? []) as Member[];
    if (members.length === 0) return [];
    const ids = members.map((m) => m.id);

    const [{ data: piRows }, { data: ocmRows }] = await Promise.all([
        supabase
            .from("process_instances")
            .select("subject_id, state, stage_key, process_key, created_at")
            .eq("org_id", input.orgId)
            .in("subject_id", ids),
        supabase
            .from("opportunity_customer_members")
            .select("customer_member_id, opportunity_id, outcome_status_key")
            .eq("org_id", input.orgId)
            .in("customer_member_id", ids),
    ]);
    const journeys = ((piRows ?? []) as Array<{ subject_id: string; state: string | null; stage_key: string | null; process_key?: string | null; created_at?: string | null }>)
        .filter((r) => !r.process_key || r.process_key === ENROLLMENT_PROCESS_KEY);
    const participations = (ocmRows ?? []) as Array<{ customer_member_id: string; opportunity_id: string | null; outcome_status_key: string | null }>;

    return members.map((m) => ({
        customerMemberId: m.id,
        displayName: (m.display_name ?? "").trim() || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Child",
        status: childRequestStatus(
            journeys.filter((j) => j.subject_id === m.id),
            participations.filter((p) => p.customer_member_id === m.id),
        ),
    }));
}

/** Pure: the family-facing status from the child's journeys and participations. */
export function childRequestStatus(
    journeys: ReadonlyArray<{ state: string | null; stage_key: string | null; created_at?: string | null }>,
    participations: ReadonlyArray<{ opportunity_id: string | null; outcome_status_key: string | null }>,
): HouseholdChildRequestStatus {
    const concluded = (s: string | null) => CONCLUDED_ENROLLMENT_PROCESS_STATES.includes((s ?? "").trim().toLowerCase());
    const open = journeys.find((j) => !concluded(j.state));
    if (open) return (open.stage_key ?? "").trim().toLowerCase() === "waitlist" ? "waitlisted" : "in_progress";

    const active = participations.find((p) => isReusableActiveParticipationStatus(p.outcome_status_key));
    if (active) {
        const key = (active.outcome_status_key ?? "").trim().toLowerCase();
        if (key === "waitlisted") return "waitlisted";
        if (key === "enrolling") return "in_progress";
        return "being_reviewed";
    }

    const latest = [...journeys].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
    if (latest && (latest.state ?? "").trim().toLowerCase() === "enrolled") return "enrolled";
    if (participations.some((p) => (p.outcome_status_key ?? "").trim().toLowerCase() === "enrolled")) return "enrolled";
    return "available";
}

export type EnrollmentRequestRefusal =
    | { readonly code: "no_family_episode"; readonly message: string }
    | { readonly code: "not_household_child"; readonly message: string }
    | { readonly code: "already_active"; readonly message: string; readonly status: HouseholdChildRequestStatus }
    /** This episode already holds a CLOSED participation for the child; reopening it is the school's call. */
    | { readonly code: "previously_closed"; readonly message: string };

export type EnrollmentRequestResult =
    | { readonly ok: true; readonly participationId: string; readonly created: boolean }
    | { readonly ok: false; readonly refusal: EnrollmentRequestRefusal };

const ALREADY: Record<Exclude<HouseholdChildRequestStatus, "available">, string> = {
    being_reviewed: "The school is already considering this child.",
    waitlisted: "This child is already on the waitlist.",
    in_progress: "This child's enrollment is already in progress.",
    enrolled: "This child is already enrolled.",
};

/**
 * Request Enrollment for an existing household child. The family's own episode receives the
 * request; there is no episode to manufacture one into.
 */
export async function requestEnrollmentForExistingChild(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly customerId: string;
        /** The family's live episode — the Opportunity the request joins. */
        readonly opportunityId: string | null;
        readonly customerMemberId: string;
    },
): Promise<EnrollmentRequestResult> {
    const opportunityId = (input.opportunityId ?? "").trim();
    if (!opportunityId) {
        return {
            ok: false,
            refusal: {
                code: "no_family_episode",
                message: "We can't add a request here right now. Please contact the school and they'll help you.",
            },
        };
    }
    // The episode must be this household's own.
    const { data: opp } = await supabase
        .from("opportunities")
        .select("customer_id")
        .eq("org_id", input.orgId)
        .eq("id", opportunityId)
        .maybeSingle();
    if ((opp as { customer_id?: string | null } | null)?.customer_id !== input.customerId) {
        return { ok: false, refusal: { code: "no_family_episode", message: "We can't add a request here right now. Please contact the school and they'll help you." } };
    }

    const children = await listHouseholdChildrenForRequest(supabase, { orgId: input.orgId, customerId: input.customerId });
    const child = children.find((c) => c.customerMemberId === input.customerMemberId);
    if (!child) {
        return { ok: false, refusal: { code: "not_household_child", message: "That child isn't part of this family's record." } };
    }
    if (child.status !== "available") {
        return { ok: false, refusal: { code: "already_active", message: ALREADY[child.status], status: child.status } };
    }

    /*
     * A participation on THIS episode that has already been closed (withdrawn, declined, not
     * enrolling) would be reused as-is by the writer — a request that silently did nothing. Reopening
     * a closed decision is the school's, so it is refused with a sentence that says who to ask.
     */
    const { data: existing } = await supabase
        .from("opportunity_customer_members")
        .select("outcome_status_key")
        .eq("org_id", input.orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_member_id", input.customerMemberId)
        .maybeSingle();
    if (existing && !isReusableActiveParticipationStatus((existing as { outcome_status_key?: string | null }).outcome_status_key)) {
        return {
            ok: false,
            refusal: { code: "previously_closed", message: "This child's earlier request was closed. Please contact the school to reopen it." },
        };
    }

    const { ocmId, created } = await ensureOpportunityCustomerMemberParticipation({
        supabase,
        orgId: input.orgId,
        opportunityId,
        customerMemberId: input.customerMemberId,
        source: REQUEST_SOURCE,
    });
    return { ok: true, participationId: ocmId, created };
}
