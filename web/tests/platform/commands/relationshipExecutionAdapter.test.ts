import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RelationshipActionExecutionResult } from "@/lib/admin/relationship/relationshipActionContract";
import {
    buildRelationshipExecutionRequest,
    executeRelationshipViaAdapter,
} from "@/lib/platform/commands/runtime/adapters/relationshipExecutionAdapter";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import {
    COMMAND_RUNTIME_EXECUTION_BY_OWNER,
    isCommandRuntimeFacadeExecutionSupported,
    isRelationshipRuntimeFacadeSupported,
    RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

function invocation(
    partial: Partial<CommandInvocationRequest> & Pick<CommandInvocationRequest, "commandKey">
): CommandInvocationRequest {
    return {
        origin: "operator",
        operationalContext: "focus_panel",
        surface: "child_drawer",
        ...partial,
    };
}

function okRelationshipResult(
    actionKey: "add_parent_guardian" | "link_existing_person"
): RelationshipActionExecutionResult {
    return {
        ok: true,
        actionKey,
        role_key: actionKey === "add_parent_guardian" ? "guardian" : "emergency_contact",
        person_id: "person-1",
        child_person_id: "child-1",
        contact_id: "contact-1",
        customer_member_id: "cm-1",
        links_written: 1,
        links_skipped_invalid_role: 0,
        affected_children: [],
        affected_record_preview: [],
        scoped_contact_links: [],
        refresh_hints: { entityType: "child", entityId: "child-1" },
    };
}

const basePayload = {
    source_customer_id: "cust-1",
    source_entity_type: "child",
    source_record_id: "child-1",
};

describe("Relationship Runtime adapter (P3.S1)", () => {
    const supabase = {} as SupabaseClient;
    let relSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        relSpy = vi.fn(async (_sb, req) => okRelationshipResult(req.actionKey));
    });

    it("maps add_parent_guardian to guardian registry action with fixed role", () => {
        const built = buildRelationshipExecutionRequest({
            commandKey: "add_parent_guardian",
            executionSubject: { entityType: "child", entityId: "child-1" },
            invocation: invocation({
                commandKey: "add_parent_guardian",
                inputValues: {
                    ...basePayload,
                    selected_person_id: "person-1",
                    relationship_kind: "sibling",
                    role_key: "billing_contact",
                    execution_owner: "mutation_runtime",
                    org_id: "spoof",
                    actor: "spoof",
                },
            }),
        });
        expect("error" in built).toBe(false);
        if ("error" in built) return;
        expect(built.actionKey).toBe("add_parent_guardian");
        expect(built.roleKey).toBe("guardian");
        expect(built.selectedPersonId).toBe("person-1");
        expect(built.sourceEntityType).toBe("child");
        expect(built.sourceRecordId).toBe("child-1");
        expect(built.sourceCustomerId).toBe("cust-1");
    });

    it("maps link_existing_person with provided identity and role", () => {
        const built = buildRelationshipExecutionRequest({
            commandKey: "link_existing_person",
            executionSubject: { entityType: "child", entityId: "child-1" },
            invocation: invocation({
                commandKey: "link_existing_person",
                inputValues: {
                    ...basePayload,
                    selected_person_id: "person-2",
                    role_key: "emergency_contact",
                    relationship_type: "arbitrary",
                },
            }),
        });
        expect("error" in built).toBe(false);
        if ("error" in built) return;
        expect(built.actionKey).toBe("link_existing_person");
        expect(built.selectedPersonId).toBe("person-2");
        expect(built.roleKey).toBe("emergency_contact");
        expect(built.createPersonDraft).toBeUndefined();
    });

    it.each([
        ["add_emergency_contact", "emergency_contact"],
        ["add_authorized_pickup", "authorized_pickup"],
        ["add_billing_contact", "billing_contact"],
    ] as const)(
        "maps %s to fixed registry role %s (client role spoof ignored)",
        (key, fixedRole) => {
            const built = buildRelationshipExecutionRequest({
                commandKey: key,
                executionSubject: { entityType: "child", entityId: "child-1" },
                invocation: invocation({
                    commandKey: key,
                    inputValues: {
                        ...basePayload,
                        selected_person_id: "person-1",
                        role_key: "guardian",
                        relationship_kind: "sibling",
                        relationship_direction: "reversed",
                        execution_owner: "mutation_runtime",
                        org_id: "spoof",
                    },
                }),
            });
            expect("error" in built).toBe(false);
            if ("error" in built) return;
            expect(built.actionKey).toBe(key);
            expect(built.roleKey).toBe(fixedRole);
            expect(built.selectedPersonId).toBe("person-1");
            expect(built.sourceEntityType).toBe("child");
            expect(built.sourceCustomerId).toBe("cust-1");
        }
    );

    it("allows createPersonDraft for contact-role commands and preserves distinct action keys", () => {
        for (const key of [
            "add_emergency_contact",
            "add_authorized_pickup",
            "add_billing_contact",
        ] as const) {
            const built = buildRelationshipExecutionRequest({
                commandKey: key,
                executionSubject: { entityType: "child", entityId: "child-1" },
                invocation: invocation({
                    commandKey: key,
                    inputValues: {
                        ...basePayload,
                        create_person_draft: { first_name: "Pat", last_name: "Lee" },
                    },
                }),
            });
            expect("error" in built).toBe(false);
            if ("error" in built) return;
            expect(built.actionKey).toBe(key);
            expect(built.createPersonDraft).toEqual({
                first_name: "Pat",
                last_name: "Lee",
                email: undefined,
                phone: undefined,
            });
            expect(built.selectedPersonId).toBeUndefined();
        }
    });

    it("rejects link_existing_person createPersonDraft and missing selection", () => {
        expect(
            buildRelationshipExecutionRequest({
                commandKey: "link_existing_person",
                executionSubject: { entityType: "child", entityId: "child-1" },
                invocation: invocation({
                    commandKey: "link_existing_person",
                    inputValues: {
                        ...basePayload,
                        create_person_draft: { first_name: "A", last_name: "B" },
                        role_key: "emergency_contact",
                    },
                }),
            })
        ).toEqual({ error: "link_existing_person cannot create a new identity." });

        expect(
            buildRelationshipExecutionRequest({
                commandKey: "link_existing_person",
                executionSubject: { entityType: "child", entityId: "child-1" },
                invocation: invocation({
                    commandKey: "link_existing_person",
                    inputValues: { ...basePayload, role_key: "emergency_contact" },
                }),
            })
        ).toEqual({ error: "selectedPersonId is required to link an existing person." });
    });

    it("rejects unsupported Relationship capability and incompatible source type", () => {
        expect(
            buildRelationshipExecutionRequest({
                commandKey: "make_primary_contact",
                executionSubject: { entityType: "person", entityId: "person-1" },
                invocation: invocation({
                    commandKey: "make_primary_contact",
                    inputValues: basePayload,
                }),
            })
        ).toMatchObject({ error: expect.stringContaining("Unsupported") });

        expect(
            buildRelationshipExecutionRequest({
                commandKey: "add_parent_guardian",
                executionSubject: { entityType: "site", entityId: "site-1" },
                invocation: invocation({
                    commandKey: "add_parent_guardian",
                    inputValues: {
                        source_customer_id: "cust-1",
                        selected_person_id: "p1",
                    },
                }),
            })
        ).toMatchObject({ error: expect.stringContaining("Unsupported source entity type") });
    });

    it("executes all facade Relationship keys through Framework once with server org/actor", async () => {
        for (const key of RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS) {
            relSpy.mockClear();
            const isChild = key === "add_child" || key === "link_existing_child";
            const inputValues = isChild
                ? {
                      ...basePayload,
                      source_entity_type: "opportunity",
                      source_record_id: "opp-1",
                      selected_child_person_id: "child-person-1",
                      create_child_draft:
                          key === "add_child"
                              ? undefined
                              : { first_name: "Should", last_name: "Ignore" },
                      org_id: "spoof-org",
                      actor: { userId: "spoof" },
                      execution_owner: "registered_action",
                      relationship_kind: "sibling",
                  }
                : {
                      ...basePayload,
                      selected_person_id: "person-1",
                      role_key: "emergency_contact",
                      org_id: "spoof-org",
                      actor: { userId: "spoof" },
                      execution_owner: "registered_action",
                      relationship_kind: "sibling",
                  };
            // link_existing_child must not send create draft
            if (key === "link_existing_child") {
                delete (inputValues as { create_child_draft?: unknown }).create_child_draft;
            }
            if (key === "add_child") {
                // exercise create-or-link via selected existing child id
                delete (inputValues as { create_child_draft?: unknown }).create_child_draft;
            }

            const result = await executeCommandInvocation({
                request: {
                    invocation: invocation({
                        commandKey: key,
                        inputValues,
                        surface: isChild ? "opportunity_drawer" : "child_drawer",
                        actor: { orgId: "spoof", userId: "spoof" },
                    }),
                    mode: "execute",
                    executionSubject: {
                        entityType: isChild ? "opportunity" : "child",
                        entityId: isChild ? "opp-1" : "child-1",
                    },
                    invocationId: `inv-${key}`,
                },
                server: { orgId: "org-real", userId: "user-real", supabase },
                deps: { executeRelationshipAction: relSpy },
            });
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.executionOwner).toBe("relationship_runtime");
                expect(result.status).toBe("committed");
            }
            expect(relSpy).toHaveBeenCalledTimes(1);
            expect(relSpy.mock.calls[0][1]).toEqual(
                expect.objectContaining({
                    actionKey: key,
                    orgId: "org-real",
                    actorUserId: "user-real",
                    sourceCustomerId: "cust-1",
                })
            );
            if (key === "add_parent_guardian") {
                expect(relSpy.mock.calls[0][1].roleKey).toBe("guardian");
            }
            if (key === "add_emergency_contact") {
                expect(relSpy.mock.calls[0][1].roleKey).toBe("emergency_contact");
            }
            if (key === "add_authorized_pickup") {
                expect(relSpy.mock.calls[0][1].roleKey).toBe("authorized_pickup");
            }
            if (key === "add_billing_contact") {
                expect(relSpy.mock.calls[0][1].roleKey).toBe("billing_contact");
            }
            if (key === "link_existing_person") {
                expect(relSpy.mock.calls[0][1].roleKey).toBe("emergency_contact");
            }
            if (isChild) {
                expect(relSpy.mock.calls[0][1].selectedChildPersonId).toBe("child-person-1");
                expect(relSpy.mock.calls[0][1].createChildDraft).toBeUndefined();
                expect(relSpy.mock.calls[0][1].sourceOpportunityId).toBe("opp-1");
                expect(relSpy.mock.calls[0][1].roleKey).toBeUndefined();
            }
        }
    });

    it("maps add_child create draft and link_existing_child existing-only", () => {
        const created = buildRelationshipExecutionRequest({
            commandKey: "add_child",
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            invocation: invocation({
                commandKey: "add_child",
                surface: "opportunity_drawer",
                inputValues: {
                    source_customer_id: "cust-1",
                    create_child_draft: {
                        first_name: "Avery",
                        last_name: "Lee",
                        date_of_birth: "2020-01-01",
                    },
                    relationship_kind: "guardian",
                    role_key: "guardian",
                },
            }),
        });
        expect("error" in created).toBe(false);
        if ("error" in created) return;
        expect(created.actionKey).toBe("add_child");
        expect(created.createChildDraft).toEqual({
            first_name: "Avery",
            last_name: "Lee",
            date_of_birth: "2020-01-01",
        });
        expect(created.selectedChildPersonId).toBeUndefined();
        expect(created.roleKey).toBeUndefined();
        expect(created.sourceOpportunityId).toBe("opp-1");
        expect(created.scope).toBe("this_opportunity");

        const linked = buildRelationshipExecutionRequest({
            commandKey: "link_existing_child",
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            invocation: invocation({
                commandKey: "link_existing_child",
                surface: "opportunity_drawer",
                inputValues: {
                    source_customer_id: "cust-1",
                    selected_child_person_id: "child-person-9",
                    create_child_draft: { first_name: "No", last_name: "Create" },
                },
            }),
        });
        expect(linked).toEqual({
            error: "link_existing_child cannot create a new identity.",
        });

        const missing = buildRelationshipExecutionRequest({
            commandKey: "link_existing_child",
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            invocation: invocation({
                commandKey: "link_existing_child",
                inputValues: { source_customer_id: "cust-1" },
            }),
        });
        expect(missing).toEqual({
            error: "selectedChildPersonId is required to link an existing child.",
        });
    });

    it("keeps contact-role fixed roles distinct (no cross-role collapse)", () => {
        const roles = (
            ["add_emergency_contact", "add_authorized_pickup", "add_billing_contact"] as const
        ).map((key) => {
            const built = buildRelationshipExecutionRequest({
                commandKey: key,
                executionSubject: { entityType: "child", entityId: "child-1" },
                invocation: invocation({
                    commandKey: key,
                    inputValues: { ...basePayload, selected_person_id: "person-1" },
                }),
            });
            expect("error" in built).toBe(false);
            if ("error" in built) return null;
            return built.roleKey;
        });
        expect(new Set(roles).size).toBe(3);
        expect(roles).toEqual(["emergency_contact", "authorized_pickup", "billing_contact"]);
    });

    it("maps domain executor errors after delegation without fallback", async () => {
        relSpy.mockRejectedValueOnce(new Error("Person not found for this organization."));
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "link_existing_person",
                    inputValues: {
                        ...basePayload,
                        selected_person_id: "person-x",
                        role_key: "emergency_contact",
                    },
                }),
                mode: "execute",
                executionSubject: { entityType: "child", entityId: "child-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { executeRelationshipAction: relSpy },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.delegated).toBe(true);
            expect(result.error.operatorMessage).toBe("Person not found for this organization.");
        }
        expect(relSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects preview and invalid intent before delegation", async () => {
        const preview = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "add_parent_guardian",
                    inputValues: { ...basePayload, selected_person_id: "p1" },
                }),
                mode: "preview",
                executionSubject: { entityType: "child", entityId: "child-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { executeRelationshipAction: relSpy },
        });
        expect(preview.ok).toBe(false);
        if (!preview.ok) expect(preview.delegated).toBe(false);
        expect(relSpy).not.toHaveBeenCalled();

        const missing = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "add_parent_guardian",
                    inputValues: { source_customer_id: "cust-1" },
                }),
                mode: "execute",
                executionSubject: { entityType: "child", entityId: "child-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { executeRelationshipAction: relSpy },
        });
        expect(missing.ok).toBe(false);
        if (!missing.ok) expect(missing.delegated).toBe(false);
        expect(relSpy).not.toHaveBeenCalled();
    });

    it("prepares with relationship_runtime destination; gate supports exact keys only", () => {
        for (const key of RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS) {
            const prep = prepareCommandInvocation(invocation({ commandKey: key }));
            expect(prep.snapshot.executionDestination.owner).toBe("relationship_runtime");
            expect(isRelationshipRuntimeFacadeSupported(key)).toBe(true);
            expect(isCommandRuntimeFacadeExecutionSupported(key)).toBe(true);
        }
        expect(COMMAND_RUNTIME_EXECUTION_BY_OWNER.relationship_runtime).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("make_primary_contact")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("add_family_member")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("create_lead")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("close_lead")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("waitlist_child")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("cancel_tour")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("schedule_tour")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("complete_tour")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("open_record")).toBe(false);
    });

    it("adapter does not import persistence / direct-write modules", () => {
        const source = readFileSync(
            resolve(process.cwd(), "lib/platform/commands/runtime/adapters/relationshipExecutionAdapter.ts"),
            "utf8"
        );
        expect(source).toContain("executeRelationshipAction");
        expect(source).not.toMatch(/from\s+[\"']@\/lib\/supabase/);
        expect(source).not.toMatch(/customer_member_contacts/);
        expect(source).not.toMatch(/\.from\(/);
        expect(source).not.toMatch(/executeAdminAction/);
        expect(source).not.toMatch(/executeMutation/);
        expect(source).not.toMatch(/runRegisteredAction/);
    });

    it("executeRelationshipViaAdapter refuses unsupported destination", async () => {
        const { getPlatformCapability } = await import(
            "@/lib/platform/commands/capabilityRegistry"
        );
        const prep = prepareCommandInvocation(invocation({ commandKey: "create_lead" }));
        const capability = getPlatformCapability("create_lead")!;
        await expect(
            executeRelationshipViaAdapter({
                snapshot: prep.snapshot,
                capability,
                commandKey: "create_lead",
                invocation: invocation({ commandKey: "create_lead" }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
                mode: "execute",
                supabase,
                orgId: "org-1",
                userId: "user-1",
                guard: { invocationId: "g1", hasDelegated: () => false, markDelegated: () => {} },
                deps: { executeRelationshipAction: relSpy },
            })
        ).rejects.toThrow(/refused/);
        expect(relSpy).not.toHaveBeenCalled();
    });
});
