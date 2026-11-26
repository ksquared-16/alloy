/**
 * POS-FP16 / M5B — canonical relationship collection providers for the fixture roles.
 *
 * Configuration Discovery recognizes guardian / emergency-contact / authorized-pickup relationships.
 * Each must project through a REGISTERED canonical collection provider (not document-specific
 * storage), keyed by a platform-fixed operational role key, so application reuses the existing
 * Person↔Child relationship framework. Contract-level assertions.
 */

import { describe, it, expect } from "vitest";

import {
    listCanonicalCollectionProviders,
    canonicalCollectionProviderForRole,
    isRegisteredCanonicalCollectionProvider,
} from "@/lib/fields/collection/canonicalCollectionProviderRegistry";
import { PERSON_CHILD_OPERATIONAL_ROLE_KEYS } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";

describe("M5B — relationship collection providers", () => {
    it("registers providers for all three fixture relationship roles", () => {
        expect(isRegisteredCanonicalCollectionProvider("person.contact_role.parents")).toBe(true);
        expect(isRegisteredCanonicalCollectionProvider("person.contact_role.emergency_contacts")).toBe(true);
        expect(isRegisteredCanonicalCollectionProvider("person.contact_role.authorized_pickups")).toBe(true);
    });

    it("keys relationship-role providers on platform-fixed operational role keys (not document-specific)", () => {
        const roleProviders = listCanonicalCollectionProviders().filter((p) => p.providerKind === "relationship_role");
        for (const p of roleProviders) {
            expect(p.relationshipRoleKey, `${p.refKey} must carry a role key`).toBeTruthy();
        }
        // the two new providers use canonical operational role keys
        const emergency = roleProviders.find((p) => p.refKey === "person.contact_role.emergency_contacts");
        const pickup = roleProviders.find((p) => p.refKey === "person.contact_role.authorized_pickups");
        expect(PERSON_CHILD_OPERATIONAL_ROLE_KEYS).toContain(emergency!.relationshipRoleKey as (typeof PERSON_CHILD_OPERATIONAL_ROLE_KEYS)[number]);
        expect(PERSON_CHILD_OPERATIONAL_ROLE_KEYS).toContain(pickup!.relationshipRoleKey as (typeof PERSON_CHILD_OPERATIONAL_ROLE_KEYS)[number]);
        expect(emergency!.relationshipRoleKey).toBe("emergency_contact");
        expect(pickup!.relationshipRoleKey).toBe("authorized_pickup");
    });

    it("scopes relationship-role providers to person items in the household", () => {
        for (const ref of ["person.contact_role.emergency_contacts", "person.contact_role.authorized_pickups"]) {
            const p = listCanonicalCollectionProviders().find((x) => x.refKey === ref)!;
            expect(p.itemEntityType).toBe("person");
            expect(p.sourceEntityType).toBe("customer");
            expect(p.requiredContextKeys).toContain("customer_id");
        }
    });

    it("maps each discovered operational role to its owning provider", () => {
        expect(canonicalCollectionProviderForRole("guardian")?.refKey).toBe("person.contact_role.parents");
        expect(canonicalCollectionProviderForRole("parent")?.refKey).toBe("person.contact_role.parents");
        expect(canonicalCollectionProviderForRole("emergency_contact")?.refKey).toBe("person.contact_role.emergency_contacts");
        expect(canonicalCollectionProviderForRole("authorized_pickup")?.refKey).toBe("person.contact_role.authorized_pickups");
    });

    it("a person can hold more than one operational role (roles are edge-scoped, not entities)", () => {
        // The role keys are distinct and additive — the same person_id can carry guardian + pickup
        // via person_child_relationship_roles without a second Person record.
        expect(new Set(PERSON_CHILD_OPERATIONAL_ROLE_KEYS).size).toBe(PERSON_CHILD_OPERATIONAL_ROLE_KEYS.length);
        expect(PERSON_CHILD_OPERATIONAL_ROLE_KEYS).toContain("guardian");
        expect(PERSON_CHILD_OPERATIONAL_ROLE_KEYS).toContain("authorized_pickup");
    });
});
