/**
 * P4.S2 — Make Primary Contact replacement preview + cutover.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import {
    isCommandRuntimeFacadeExecutionSupported,
    isDestructiveReplacementFacadeSupported,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import {
    assertDestructiveCommitAllowed,
    DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED,
    isDestructiveFacadeCommitAllowlisted,
} from "@/lib/platform/commands/runtime/destructive";
import {
    buildMakePrimaryDomainVersion,
    buildMakePrimaryImpactPreview,
    commitMakePrimaryContactViaAdapter,
    previewMakePrimaryContactViaAdapter,
    resolveMakePrimaryInputs,
    type MakePrimaryPreviewDomainState,
} from "@/lib/platform/commands/runtime/adapters/primaryContactReplacementAdapter";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

function baseInvocation(
    partial: Partial<CommandInvocationRequest> & Pick<CommandInvocationRequest, "commandKey">
): CommandInvocationRequest {
    return {
        origin: "operator",
        operationalContext: "focus_panel",
        surface: "record_header",
        ...partial,
    };
}

function sampleState(
    overrides: Partial<MakePrimaryPreviewDomainState> = {}
): MakePrimaryPreviewDomainState {
    const base: MakePrimaryPreviewDomainState = {
        customerId: "cust-1",
        selectedPersonId: "person-new",
        selectedLabel: "New Primary",
        currentPrimaryPersonId: "person-old",
        currentPrimaryLabel: "Old Primary",
        opportunityIds: ["opp-1", "opp-2"],
        domainVersion: "",
        alreadyPrimary: false,
        ...overrides,
    };
    base.domainVersion = buildMakePrimaryDomainVersion({
        customerId: base.customerId,
        selectedPersonId: base.selectedPersonId,
        currentPrimaryPersonId: base.currentPrimaryPersonId,
        opportunityIds: base.opportunityIds,
    });
    return base;
}

describe("P4.S2 make_primary_contact gate", () => {
    it("allowlists only make_primary_contact for destructive facade commit", () => {
        expect(DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED).toBe(false);
        expect(isDestructiveFacadeCommitAllowlisted("make_primary_contact")).toBe(true);
        expect(assertDestructiveCommitAllowed({ capabilityKey: "make_primary_contact" }).allowed).toBe(
            true
        );
        for (const key of ["delete_lead", "archive_lead", "cancel_tour", "withdraw_child"]) {
            expect(isDestructiveFacadeCommitAllowlisted(key)).toBe(false);
            expect(assertDestructiveCommitAllowed({ capabilityKey: key }).allowed).toBe(false);
            expect(isCommandRuntimeFacadeExecutionSupported(key)).toBe(false);
        }
        expect(isDestructiveReplacementFacadeSupported("make_primary_contact")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("make_primary_contact")).toBe(true);
    });
});

describe("P4.S2 preview adapter", () => {
    it("builds replacement preview with promote/demote and non-effects", () => {
        const preview = buildMakePrimaryImpactPreview({
            orgId: "org-1",
            state: sampleState(),
        });
        expect(preview.impactClass).toBe("replace");
        expect(preview.confirmation.policy).toBe("strong_confirm");
        expect(preview.affectedRecords.some((r) => r.effect === "promoted")).toBe(true);
        expect(preview.affectedRecords.some((r) => r.effect === "demoted")).toBe(true);
        expect(preview.warnings.some((w) => w.code === "prior_contact_remains_linked")).toBe(true);
        expect(preview.warnings.some((w) => w.code === "non_effect_roles")).toBe(true);
        expect(preview.previewToken).toBeTruthy();
        expect(preview.previewToken).not.toContain("New Primary");
        expect(preview.recovery.kind).toBe("restore");
    });

    it("reports no current primary without demotion", () => {
        const preview = buildMakePrimaryImpactPreview({
            orgId: "org-1",
            state: sampleState({
                currentPrimaryPersonId: null,
                currentPrimaryLabel: undefined,
            }),
        });
        expect(preview.affectedRecords.some((r) => r.effect === "promoted")).toBe(true);
        expect(preview.affectedRecords.some((r) => r.effect === "demoted")).toBe(false);
        expect(
            preview.affectedRecords.some((r) =>
                (r.label ?? "").toLowerCase().includes("no current primary")
            )
        ).toBe(true);
    });

    it("blocks already-primary as no-op without mutation", async () => {
        const state = sampleState({
            selectedPersonId: "person-old",
            currentPrimaryPersonId: "person-old",
            alreadyPrimary: true,
        });
        const setSpy = vi.fn();
        const emitSpy = vi.fn();
        const previewed = await previewMakePrimaryContactViaAdapter({
            orgId: "org-1",
            supabase: {} as SupabaseClient,
            entityType: "customer",
            entityId: "cust-1",
            inputValues: { person_id: "person-old" },
            trustedServerContext: true,
            deps: {
                readMakePrimaryPreviewDomainState: async () => state,
                setHouseholdPrimaryContactForCustomer: setSpy,
                emitHouseholdPrimaryContactChangedEvent: emitSpy,
            },
        });
        expect(previewed.ok).toBe(true);
        if (previewed.ok) {
            expect(previewed.preview.blockers.some((b) => b.code === "already_primary")).toBe(true);
        }
        expect(setSpy).not.toHaveBeenCalled();
        expect(emitSpy).not.toHaveBeenCalled();
    });

    it("preview fails closed without trusted context", async () => {
        const result = await previewMakePrimaryContactViaAdapter({
            orgId: "org-1",
            supabase: {} as SupabaseClient,
            entityType: "customer",
            entityId: "cust-1",
            inputValues: { person_id: "person-new" },
            trustedServerContext: false,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("untrusted_context");
    });
});

describe("P4.S2 commit adapter", () => {
    const makeGuard = () => {
        let delegated = false;
        return {
            invocationId: "inv-1",
            hasDelegated: () => delegated,
            markDelegated: () => {
                if (delegated) throw new Error("duplicate");
                delegated = true;
            },
        };
    };

    it("requires confirmation and calls domain service exactly once", async () => {
        const state = sampleState();
        const preview = buildMakePrimaryImpactPreview({ orgId: "org-1", state });
        const setSpy = vi.fn(async () => ({
            customer_id: "cust-1",
            primary_person_id: "person-new",
            opportunities_updated: 2,
            opportunity_ids: ["opp-1", "opp-2"],
        }));
        const emitSpy = vi.fn(async () => "event-1");

        const missingConfirm = await commitMakePrimaryContactViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            supabase: {} as SupabaseClient,
            entityType: "customer",
            entityId: "cust-1",
            inputValues: { person_id: "person-new" },
            previewToken: preview.previewToken,
            confirmation: { confirmed: false },
            trustedServerContext: true,
            guard: makeGuard(),
            deps: {
                readMakePrimaryPreviewDomainState: async () => state,
                setHouseholdPrimaryContactForCustomer: setSpy,
                emitHouseholdPrimaryContactChangedEvent: emitSpy,
            },
        });
        expect(missingConfirm.ok).toBe(false);
        if (!missingConfirm.ok) expect(missingConfirm.code).toBe("confirmation_required");
        expect(setSpy).not.toHaveBeenCalled();

        const g = makeGuard();
        const ok = await commitMakePrimaryContactViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            supabase: {} as SupabaseClient,
            entityType: "customer",
            entityId: "cust-1",
            inputValues: { person_id: "person-new" },
            previewToken: preview.previewToken,
            confirmation: { confirmed: true },
            trustedServerContext: true,
            clientPermissionClass: "financial_destructive",
            clientImpactClass: "delete",
            guard: g,
            deps: {
                readMakePrimaryPreviewDomainState: async () => state,
                setHouseholdPrimaryContactForCustomer: setSpy,
                emitHouseholdPrimaryContactChangedEvent: emitSpy,
            },
        });
        expect(ok.ok).toBe(true);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(g.hasDelegated()).toBe(true);
        if (ok.ok) {
            expect(ok.result.previous_primary_person_id).toBe("person-old");
            expect(ok.result.new_primary_person_id).toBe("person-new");
            expect(ok.result.event).toBe("household.primary_contact_changed");
        }
    });

    it("rejects stale preview when current primary changes", async () => {
        const state = sampleState();
        const preview = buildMakePrimaryImpactPreview({ orgId: "org-1", state });
        const stale = sampleState({ currentPrimaryPersonId: "person-other" });
        const setSpy = vi.fn();
        const result = await commitMakePrimaryContactViaAdapter({
            orgId: "org-1",
            supabase: {} as SupabaseClient,
            entityType: "customer",
            entityId: "cust-1",
            inputValues: { person_id: "person-new" },
            previewToken: preview.previewToken,
            confirmation: { confirmed: true },
            trustedServerContext: true,
            guard: makeGuard(),
            deps: {
                readMakePrimaryPreviewDomainState: async () => stale,
                setHouseholdPrimaryContactForCustomer: setSpy,
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("stale_preview");
        expect(setSpy).not.toHaveBeenCalled();
    });

    it("blocks already-primary commit without domain write or event", async () => {
        const state = sampleState({
            selectedPersonId: "person-old",
            currentPrimaryPersonId: "person-old",
            alreadyPrimary: true,
        });
        const preview = buildMakePrimaryImpactPreview({ orgId: "org-1", state });
        const setSpy = vi.fn();
        const emitSpy = vi.fn();
        const result = await commitMakePrimaryContactViaAdapter({
            orgId: "org-1",
            supabase: {} as SupabaseClient,
            entityType: "customer",
            entityId: "cust-1",
            inputValues: { person_id: "person-old" },
            previewToken: preview.previewToken,
            confirmation: { confirmed: true },
            trustedServerContext: true,
            guard: makeGuard(),
            deps: {
                readMakePrimaryPreviewDomainState: async () => state,
                setHouseholdPrimaryContactForCustomer: setSpy,
                emitHouseholdPrimaryContactChangedEvent: emitSpy,
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("already_primary");
        expect(setSpy).not.toHaveBeenCalled();
        expect(emitSpy).not.toHaveBeenCalled();
    });

    it("adapter does not call Relationship Runtime or duplicate designation logic", () => {
        const source = readFileSync(
            resolve(
                process.cwd(),
                "lib/platform/commands/runtime/adapters/primaryContactReplacementAdapter.ts"
            ),
            "utf8"
        );
        expect(source).toContain("setHouseholdPrimaryContactForCustomer");
        expect(source).toContain("emitHouseholdPrimaryContactChangedEvent");
        expect(source).not.toContain("executeRelationshipAction");
        expect(source).not.toContain("executeMutation");
        expect(source).not.toContain("ensureCustomerPersonsPrimaryLink");
    });
});

describe("P4.S2 executeCommandInvocation integration", () => {
    it("BOS/API/automation cannot bypass confirmation", async () => {
        for (const origin of ["bos", "api", "automation"] as const) {
            const result = await executeCommandInvocation({
                request: {
                    mode: "execute",
                    invocation: baseInvocation({
                        commandKey: "make_primary_contact",
                        origin,
                        inputValues: { customer_id: "cust-1", person_id: "person-new" },
                    }),
                    confirmation: { confirmed: false },
                    previewToken: "tok",
                    executionSubject: { entityType: "customer", entityId: "cust-1" },
                },
                server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            });
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.error.code).toBe("confirmation_required");
        }
    });

    it("preview and commit path uses adapter deps exactly once", async () => {
        const state = sampleState();
        const setSpy = vi.fn(async () => ({
            customer_id: "cust-1",
            primary_person_id: "person-new",
            opportunities_updated: 2,
            opportunity_ids: ["opp-1", "opp-2"],
        }));
        const emitSpy = vi.fn(async () => "event-1");
        const readSpy = vi.fn(async () => state);

        const previewed = await executeCommandInvocation({
            request: {
                mode: "preview",
                invocation: baseInvocation({
                    commandKey: "make_primary_contact",
                    inputValues: { customer_id: "cust-1", person_id: "person-new" },
                }),
                executionSubject: { entityType: "customer", entityId: "cust-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: {
                readMakePrimaryPreviewDomainState: readSpy,
                setHouseholdPrimaryContactForCustomer: setSpy,
                emitHouseholdPrimaryContactChangedEvent: emitSpy,
            },
        });
        expect(previewed.ok).toBe(true);
        if (!previewed.ok) throw new Error("expected preview ok");
        expect(previewed.impactPreview?.previewToken).toBeTruthy();
        expect(setSpy).not.toHaveBeenCalled();

        const committed = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "make_primary_contact",
                    inputValues: { customer_id: "cust-1", person_id: "person-new" },
                }),
                confirmation: { confirmed: true },
                previewToken: previewed.impactPreview!.previewToken,
                executionSubject: { entityType: "customer", entityId: "cust-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: {
                readMakePrimaryPreviewDomainState: readSpy,
                setHouseholdPrimaryContactForCustomer: setSpy,
                emitHouseholdPrimaryContactChangedEvent: emitSpy,
            },
        });
        expect(committed.ok).toBe(true);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledTimes(1);
        if (committed.ok) {
            expect(committed.executionOwner).toBe("admin_action");
            expect(committed.replacementResult?.kind).toBe("replacement");
        }
    });

    it("resolves customer/person inputs from payload", () => {
        expect(
            resolveMakePrimaryInputs({
                entityType: "opportunity",
                entityId: "opp-1",
                inputValues: { customer_id: "cust-1", person_id: "p-1" },
            })
        ).toEqual({ customerId: "cust-1", selectedPersonId: "p-1" });
    });

    it("preparation reports facade commit enabled for make_primary only", () => {
        const primary = prepareCommandInvocation(
            baseInvocation({ commandKey: "make_primary_contact" })
        );
        expect(primary.snapshot.destructivePreparation?.facadeCommitEnabled).toBe(true);
        const del = prepareCommandInvocation(baseInvocation({ commandKey: "delete_lead" }));
        expect(del.snapshot.destructivePreparation?.facadeCommitEnabled).toBe(false);
    });
});
