/**
 * The parent's answer to "would you like to add another…?", applied canonically.
 *
 * ## What the browser may say, and what it may not
 *
 * It sends an INTENT — decline, reuse this person, or here is a new one. It never names the role:
 * that comes from the turn the platform is currently offering, exactly as every other participant
 * mutation works. A person offered for reuse is addressed by an opaque handle matched against the
 * candidates the server just published, so a request cannot reach someone the parent was not shown.
 *
 * ## Declining is settlement
 *
 * An offer is declinable unless the form declares a minimum for the role (a collection group's
 * `repeat.min`); a decline below it is refused. Otherwise a decline is
 * recorded beside the other interaction facts in the session's metadata. It settles that role for
 * this journey — the conversation moves on and does not ask again.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachPartyRole } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import { buildPartyOfferDeclinePatch } from "@/lib/enrollment/participantRuntime/partyOfferPlan";
import { confirmationRef } from "@/lib/enrollment/participantRuntime/confirmationGroup";
import type { ParticipantEnrollmentObjective } from "@/lib/enrollment/participantRuntime/resolveParticipantEnrollmentObjective";

export type PartyResponse = {
    readonly decline?: boolean;
    /** Opaque handle for a household person the server offered for reuse. */
    readonly select_ref?: string;
    readonly identity?: { readonly full_name?: unknown; readonly phone?: unknown; readonly email?: unknown; readonly relationship_type?: unknown };
    /** With `select_ref`: the relationship to THIS child, which can differ from a sibling's. */
    readonly relationship_type?: unknown;
};

export type ApplyPartyResult =
    | { readonly ok: true; readonly outcome: "declined" | "attached"; readonly person_id?: string }
    | { readonly ok: false; readonly error: string };

/** A relationship the family chose — only one the organization's vocabulary offers. */
function kinshipFrom(objective: ParticipantEnrollmentObjective, raw: unknown): string | null {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (!v) return null;
    return objective.relationship_options.some((o) => o.value === v) ? v : null;
}

export async function applyPartyResponse(
    supabase: SupabaseClient,
    input: {
        readonly orgId: string;
        readonly sessionId: string;
        readonly customerId: string | null;
        readonly customerMemberId: string | null;
        readonly objective: ParticipantEnrollmentObjective;
        readonly sessionMetadata: unknown;
        readonly response: PartyResponse;
        readonly nowIso: string;
    },
): Promise<ApplyPartyResult> {
    // THE ROLE COMES FROM THE TURN. A stale or crafted tab cannot choose which relationship it is
    // establishing, only answer the one the platform is currently offering.
    const offer = input.objective.next_turn.party;
    if (!offer) return { ok: false, error: "There is nobody to add right now." };

    if (input.response.decline === true) {
        // An authored minimum ("at least one emergency contact") is a requirement, not an offer.
        if (offer.existing.length < offer.minimum) {
            const still = offer.minimum - offer.existing.length;
            return { ok: false, error: `Please add ${still === 1 ? "one more" : `${still} more`} — this enrollment needs at least ${offer.minimum}.` };
        }
        const metadata = buildPartyOfferDeclinePatch({
            metadata: input.sessionMetadata,
            role: offer.role,
            declinedAtIso: input.nowIso,
        });
        const { error } = await supabase
            .from("form_packet_sessions")
            .update({ metadata })
            .eq("id", input.sessionId)
            .eq("org_id", input.orgId);
        if (error) return { ok: false, error: error.message };
        return { ok: true, outcome: "declined" };
    }

    if (!input.customerId || !input.customerMemberId) {
        return { ok: false, error: "This journey has no household to attach a person to." };
    }

    /*
     * REUSE, MATCHED AGAINST WHAT WAS OFFERED.
     *
     * The handle is re-derived from the candidates the server published for THIS turn, so it can
     * only ever reach a person the parent was actually shown — the same bounded-set rule the
     * settled-fact editor uses.
     */
    const ref = (input.response.select_ref ?? "").trim();
    if (ref) {
        const candidate = input.objective.party_candidates.find((c) => confirmationRef(c.person_id) === ref);
        if (!candidate) return { ok: false, error: "That person is not on this list." };
        const attached = await attachPartyRole(supabase, {
            orgId: input.orgId,
            customerId: input.customerId,
            customerMemberId: input.customerMemberId,
            role: offer.role,
            personId: candidate.person_id,
            priority: offer.existing.length + 1,
            relationshipType: kinshipFrom(input.objective, input.response.relationship_type) ?? candidate.relationship_type ?? null,
        });
        return attached.ok
            ? { ok: true, outcome: "attached", person_id: attached.person_id }
            : { ok: false, error: attached.error };
    }

    const name = String(input.response.identity?.full_name ?? "").trim();
    if (!name) return { ok: false, error: "Please give their name." };
    const attached = await attachPartyRole(supabase, {
        orgId: input.orgId,
        customerId: input.customerId,
        customerMemberId: input.customerMemberId,
        role: offer.role,
        identity: {
            full_name: name,
            phone: String(input.response.identity?.phone ?? "").trim() || null,
            email: String(input.response.identity?.email ?? "").trim() || null,
        },
        // Canonical ordering: the next place in this role's own list.
        priority: offer.existing.length + 1,
        relationshipType: kinshipFrom(input.objective, input.response.identity?.relationship_type),
    });
    return attached.ok
        ? { ok: true, outcome: "attached", person_id: attached.person_id }
        : { ok: false, error: attached.error };
}
