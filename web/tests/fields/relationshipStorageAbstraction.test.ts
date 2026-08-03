/**
 * Persistence is a COMPATIBILITY BOUNDARY, not a semantic one.
 *
 * The shipped model writes guardian links to `customer_member_contacts` and emergency-contact /
 * authorized-pickup roles to `person_child_relationships`. That split is intentional and versioned
 * on the definition as `persists_to`. What must never happen is a CONSUMER branching on it: Forms,
 * Configuration Discovery, Processing and (future) Conversation Runtime operate on normalized
 * relationship semantics and let the execution adapter hide physical storage.
 *
 * This test guards that boundary by source inspection — if someone reaches for a table name inside a
 * consumer, it fails here rather than quietly coupling the layer to today's storage.
 *
 * @see docs/platform/core/data/relationship-model.md — "Persistence destinations"
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { RELATIONSHIP_DEFINITIONS } from "@/lib/fields/relationship/relationshipDefinitions";

const LIB = path.join(process.cwd(), "lib");

/** Physical destinations a consumer must never name. */
const PHYSICAL_TABLES = ["customer_member_contacts", "person_child_relationship_roles"];

/**
 * Consumer modules that must stay storage-agnostic. Deliberately NOT the executor, the persistence
 * helpers, or the role-mapping module — those are the compatibility writers whose whole job is to
 * know the physical destination.
 */
const STORAGE_AGNOSTIC_CONSUMERS = [
    "pos/discovery/projectRelationshipCollections.ts",
    "pos/discovery/applyDiscovery.ts",
    "pos/discovery/conceptDiscovery.ts",
    "pos/discovery/semanticModel.ts",
    "forms/processing/adaptFormSubmissionToRelatedRecordProposals.ts",
    "fields/collection/canonicalCollectionProviderRegistry.ts",
    "fields/canonicalFormsRelationshipProviderDerivation.ts",
    "fields/formsRelationshipOperationalSupport.ts",
    "fields/formsCollectionRepeatBinding.ts",
];

describe("relationship storage abstraction", () => {
    it("every definition declares an explicit persistence destination", () => {
        for (const def of RELATIONSHIP_DEFINITIONS) {
            expect(
                ["person_child_relationships", "customer_member_contacts"],
                `${def.definition_key} has no declared persists_to`,
            ).toContain(def.persists_to);
        }
    });

    it("the shipped split is exactly as certified (guardian legacy, emergency/pickup canonical)", () => {
        const byKey = Object.fromEntries(RELATIONSHIP_DEFINITIONS.map((d) => [d.definition_key, d.persists_to]));
        expect(byKey.parents_guardians).toBe("customer_member_contacts");
        expect(byKey.emergency_contacts).toBe("person_child_relationships");
        expect(byKey.authorized_pickups).toBe("person_child_relationships");
    });

    it("separate destinations are NOT separate identities — every role targets the same entity", () => {
        // One canonical Person identity may hold many roles; the destination differs, the target
        // entity does not. This is what makes "same Person, two roles" a single identity.
        const targets = new Set(RELATIONSHIP_DEFINITIONS.map((d) => d.target_entity_type));
        expect(targets.size, "relationship roles disagree about the collected entity").toBe(1);
        expect([...targets][0]).toBe("person");

        const items = new Set(RELATIONSHIP_DEFINITIONS.map((d) => d.item_entity_type));
        expect(items.size).toBe(1);
        expect([...items][0]).toBe("person");
    });

    it("consumers do not branch on physical storage tables", () => {
        const offenders: string[] = [];
        for (const rel of STORAGE_AGNOSTIC_CONSUMERS) {
            const file = path.join(LIB, rel);
            if (!fs.existsSync(file)) continue;
            const src = fs.readFileSync(file, "utf8");
            for (const table of PHYSICAL_TABLES) {
                // A comment explaining the boundary is fine; code referencing the table is not.
                const codeLines = src
                    .split("\n")
                    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
                if (codeLines.some((l) => l.includes(table))) offenders.push(`${rel} → ${table}`);
            }
        }
        expect(offenders, `consumers coupled to physical storage:\n${offenders.join("\n")}`).toEqual([]);
    });

    it("consumers never read persists_to — only the execution layer may", () => {
        const offenders: string[] = [];
        for (const rel of STORAGE_AGNOSTIC_CONSUMERS) {
            const file = path.join(LIB, rel);
            if (!fs.existsSync(file)) continue;
            const src = fs.readFileSync(file, "utf8");
            const codeLines = src
                .split("\n")
                .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"));
            if (codeLines.some((l) => l.includes("persists_to"))) offenders.push(rel);
        }
        expect(offenders, `consumers reading the storage decision:\n${offenders.join("\n")}`).toEqual([]);
    });
});
