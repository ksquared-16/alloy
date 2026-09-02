/**
 * "Would you like to add another parent or guardian?" — decided from people, never from boxes.
 *
 * ## What drives an offer
 *
 * A role is OFFERED when the artifact can print one and the parent has not yet declined it. That is
 * an offer, not an obligation: minimums come from configured semantic requirements and there are
 * none today, so every one of these is declinable and declining is settlement. A packet printing
 * three emergency-contact rows produces ONE offer, not three questions — capacity is a ceiling on
 * what can be printed, and the family decides how many people exist.
 *
 * ## Why the roles come in this order
 *
 * The order is the relationship definitions' own AUTHORED row order, so it is configuration rather
 * than a list here: guardians before contacts before providers, because that is how those rows are
 * written. A tenant whose definitions are ordered differently gets a different conversation with no
 * code change.
 *
 * ## Never a numbered slot
 *
 * The conversational subject is a PERSON and a ROLE. "Parent #2" and "Emergency Contact #3" are
 * destinations and never appear here — the parent is asked about people, and projection decides
 * which box each person lands in afterwards.
 *
 * Pure. No I/O.
 */

import { RELATIONSHIP_DEFINITIONS, relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import { artifactSlotCapacity, minimumPartiesRequired, type ArtifactPartySlot, type SemanticPartyRequirement } from "@/lib/enrollment/participantRuntime/partySlotProjection";
import type { ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";

/** Namespaced beside the other session-interaction stores. */
export const PARTY_OFFERS_METADATA_KEY = "enrollment_party_offers_v1" as const;

export type PartyOfferDeclines = Readonly<Record<string, { readonly declined_at: string }>>;

export function readPartyOfferDeclines(metadata: unknown): PartyOfferDeclines {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return {};
    const root = (metadata as Record<string, unknown>)[PARTY_OFFERS_METADATA_KEY];
    if (root == null || typeof root !== "object" || Array.isArray(root)) return {};
    const out: Record<string, { declined_at: string }> = {};
    for (const [role, raw] of Object.entries(root as Record<string, unknown>)) {
        const at = (raw as { declined_at?: unknown })?.declined_at;
        if (typeof at === "string" && at.trim()) out[role] = { declined_at: at };
    }
    return out;
}

export function buildPartyOfferDeclinePatch(input: {
    readonly metadata: unknown;
    readonly role: string;
    readonly declinedAtIso: string;
}): Record<string, unknown> {
    const base =
        input.metadata != null && typeof input.metadata === "object" && !Array.isArray(input.metadata)
            ? { ...(input.metadata as Record<string, unknown>) }
            : {};
    return {
        ...base,
        [PARTY_OFFERS_METADATA_KEY]: {
            ...readPartyOfferDeclines(base),
            [input.role]: { declined_at: input.declinedAtIso },
        },
    };
}

export type PartyOffer = {
    readonly role: string;
    /** The relationship definition's own word for this role — "Guardian", "Physicians". */
    readonly role_label: string;
    /** People already holding this role for this child. */
    readonly existing: readonly ChildParty[];
    /** How many more this artifact could print. Zero means the offer is closed. */
    readonly remaining_capacity: number;
    /** True when at least one person already holds it, so the copy says "another". */
    readonly is_additional: boolean;
    /** A configured minimum, if any. Zero means declining is always available. */
    readonly minimum: number;
};

export type PartyOfferPlanInput = {
    readonly parties: readonly ChildParty[];
    readonly slots: readonly ArtifactPartySlot[];
    readonly declines: PartyOfferDeclines;
    /** Configured semantic requirements by role. Absent means none, and therefore minimum 0. */
    readonly requirements?: Readonly<Record<string, SemanticPartyRequirement>>;
};

/**
 * The next role to offer, or null when every one is satisfied or declined.
 *
 * A role is skipped when the artifact cannot print another, when the parent already declined it, or
 * when it has no canonical definition to write. Nothing here inspects a field label.
 */
export function nextPartyOffer(input: PartyOfferPlanInput): PartyOffer | null {
    const roles = [...new Set(input.slots.map((s) => s.role))];
    /*
     * THE DEFINITIONS' OWN AUTHORED ORDER.
     *
     * Not `relationshipDefinitionsByDetectionPriority` — that ranking exists so "Emergency Contact"
     * cannot be claimed by the parent/guardian pattern, and using it here asked for emergency
     * contacts BEFORE guardians. Detection priority answers "which role does this phrase name";
     * the authored row order is the order a person would talk about these people in.
     */
    const ranked = RELATIONSHIP_DEFINITIONS
        .map((d) => d.operational_role_key)
        .filter((role) => roles.includes(role));

    for (const role of ranked) {
        const definition = relationshipDefinitionForRole(role);
        if (!definition) continue;
        if (input.declines[role]) continue;

        const capacity = artifactSlotCapacity(input.slots, role);
        const existing = input.parties.filter((p) => p.roles.includes(role));
        if (existing.length >= capacity) continue;

        return {
            role,
            role_label: definition.label,
            existing,
            remaining_capacity: capacity - existing.length,
            is_additional: existing.length > 0,
            minimum: minimumPartiesRequired(input.slots, role, input.requirements?.[role]),
        };
    }
    return null;
}

/**
 * Roles this person could ALSO hold, for the contextual follow-up.
 *
 * "Should Ifeoma also be authorized to pick up Malik?" is offered only because the artifact exposes
 * a pickup destination and she does not hold that role yet. Being an emergency contact never
 * implies pickup — the roles are attached separately, and this is the ask that makes the second one
 * explicit rather than inferred.
 */
export function additionalRolesFor(
    party: ChildParty,
    slots: readonly ArtifactPartySlot[],
    parties: readonly ChildParty[],
): { readonly role: string; readonly role_label: string }[] {
    const roles = [...new Set(slots.map((s) => s.role))];
    return roles.flatMap((role) => {
        if (party.roles.includes(role)) return [];
        const definition = relationshipDefinitionForRole(role);
        if (!definition) return [];
        const held = parties.filter((p) => p.roles.includes(role)).length;
        if (held >= artifactSlotCapacity(slots, role)) return [];
        return [{ role, role_label: definition.label }];
    });
}
