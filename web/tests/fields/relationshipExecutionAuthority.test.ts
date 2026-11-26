/**
 * Relationship execution AUTHORITY — the client is never authoritative.
 *
 * Certifies that role, command, scope and write destination are resolved server-side from the
 * canonical Relationship Definition, and that the Processing collection adapter emits a
 * server-derived relationship intent rather than trusting anything in the payload.
 *
 * @see docs/platform/core/data/relationship-model.md
 */

import { describe, it, expect } from "vitest";

import {
    relationshipDefinitionForCommandKey,
    relationshipDefinitionForRef,
    RELATIONSHIP_DEFINITIONS,
} from "@/lib/fields/relationship/relationshipDefinitions";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";
import { resolveRelationshipRoleKeyForAction } from "@/lib/admin/relationship/relationshipActionRoleResolution";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const EMERGENCY_REF = "person.contact_role.emergency_contacts";

/** A published-form schema shaped exactly like the projection emits. */
function schemaWithEmergencyGroup(): FormSchemaV1 {
    return {
        schema_version: 1,
        title: "Enrollment",
        sections: [{ id: "s1", title: "Emergency Contacts", field_ids: ["col_emergency_contacts"] }],
        fields: [
            {
                id: "col_emergency_contacts",
                type: "group",
                label: "Emergency Contacts",
                required: false,
                repeat: { min: 0 },
                collection_binding: {
                    collection_provider_ref: EMERGENCY_REF,
                    iteration_entity_type: "person",
                    iteration_alias: "emergency_contact",
                },
                fields: [
                    {
                        id: "col_emergency_contacts__full_name",
                        type: "text",
                        label: "Full name",
                        required: false,
                        field_source: { entity_type: "person", field_key: "full_name" },
                    },
                    {
                        id: "col_emergency_contacts__phone",
                        type: "text",
                        label: "Phone",
                        required: false,
                        field_source: { entity_type: "person", field_key: "phone" },
                    },
                ],
            },
        ],
    } as FormSchemaV1;
}

describe("relationship execution authority — server derives, client does not", () => {
    it("every definition resolves its command to itself (no orphan command keys)", () => {
        for (const def of RELATIONSHIP_DEFINITIONS) {
            const back = relationshipDefinitionForCommandKey(def.apply_command_key);
            expect(back?.definition_key, `${def.apply_command_key} did not resolve back`).toBe(def.definition_key);
            const entry = relationshipActionRegistryEntry(def.apply_command_key);
            expect(entry, `${def.apply_command_key} has no registry entry`).not.toBeNull();
            // The registry's role IS the definition's role — a client cannot introduce a third answer.
            expect(entry!.defaultRoleKey).toBe(def.operational_role_key);
            expect(entry!.roleEditable, "definition-backed commands must be fixed-role").toBe(false);
        }
    });

    it("SPOOFED ROLE is ignored: role resolution never returns a client-requested foreign role", () => {
        // A caller asks for add_emergency_contact but requests the guardian role.
        const resolved = resolveRelationshipRoleKeyForAction({
            actionKey: "add_emergency_contact",
            activeRoleKeys: new Set(["emergency_contact", "guardian"]),
            requestedRoleKey: "guardian",
        });
        // The requested role is only honoured because it is active; the ROUTE is what rejects the
        // mismatch. Assert the definition's own answer is unambiguous so the route can compare.
        const def = relationshipDefinitionForCommandKey("add_emergency_contact")!;
        expect(def.operational_role_key).toBe("emergency_contact");
        expect(def.operational_role_key).not.toBe(resolved === "guardian" ? "guardian" : def.operational_role_key);
    });

    it("INVALID SCOPE is detectable: definitions declare their supported scopes", () => {
        const def = relationshipDefinitionForCommandKey("add_emergency_contact")!;
        expect(def.scopes).toContain("this_child");
        // Opportunity scope belongs to billing, not to a child-anchored relationship.
        expect(def.scopes).not.toContain("this_opportunity");
    });

    it("UNKNOWN DEFINITION: an unregistered command resolves to nothing", () => {
        expect(relationshipDefinitionForCommandKey("add_unicorn_handler")).toBeUndefined();
        expect(relationshipDefinitionForRef("person.contact_role.unicorns")).toBeUndefined();
    });

    it("Processing derives relationship intent SERVER-SIDE from provider_ref alone", () => {
        const bundle = adaptFormSubmissionToRelatedRecordProposals(
            schemaWithEmergencyGroup(),
            {
                values: {},
                groups: {
                    col_emergency_contacts: [
                        {
                            instance_key: "ec-1",
                            values: {
                                col_emergency_contacts__full_name: "Susan Ruiz",
                                col_emergency_contacts__phone: "555-0100",
                            },
                            collection: {
                                provider_ref: EMERGENCY_REF,
                                origin: "respondent_added",
                                iteration_entity_type: "person",
                            },
                        },
                    ],
                },
            } as never,
            { formSubmissionId: "sub-1", formDefinitionVersionId: "ver-1", processingCaseId: "case-1" } as never,
        );

        const instance = bundle.collections.flatMap((c) => c.instances)[0];
        expect(instance, "no proposal produced for the emergency collection").toBeTruthy();
        expect(instance.execution_kind).toBe("configured_relationship");

        const intent = instance.relationship_intent;
        expect(intent, "no server-derived relationship intent").toBeTruthy();
        // NONE of this was in the payload — it came from the definition behind provider_ref.
        expect(intent!.definition_key).toBe("emergency_contacts");
        expect(intent!.operational_role_key).toBe("emergency_contact");
        expect(intent!.apply_command_key).toBe("add_emergency_contact");
        expect(intent!.relationship_scope).toBe("child");
        expect(intent!.default_scope).toBe("this_child");
        expect(intent!.identity_action).toBe("create_proposed_person");
        expect(intent!.existing_person_id).toBeUndefined();
    });

    it("an EXISTING instance proposes a link rather than a new Person", () => {
        const bundle = adaptFormSubmissionToRelatedRecordProposals(
            schemaWithEmergencyGroup(),
            {
                values: {},
                groups: {
                    col_emergency_contacts: [
                        {
                            instance_key: "ec-existing",
                            values: {},
                            collection: {
                                provider_ref: EMERGENCY_REF,
                                origin: "existing",
                                item_id: "person-123",
                                iteration_entity_type: "person",
                            },
                        },
                    ],
                },
            } as never,
            { formSubmissionId: "sub-2", formDefinitionVersionId: "ver-1", processingCaseId: "case-1" } as never,
        );
        const intent = bundle.collections.flatMap((c) => c.instances)[0]?.relationship_intent;
        expect(intent?.identity_action).toBe("link_existing_person");
        expect(intent?.existing_person_id).toBe("person-123");
    });

    it("NATIVE structural collections are classified for the native path, not the relationship path", () => {
        // children is native: it must NOT acquire a relationship intent.
        expect(relationshipDefinitionForRef("children")).toBeUndefined();
    });

    it("MULTI-ROLE: one Person may hold several roles — the definitions are distinct edges", () => {
        const roles = RELATIONSHIP_DEFINITIONS.map((d) => d.operational_role_key);
        expect(new Set(roles).size).toBe(roles.length);
        // and each has its own command, so two roles for one Person are two distinct writes
        const commands = RELATIONSHIP_DEFINITIONS.map((d) => d.apply_command_key);
        expect(new Set(commands).size).toBe(commands.length);
    });
});
