/**
 * THE GUARDIAN RELATIONSHIP, ALL AT ONCE — the relationship-action authority's transactional writer.
 *
 * `add_parent_guardian` used to write person → contact → household link → child link as separate API
 * calls; a refusal at the child link left the person and household link behind (staging, QA person
 * 2a1cc5df). The writes now happen in ONE database function, `relationship_link_household_guardian`
 * (migration 20261125090000): all of them commit together or none of them persist.
 *
 * This module is the only caller. It validates what can be validated before the call (defence in depth;
 * the function re-checks everything), and turns the function's refusals into stable codes with
 * operator-safe messages. Raw database text never leaves the server.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhoneForPersonWrite, personPhoneMatchValues } from "@/lib/identity";

export type GuardianIdentityCandidate = {
    readonly person_id: string;
    readonly display_name: string;
    readonly in_household: boolean;
    readonly same_name: boolean;
};

/** A refusal from the relationship authority: a stable code, a safe sentence, and (when asked) the choice. */
export class RelationshipActionError extends Error {
    readonly code: string;
    readonly operatorMessage: string;
    readonly candidates?: readonly GuardianIdentityCandidate[];
    constructor(code: string, operatorMessage: string, candidates?: readonly GuardianIdentityCandidate[]) {
        super(operatorMessage);
        this.name = "RelationshipActionError";
        this.code = code;
        this.operatorMessage = operatorMessage;
        if (candidates) this.candidates = candidates;
    }
}

const OPERATOR_MESSAGES: Record<string, string> = {
    relationship_household_required: "This relationship needs a household.",
    relationship_household_not_found: "The household was not found in this organization.",
    relationship_role_required: "No guardian role is available for this organization.",
    relationship_child_required: "Choose the child this guardian is for.",
    relationship_child_not_in_household: "That child is not an active child of this household.",
    relationship_person_not_found: "The selected person was not found in this organization.",
    relationship_identity_insufficient: "A first name, a last name and an email or phone are required to add this person.",
    relationship_identity_choice_required: "A person with this email or phone already exists — choose them, or correct the details.",
    relationship_contact_conflict: "This email or phone already belongs to another contact — choose the existing person instead.",
};

export function relationshipOperatorMessage(code: string): string {
    return OPERATOR_MESSAGES[code] ?? "The relationship could not be saved.";
}

export type GuardianLinkResult = {
    personId: string;
    contactId: string;
    personCreated: boolean;
    personReused: boolean;
    linksWritten: number;
};

export async function linkHouseholdGuardianAtomically(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        customerId: string;
        memberIds: readonly string[];
        roleKey: string;
        selectedPersonId?: string | null;
        draft?: { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
        source: string;
    },
): Promise<GuardianLinkResult> {
    const selected = (input.selectedPersonId ?? "").trim() || null;
    const draft = input.draft ?? null;
    // Preflight (the function re-checks): nothing is sent that is known to be refused.
    if (input.memberIds.length === 0) throw new RelationshipActionError("relationship_child_required", relationshipOperatorMessage("relationship_child_required"));
    if (!input.roleKey.trim()) throw new RelationshipActionError("relationship_role_required", relationshipOperatorMessage("relationship_role_required"));
    if (!selected) {
        const hasName = Boolean(draft?.first_name?.trim() && draft?.last_name?.trim());
        const hasReach = Boolean(draft?.email?.trim() || draft?.phone?.trim());
        if (!hasName || !hasReach) {
            throw new RelationshipActionError("relationship_identity_insufficient", relationshipOperatorMessage("relationship_identity_insufficient"));
        }
    }

    const phone = selected ? null : normalizePhoneForPersonWrite(draft?.phone ?? null);
    const { data, error } = await supabase.rpc("relationship_link_household_guardian", {
        p_org_id: input.orgId,
        p_customer_id: input.customerId,
        p_member_ids: [...input.memberIds],
        p_role_key: input.roleKey,
        p_person_id: selected,
        p_first_name: selected ? null : draft?.first_name ?? null,
        p_last_name: selected ? null : draft?.last_name ?? null,
        p_email: selected ? null : draft?.email ?? null,
        p_phone: phone,
        p_phone_match: selected || !phone ? null : personPhoneMatchValues(draft?.phone ?? null),
        p_source: input.source,
    });
    if (error) {
        const code = /^relationship_[a-z_]+$/.test(error.message ?? "") ? error.message : "relationship_write_failed";
        let candidates: GuardianIdentityCandidate[] | undefined;
        if (code === "relationship_identity_choice_required" && error.details) {
            try {
                candidates = JSON.parse(error.details) as GuardianIdentityCandidate[];
            } catch {
                candidates = undefined;
            }
        }
        if (code === "relationship_write_failed") {
            // Detail stays in the server log; the caller gets a stable code.
            console.error("[relationship_action] guardian transaction failed", { code: error.code, message: error.message });
        }
        throw new RelationshipActionError(code, relationshipOperatorMessage(code), candidates);
    }
    const r = (data ?? {}) as { person_id?: string; contact_id?: string; person_created?: boolean; person_reused?: boolean; links_written?: number };
    if (!r.person_id || !r.contact_id) {
        throw new RelationshipActionError("relationship_write_failed", relationshipOperatorMessage("relationship_write_failed"));
    }
    return {
        personId: r.person_id,
        contactId: r.contact_id,
        personCreated: Boolean(r.person_created),
        personReused: Boolean(r.person_reused),
        linksWritten: Number(r.links_written ?? 0),
    };
}
