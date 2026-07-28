/**
 * POS-FP17 — Forms consumes the canonical relationship definitions (projection widening).
 *
 * Forms previously hand-authored its collection providers and gated authoring behind a 2-entry
 * allowlist, so `emergency_contacts` and `authorized_pickups` were registered canonical providers that
 * Forms could not bind and Processing would reject on submission. Forms is a CONSUMER of the
 * Relationship Model, never an owner — see docs/platform/core/data/relationship-model.md.
 */

import { describe, it, expect } from "vitest";

import {
    buildFormsCollectionBindingSeeds,
    buildFormsAuthorableCollectionBindingSeeds,
    findFormsCollectionBindingProvider,
    FORMS_REPEATABLE_COLLECTION_REFS,
} from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import { collectionBindingAuthoringEnabledForProvider } from "@/lib/fields/formsRelationshipOperationalSupport";
import { collectionBindingFromProvider } from "@/lib/fields/formsCollectionRepeatBinding";
import {
    collectableRelationshipDefinitions,
    RELATIONSHIP_DEFINITIONS,
} from "@/lib/fields/relationship/relationshipDefinitions";

const NATIVE_REFS = ["children", "household.members"];

describe("POS-FP17 — Forms projection widening", () => {
    it("exposes a collection provider for EVERY collectable relationship definition", () => {
        const seeds = buildFormsCollectionBindingSeeds();
        for (const def of collectableRelationshipDefinitions()) {
            const provider = seeds.find((p) => p.refKey === def.provider_ref);
            expect(provider, `no Forms provider for ${def.definition_key}`).toBeDefined();
            expect(provider!.label).toBe(def.label);
            expect(provider!.kind).toBe("collection");
            expect(provider!.collectionProjection?.collection_ref).toBe(def.collection_ref);
        }
        // natives + one per definition, nothing hand-authored beyond the natives
        expect(seeds.length).toBe(NATIVE_REFS.length + collectableRelationshipDefinitions().length);
    });

    it("emergency contacts and authorized pickups are now bindable and authorable (were stranded)", () => {
        for (const ref of ["person.contact_role.emergency_contacts", "person.contact_role.authorized_pickups"]) {
            expect(findFormsCollectionBindingProvider(ref), `${ref} not bindable`).toBeDefined();
            expect(collectionBindingAuthoringEnabledForProvider(ref), `${ref} not authorable`).toBe(true);
        }
        const authorable = buildFormsAuthorableCollectionBindingSeeds().map((p) => p.refKey);
        expect(authorable).toContain("person.contact_role.emergency_contacts");
        expect(authorable).toContain("person.contact_role.authorized_pickups");
    });

    it("the repeatable collection ref set covers natives + every definition", () => {
        expect(FORMS_REPEATABLE_COLLECTION_REFS).toContain("children");
        expect(FORMS_REPEATABLE_COLLECTION_REFS).toContain("household_members");
        for (const def of collectableRelationshipDefinitions()) {
            expect(FORMS_REPEATABLE_COLLECTION_REFS).toContain(def.collection_ref);
        }
    });

    it("iteration alias comes from the definition, not a per-ref ternary", () => {
        for (const def of RELATIONSHIP_DEFINITIONS) {
            const provider = findFormsCollectionBindingProvider(def.provider_ref);
            expect(provider).toBeDefined();
            const binding = collectionBindingFromProvider(provider!);
            expect(binding.collection_provider_ref).toBe(def.provider_ref);
            expect(binding.iteration_entity_type).toBe(def.item_entity_type);
            expect(binding.iteration_alias).toBe(def.iteration_alias);
        }
    });

    it("parents/guardians binding is unchanged (existing forms unaffected)", () => {
        const provider = findFormsCollectionBindingProvider("person.contact_role.parents");
        expect(provider).toBeDefined();
        expect(provider!.label).toBe("Parents / Guardians");
        expect(provider!.entityNamespace).toBe("customer");
        expect(provider!.settingsEntity).toBe("person");
        expect(provider!.collectionProjection).toEqual({ collection_ref: "parents_guardians", projection: "items" });
        expect(collectionBindingFromProvider(provider!).iteration_alias).toBe("guardian");
    });

    it("natives keep their own aliases and stay hand-authored (documented exception)", () => {
        const children = findFormsCollectionBindingProvider("children");
        const members = findFormsCollectionBindingProvider("household.members");
        expect(collectionBindingFromProvider(children!).iteration_alias).toBe("child");
        expect(collectionBindingFromProvider(members!).iteration_alias).toBe("member");
    });
});
