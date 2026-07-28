/**
 * P4.S3 — Delete Lead destructive preview + cutover.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { OpportunityLeadDeletionPreview } from "@/lib/admin/opportunity/deleteOpportunityLead";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import { isCommandRuntimeFacadeExecutionSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import {
    assertDestructiveCommitAllowed,
    isDestructiveFacadeCommitAllowlisted,
} from "@/lib/platform/commands/runtime/destructive";
import {
    buildDeleteLeadDomainVersion,
    buildDeleteLeadImpactPreview,
    commitDeleteLeadViaAdapter,
    previewDeleteLeadViaAdapter,
    resolveDeleteLeadTypedValue,
    type DeleteLeadPreviewState,
} from "@/lib/platform/commands/runtime/adapters/deleteLeadAdapter";
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

function sampleDomainPreview(
    overrides: Partial<OpportunityLeadDeletionPreview> = {}
): OpportunityLeadDeletionPreview {
    return {
        opportunity_id: "opp-1",
        opportunity_name: "Acme Family",
        blocked: false,
        block_reason: null,
        will_delete: {
            opportunities: 1,
            enrollment_records: 1,
            adults: 1,
            children: 1,
            customer_members: 1,
            customers: 0,
            persons: 0,
            tasks: 2,
            communication_threads: 1,
            communication_messages: 3,
            communication_scheduled_sends: 0,
            documents: 1,
            form_submissions: 0,
            placement_candidates: 1,
            field_values: 4,
        },
        will_retain: { customers: 1, persons: 2, customer_members: 0 },
        counts: {
            opportunities: 1,
            enrollment_records: 1,
            parents: 1,
            children: 1,
            customer_members: 1,
            customers: 0,
            placement_candidates: 1,
        },
        deletable: { persons: 0, customers: 0, customer_members: 0 },
        ...overrides,
    };
}

function sampleState(
    overrides: Partial<DeleteLeadPreviewState> = {}
): DeleteLeadPreviewState {
    const domainPreview = overrides.domainPreview ?? sampleDomainPreview();
    return {
        opportunityId: domainPreview.opportunity_id,
        domainPreview,
        typedValue: resolveDeleteLeadTypedValue(domainPreview.opportunity_name),
        domainVersion: buildDeleteLeadDomainVersion(domainPreview),
        ...overrides,
    };
}

describe("P4.S3 delete_lead gate", () => {
    it("allowlists delete_lead alongside make_primary_contact", () => {
        expect(isDestructiveFacadeCommitAllowlisted("delete_lead")).toBe(true);
        expect(assertDestructiveCommitAllowed({ capabilityKey: "delete_lead" }).allowed).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("delete_lead")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("archive_lead")).toBe(false);
    });
});

describe("P4.S3 preview", () => {
    it("builds hard-delete preview with typed value and retained identity", () => {
        const preview = buildDeleteLeadImpactPreview({
            orgId: "org-1",
            state: sampleState(),
        });
        expect(preview.impactClass).toBe("delete");
        expect(preview.confirmation.policy).toBe("typed_confirm");
        expect(preview.confirmation.typedValue).toBe("Acme Family");
        expect(preview.recovery.kind).toBe("none");
        expect(preview.affectedRecords.some((r) => r.effect === "deleted")).toBe(true);
        expect(preview.warnings.some((w) => w.code === "work_unit_retained")).toBe(true);
        expect(preview.warnings.some((w) => w.code === "identity_retained")).toBe(true);
        expect(preview.previewToken).not.toContain("Acme Family");
    });

    it("uses DELETE when opportunity name is empty", () => {
        expect(resolveDeleteLeadTypedValue(null)).toBe("DELETE");
        expect(resolveDeleteLeadTypedValue("")).toBe("DELETE");
    });

    it("blocks when domain preview is blocked", () => {
        const preview = buildDeleteLeadImpactPreview({
            orgId: "org-1",
            state: sampleState({
                domainPreview: sampleDomainPreview({
                    blocked: true,
                    block_reason: "Linked jobs prevent deletion",
                }),
            }),
        });
        expect(preview.blockers.some((b) => b.code === "deletion_blocked")).toBe(true);
    });
});

describe("P4.S3 commit adapter", () => {
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

    it("requires typed confirmation and calls executor once", async () => {
        const state = sampleState();
        const impact = buildDeleteLeadImpactPreview({ orgId: "org-1", state });
        const execSpy = vi.fn(async () => ({
            deleted: { opportunities: 1 },
            orphans: { opportunities: 0 },
            audit_logged: true,
        }));
        const previewSpy = vi.fn(async () => state.domainPreview);

        const badType = await commitDeleteLeadViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            actorRole: "admin",
            supabase: {} as SupabaseClient,
            entityType: "opportunity",
            entityId: "opp-1",
            previewToken: impact.previewToken,
            confirmation: { confirmed: true, confirmationValue: "WRONG" },
            trustedServerContext: true,
            guard: makeGuard(),
            deps: {
                previewOpportunityLeadDeletion: previewSpy,
                executeDeleteOpportunityLead: execSpy,
            },
        });
        expect(badType.ok).toBe(false);
        if (!badType.ok) expect(badType.code).toBe("typed_confirmation_mismatch");
        expect(execSpy).not.toHaveBeenCalled();

        const g = makeGuard();
        const ok = await commitDeleteLeadViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            actorRole: "admin",
            supabase: {} as SupabaseClient,
            entityType: "opportunity",
            entityId: "opp-1",
            previewToken: impact.previewToken,
            confirmation: { confirmed: true, confirmationValue: "Acme Family" },
            trustedServerContext: true,
            guard: g,
            deps: {
                previewOpportunityLeadDeletion: previewSpy,
                executeDeleteOpportunityLead: execSpy,
            },
        });
        expect(ok.ok).toBe(true);
        expect(execSpy).toHaveBeenCalledTimes(1);
        expect(g.hasDelegated()).toBe(true);
    });

    it("rejects stale preview when impact changes", async () => {
        const state = sampleState();
        const impact = buildDeleteLeadImpactPreview({ orgId: "org-1", state });
        const stale = sampleDomainPreview({
            will_delete: { ...state.domainPreview.will_delete, documents: 99 },
        });
        const execSpy = vi.fn();
        const result = await commitDeleteLeadViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            actorRole: "admin",
            supabase: {} as SupabaseClient,
            entityType: "opportunity",
            entityId: "opp-1",
            previewToken: impact.previewToken,
            confirmation: { confirmed: true, confirmationValue: "Acme Family" },
            trustedServerContext: true,
            guard: makeGuard(),
            deps: {
                previewOpportunityLeadDeletion: async () => stale,
                executeDeleteOpportunityLead: execSpy,
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("stale_preview");
        expect(execSpy).not.toHaveBeenCalled();
    });

    it("adapter does not reimplement cascade deletes", () => {
        const source = readFileSync(
            resolve(process.cwd(), "lib/platform/commands/runtime/adapters/deleteLeadAdapter.ts"),
            "utf8"
        );
        expect(source).toContain("executeDeleteOpportunityLead");
        expect(source).toContain("previewOpportunityLeadDeletion");
        expect(source).not.toContain("executeRelationshipAction");
        expect(source).not.toContain("executeMutation");
        expect(source).not.toContain("executeOpportunityLeadDeletionGraph");
    });
});

describe("P4.S3 executeCommandInvocation", () => {
    it("BOS cannot bypass typed confirmation", async () => {
        const result = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "delete_lead",
                    origin: "bos",
                }),
                confirmation: { confirmed: true, confirmationValue: "x" },
                previewToken: "tok",
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: {
                orgId: "org-1",
                userId: "user-1",
                actorRole: "admin",
                supabase: {} as SupabaseClient,
            },
            deps: {
                previewOpportunityLeadDeletion: async () => sampleDomainPreview(),
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(
                result.error.code === "typed_confirmation_mismatch" ||
                    result.error.code === "stale_preview" ||
                    result.error.code === "confirmation_required"
            ).toBe(true);
        }
    });

    it("preview then commit through facade exactly once", async () => {
        const domainPreview = sampleDomainPreview();
        const previewSpy = vi.fn(async () => domainPreview);
        const execSpy = vi.fn(async () => ({
            deleted: { opportunities: 1 },
            orphans: { opportunities: 0 },
            audit_logged: true,
        }));

        const previewed = await executeCommandInvocation({
            request: {
                mode: "preview",
                invocation: baseInvocation({ commandKey: "delete_lead" }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: {
                orgId: "org-1",
                userId: "user-1",
                actorRole: "admin",
                supabase: {} as SupabaseClient,
            },
            deps: {
                previewOpportunityLeadDeletion: previewSpy,
                executeDeleteOpportunityLead: execSpy,
            },
        });
        expect(previewed.ok).toBe(true);
        if (!previewed.ok) throw new Error("preview failed");
        expect(execSpy).not.toHaveBeenCalled();
        const typed = previewed.impactPreview?.confirmation.typedValue;
        expect(typed).toBe("Acme Family");

        const committed = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({ commandKey: "delete_lead" }),
                confirmation: { confirmed: true, confirmationValue: typed },
                previewToken: previewed.impactPreview!.previewToken,
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: {
                orgId: "org-1",
                userId: "user-1",
                actorRole: "admin",
                supabase: {} as SupabaseClient,
            },
            deps: {
                previewOpportunityLeadDeletion: previewSpy,
                executeDeleteOpportunityLead: execSpy,
            },
        });
        expect(committed.ok).toBe(true);
        expect(execSpy).toHaveBeenCalledTimes(1);
        if (committed.ok) {
            expect(committed.deleteLeadResult?.kind).toBe("destructive_delete");
        }
    });

    it("preparation reports facade commit enabled for delete_lead", () => {
        const snap = prepareCommandInvocation(baseInvocation({ commandKey: "delete_lead" }));
        expect(snap.snapshot.destructivePreparation?.facadeCommitEnabled).toBe(true);
        expect(snap.snapshot.confirmationPolicy).toBe("typed_confirm");
    });
});
