/**
 * POS-FP17 — configured-relationship collection provider derivation (additive, byte-identical).
 *
 * The 3 relationship providers (parents, emergency, pickup) are now DERIVED from the table-shaped
 * relationship definition registry, not hand-authored. This proves: (a) the derived output is
 * byte-identical to the previous hand-authored providers (no behavior change for existing forms),
 * (b) native structural collections stay native, (c) a NEW collectable role needs no provider code.
 */

import { describe, it, expect } from "vitest";

import {
    listCanonicalCollectionProviders,
    deriveRelationshipCollectionProviders,
    relationshipCollectionProjection,
    canonicalCollectionProviderForRole,
    classifyCollectionProvider,
    type CanonicalCollectionProviderDefinition,
} from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { relationshipDefinitionForRole, type RelationshipDefinition } from "@/lib/fields/relationship/relationshipDefinitions";

// The exact providers that were hand-authored before derivation (byte-identical target).
const EXPECTED: Record<string, CanonicalCollectionProviderDefinition> = {
    "person.contact_role.parents": {
        refKey: "person.contact_role.parents", collectionRef: "parents_guardians", label: "Parents / Guardians",
        itemEntityType: "person", providerKind: "relationship_role", sourceEntityType: "customer",
        requiredContextKeys: ["customer_id"], resolverOwner: "web/lib/fields/relationship/canonicalCollectionResolver.ts",
        activeOnly: false, itemIdentityField: "id", orderingPolicy: "display_name", relationshipRoleKey: "parents",
    },
    "person.contact_role.emergency_contacts": {
        refKey: "person.contact_role.emergency_contacts", collectionRef: "emergency_contacts", label: "Emergency Contacts",
        itemEntityType: "person", providerKind: "relationship_role", sourceEntityType: "customer",
        requiredContextKeys: ["customer_id"], resolverOwner: "web/lib/fields/relationship/canonicalCollectionResolver.ts",
        activeOnly: false, itemIdentityField: "id", orderingPolicy: "display_name", relationshipRoleKey: "emergency_contact",
    },
    "person.contact_role.authorized_pickups": {
        refKey: "person.contact_role.authorized_pickups", collectionRef: "authorized_pickups", label: "Authorized Pickup People",
        itemEntityType: "person", providerKind: "relationship_role", sourceEntityType: "customer",
        requiredContextKeys: ["customer_id"], resolverOwner: "web/lib/fields/relationship/canonicalCollectionResolver.ts",
        activeOnly: false, itemIdentityField: "id", orderingPolicy: "display_name", relationshipRoleKey: "authorized_pickup",
    },
};

describe("POS-FP17 — relationship collection provider derivation", () => {
    it("derives the 3 relationship providers byte-identically to the prior hand-authored defs", () => {
        const derived = deriveRelationshipCollectionProviders();
        expect(derived.length).toBe(3);
        for (const p of derived) {
            expect(p).toEqual(EXPECTED[p.refKey]);
        }
    });

    it("registry = native structural + derived relationship providers (5 total, order stable)", () => {
        const all = listCanonicalCollectionProviders();
        expect(all.map((p) => p.refKey)).toEqual([
            "children",
            "household.members",
            "person.contact_role.parents",
            "person.contact_role.emergency_contacts",
            "person.contact_role.authorized_pickups",
        ]);
    });

    it("classifies providers: children/household.members native, the rest configured", () => {
        expect(classifyCollectionProvider("children")).toBe("native_structural");
        expect(classifyCollectionProvider("household.members")).toBe("native_structural");
        expect(classifyCollectionProvider("person.contact_role.emergency_contacts")).toBe("configured_relationship");
        expect(classifyCollectionProvider("person.contact_role.authorized_pickups")).toBe("configured_relationship");
    });

    it("maps operational roles to providers via definitions (parent/guardian → parents)", () => {
        expect(canonicalCollectionProviderForRole("guardian")?.refKey).toBe("person.contact_role.parents");
        expect(canonicalCollectionProviderForRole("parent")?.refKey).toBe("person.contact_role.parents");
        expect(canonicalCollectionProviderForRole("emergency_contact")?.refKey).toBe("person.contact_role.emergency_contacts");
        expect(canonicalCollectionProviderForRole("authorized_pickup")?.refKey).toBe("person.contact_role.authorized_pickups");
        expect(relationshipDefinitionForRole("emergency_contact")?.apply_command_key).toBe("add_emergency_contact");
    });

    it("a NEW collectable role produces a valid provider WITHOUT new provider code", () => {
        // A future definition row (e.g. physician) — one row, no per-role provider code.
        const physician: RelationshipDefinition = {
            definition_key: "physicians", provider_ref: "person.contact_role.physicians", collection_ref: "physicians",
            label: "Physicians", help_text: "The child's physicians.", item_entity_type: "person", source_entity_type: "customer",
            provider_role_key: "physician", required_context_keys: ["customer_id"], active_only: false, ordering_policy: "display_name",
            // NOTE: borrows an existing operational role key because the role vocabulary
            // (PERSON_CHILD_OPERATIONAL_ROLE_KEYS) is still a closed platform constant. That closed
            // union is a tracked conformance gap — see docs/platform/core/data/relationship-model.md.
            operational_role_key: "communication_recipient", target_entity_type: "person", direction: "anchor_to_target",
            cardinality: "many", collectable: true, scopes: ["this_child"], nested_field_keys: ["full_name", "phone"],
            create_link_policy: "create_or_link", apply_command_key: "link_existing_person", responsibility_default: "either_guardian", native: false,
            // Completed against the widened RelationshipDefinition contract. These are required
            // fields, not decoration: the projection identity (iteration_alias), the Discovery
            // detection projection, and the execution projection all now live on the definition, so
            // a fixture that omits them is not a definition row a tenant could actually author.
            iteration_alias: "physician",
            detection_patterns: ["physician"],
            detection_priority: 40,
            detection_word_suffix: true,
            relationship_scope: "child",
            executor_kind: "child_scoped_contact",
            write_targets: ["person_child_relationships"],
            persists_to: "person_child_relationships",
            role_key_candidates: ["physician"],
        };
        const provider = relationshipCollectionProjection(physician);
        expect(provider.providerKind).toBe("relationship_role");
        expect(provider.refKey).toBe("person.contact_role.physicians");
        expect(provider.relationshipRoleKey).toBe("physician");
        expect(provider.itemEntityType).toBe("person");
    });
});
