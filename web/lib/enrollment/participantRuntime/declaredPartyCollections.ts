/**
 * The collections of people a packet's Forms actually declare.
 *
 * The conversation has always been able to offer a role, show who already holds it and accept
 * another person — `partyOfferPlan` and the `collect_party` turn. What it had to infer was WHICH
 * roles and HOW MANY, from the number of boxes an imported PDF happened to print.
 *
 * A normalized Form says it outright. This reads that statement and nothing else: no label
 * heuristics, no counting, no second vocabulary. `role` is the `party_collection`'s own role key,
 * which is the relationship system's key, so the offer it produces is the same offer the slot path
 * produces and flows through the same apply, decline and presentation code.
 *
 * Pure. No I/O.
 */

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { partyCollectionGroups } from "@/lib/enrollment/informationNeeds/participantPartyCollection";
import { partyCollectionOf, addAnotherLabel } from "@/lib/forms/partyCollection";
import { relationshipDefinitionForRole } from "@/lib/fields/relationship/relationshipDefinitions";
import type { DeclaredPartyCollection } from "@/lib/enrollment/participantRuntime/partyOfferPlan";

export function declaredPartyCollectionsForForms(
    forms: readonly { readonly schema: FormSchemaV1 }[],
): DeclaredPartyCollection[] {
    const byRole = new Map<string, DeclaredPartyCollection>();
    for (const form of forms) {
        for (const group of partyCollectionGroups(form.schema)) {
            const party = partyCollectionOf(group);
            /*
             * A collection with no ROLE names no relationship, and an offer without a relationship
             * has nowhere to write. Children in the household are collected as a household
             * relationship rather than a role on this child, so they are not offered here — the
             * collection need carries them, and this path stays about people in a role.
             */
            const role = party?.role?.trim();
            if (!role) continue;
            const definition = relationshipDefinitionForRole(role);
            const declared: DeclaredPartyCollection = {
                role,
                role_label: definition?.label ?? group.label,
                max: group.repeat?.max ?? null,
                min: Math.max(0, group.repeat?.min ?? 0),
                allow_add: party!.allow_add !== false,
                show_known: party!.show_known !== false,
            };
            const prior = byRole.get(role);
            /*
             * Two Forms in one packet may each declare the same role. The family is one family, so
             * the offer is one offer: the widest ceiling and the highest floor, because a second
             * Form asking for a contact does not make the first Form's minimum go away.
             */
            byRole.set(
                role,
                prior
                    ? {
                          ...prior,
                          min: Math.max(prior.min, declared.min),
                          max: prior.max == null || declared.max == null ? null : Math.max(prior.max, declared.max),
                          allow_add: prior.allow_add || declared.allow_add,
                          show_known: prior.show_known || declared.show_known,
                      }
                    : declared,
            );
            void addAnotherLabel;
        }
    }
    return [...byRole.values()];
}
