/**
 * P4.S1 — Destructive / replacement Command safety foundation.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getPlatformCapability } from "@/lib/platform/commands/capabilityRegistry";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import { isCommandRuntimeFacadeExecutionSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import {
    assertDestructiveCommitAllowed,
    assertDestructivePolicyRegistryIntegrity,
    assertDestructivePreviewInvariants,
    createDestructiveFixtureAdapter,
    DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED,
    DESTRUCTIVE_PREVIEW_FRAMEWORK_ENABLED,
    DESTRUCTIVE_PREVIEW_TOKEN_IS_NOT_IDEMPOTENCY_KEY,
    evaluateDestructivePermissionClass,
    fixtureKindForPolicy,
    getDestructiveCommandPolicy,
    isDestructiveOrReplacementCapability,
    issueDestructivePreviewToken,
    listDestructiveCommandPolicies,
    requireDestructiveCommandPolicy,
    validateDestructivePreviewToken,
} from "@/lib/platform/commands/runtime/destructive";

function baseRequest(
    partial: Partial<CommandInvocationRequest> & Pick<CommandInvocationRequest, "commandKey">
): CommandInvocationRequest {
    return {
        origin: "operator",
        operationalContext: "focus_panel",
        surface: "record_header",
        preparationIntent: "prepare",
        ...partial,
    };
}

describe("P4.S1 destructive policy registry", () => {
    it("classifies representative impact classes", () => {
        expect(getDestructiveCommandPolicy("delete_lead")?.impactClass).toBe("delete");
        expect(getDestructiveCommandPolicy("archive_lead")?.impactClass).toBe("archive");
        expect(getDestructiveCommandPolicy("make_primary_contact")?.impactClass).toBe("replace");
        expect(getDestructiveCommandPolicy("cancel_tour")?.impactClass).toBe("cancel");
        expect(getDestructiveCommandPolicy("withdraw_child")?.impactClass).toBe("withdraw");
    });

    it("registers a policy for every classified destructive capability", () => {
        for (const policy of listDestructiveCommandPolicies()) {
            expect(policy.requiresPreview).toBe(true);
            expect(policy.confirmation).not.toBe("none");
            expect(getPlatformCapability(policy.capabilityKey)?.destructiveKind).toBe(
                policy.impactClass
            );
        }
        assertDestructivePolicyRegistryIntegrity();
    });

    it("fails closed for missing policies", () => {
        expect(getDestructiveCommandPolicy("close_lead")).toBeNull();
        expect(isDestructiveOrReplacementCapability("close_lead")).toBe(false);
        expect(() => requireDestructiveCommandPolicy("close_lead")).toThrow(/Fail closed/);
    });

    it("does not attach destructive policy to non-destructive capabilities", () => {
        expect(getDestructiveCommandPolicy("create_lead")).toBeNull();
        expect(getDestructiveCommandPolicy("add_parent_guardian")).toBeNull();
        expect(getDestructiveCommandPolicy("update_lead_status")).toBeNull();
    });

    it("make_primary_contact is replacement with displaced impact", () => {
        const policy = requireDestructiveCommandPolicy("make_primary_contact");
        expect(policy.impactClass).toBe("replace");
        expect(policy.requiresDisplacedImpact).toBe(true);
        expect(policy.confirmation).toBe("strong_confirm");
        expect(policy.permissionClass).toBe("replacement");
        expect(policy.recovery.kind).toBe("restore");
        expect(policy.reversibility).toBe("conditionally_reversible");
    });
});

describe("P4.S1 preparation integration", () => {
    it("destructive snapshot reports preview required; delete_lead commit allowlisted in P4.S3", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "delete_lead" }));
        expect(result.snapshot.destructivePreparation).toMatchObject({
            impactClass: "delete",
            requiresPreview: true,
            confirmation: "typed_confirm",
            permissionClass: "sensitive_destructive",
            recoveryKind: "none",
            facadeCommitEnabled: true,
        });
        expect(result.snapshot.supportsPreview).toBe(true);
        expect(result.snapshot.confirmationPolicy).toBe("typed_confirm");
        expect(result.snapshot.authorizationEvaluated).toBe(false);
        expect(result.snapshot.authorizationGranted).toBeNull();
    });

    it("replacement snapshot reports displaced-impact requirement", () => {
        const result = prepareCommandInvocation(
            baseRequest({ commandKey: "make_primary_contact" })
        );
        expect(result.snapshot.destructivePreparation?.impactClass).toBe("replace");
        expect(result.snapshot.destructivePreparation?.requiresDisplacedImpact).toBe(true);
        expect(result.snapshot.destructivePreparation?.facadeCommitEnabled).toBe(true);
        expect(result.snapshot.confirmationPolicy).toBe("strong_confirm");
        expect(result.snapshot.supportsPreview).toBe(true);
        expect(result.snapshot.nextLifecycleStage).not.toBe("execute");
    });

    it("BOS origin cannot skip preview for destructive capability", () => {
        const result = prepareCommandInvocation(
            baseRequest({
                commandKey: "delete_lead",
                origin: "bos",
                providedSubject: { entityType: "opportunity", entityId: "opp-1" },
            })
        );
        expect(result.snapshot.destructivePreparation).not.toBeNull();
        expect(result.snapshot.nextLifecycleStage).not.toBe("execute");
        expect(result.snapshot.confirmationPolicy).toBe("typed_confirm");
    });

    it("API/system origin cannot weaken confirmation to execute", () => {
        for (const origin of ["api", "system", "automation"] as const) {
            const result = prepareCommandInvocation(
                baseRequest({
                    commandKey: "cancel_tour",
                    origin,
                    providedSubject: { entityType: "opportunity", entityId: "opp-1" },
                })
            );
            expect(result.snapshot.confirmationPolicy).toBe("strong_confirm");
            expect(result.snapshot.nextLifecycleStage).not.toBe("execute");
        }
    });

    it("unavailable destructive capability cannot advance to execute", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "archive_lead" }));
        expect(result.ok).toBe(false);
        expect(result.snapshot.runnable).toBe(false);
        expect(result.snapshot.destructivePreparation?.impactClass).toBe("archive");
        expect(result.snapshot.nextLifecycleStage).toBeNull();
    });

    it("non-destructive snapshots remain without destructivePreparation", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "create_lead" }));
        expect(result.snapshot.destructivePreparation).toBeNull();
    });
});

describe("P4.S1 preview token correlation", () => {
    const baseIssue = {
        capabilityKey: "delete_lead",
        subjectType: "opportunity",
        subjectId: "opp-1",
        orgId: "org-1",
        impactClass: "delete",
        confirmation: "typed_confirm",
        version: "v1",
        ttlSeconds: 120,
    };

    it("issues a server-generated preview id/token without embedding payload", () => {
        const issued = issueDestructivePreviewToken(baseIssue);
        expect(issued.previewId.length).toBeGreaterThan(8);
        expect(issued.token.includes(".")).toBe(true);
        expect(issued.token).not.toContain("affectedRecords");
        expect(issued.token).not.toContain("stack");
        expect(DESTRUCTIVE_PREVIEW_TOKEN_IS_NOT_IDEMPOTENCY_KEY).toBe(true);
    });

    it("validates matching capability and subject", () => {
        const issued = issueDestructivePreviewToken(baseIssue);
        const ok = validateDestructivePreviewToken({
            token: issued.token,
            expected: {
                capabilityKey: "delete_lead",
                subjectType: "opportunity",
                subjectId: "opp-1",
                orgId: "org-1",
                impactClass: "delete",
                confirmation: "typed_confirm",
                version: "v1",
            },
        });
        expect(ok.ok).toBe(true);
    });

    it("rejects tampered capability", () => {
        const issued = issueDestructivePreviewToken(baseIssue);
        const bad = validateDestructivePreviewToken({
            token: issued.token,
            expected: {
                capabilityKey: "archive_lead",
                subjectType: "opportunity",
                subjectId: "opp-1",
                orgId: "org-1",
            },
        });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.code).toBe("claim_mismatch");
    });

    it("rejects tampered subject", () => {
        const issued = issueDestructivePreviewToken(baseIssue);
        const bad = validateDestructivePreviewToken({
            token: issued.token,
            expected: {
                capabilityKey: "delete_lead",
                subjectType: "opportunity",
                subjectId: "opp-OTHER",
                orgId: "org-1",
            },
        });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.code).toBe("claim_mismatch");
    });

    it("rejects expired token", () => {
        const issued = issueDestructivePreviewToken({
            ...baseIssue,
            ttlSeconds: 1,
            nowMs: 1_000_000,
        });
        const bad = validateDestructivePreviewToken({
            token: issued.token,
            expected: {
                capabilityKey: "delete_lead",
                subjectType: "opportunity",
                subjectId: "opp-1",
                orgId: "org-1",
            },
            nowMs: 1_000_000 + 5_000,
        });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.code).toBe("expired");
    });

    it("rejects wrong organization", () => {
        const issued = issueDestructivePreviewToken(baseIssue);
        const bad = validateDestructivePreviewToken({
            token: issued.token,
            expected: {
                capabilityKey: "delete_lead",
                subjectType: "opportunity",
                subjectId: "opp-1",
                orgId: "org-OTHER",
            },
        });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.code).toBe("org_mismatch");
    });

    it("rejects stale version (requires revalidation)", () => {
        const issued = issueDestructivePreviewToken(baseIssue);
        const bad = validateDestructivePreviewToken({
            token: issued.token,
            expected: {
                capabilityKey: "delete_lead",
                subjectType: "opportunity",
                subjectId: "opp-1",
                orgId: "org-1",
                version: "v2-changed",
            },
        });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.code).toBe("claim_mismatch");
    });
});

describe("P4.S1 permission-class seam", () => {
    it("ignores client permission class and fails closed without trusted context", () => {
        const denied = evaluateDestructivePermissionClass({
            capabilityKey: "delete_lead",
            trustedServerContext: false,
            clientPermissionClass: "standard_destructive",
        });
        expect(denied.allowed).toBe(false);
        expect(denied.reasonCode).toBe("untrusted_context");
        expect(denied.permissionClass).toBe("sensitive_destructive");

        const allowed = evaluateDestructivePermissionClass({
            capabilityKey: "delete_lead",
            trustedServerContext: true,
            clientPermissionClass: "financial_destructive",
        });
        expect(allowed.allowed).toBe(true);
        expect(allowed.permissionClass).toBe("sensitive_destructive");
        expect(allowed.authorizationProductEvaluated).toBe(false);
    });
});

describe("P4.S1 execution guard", () => {
    it("keeps destructive commit globally disabled except exact allowlist", () => {
        expect(DESTRUCTIVE_PREVIEW_FRAMEWORK_ENABLED).toBe(true);
        expect(DESTRUCTIVE_COMMAND_RUNTIME_COMMIT_ENABLED).toBe(false);
        const guard = assertDestructiveCommitAllowed({ capabilityKey: "archive_lead" });
        expect(guard.allowed).toBe(false);
        expect(guard.code).toBe("commit_globally_disabled");
        expect(assertDestructiveCommitAllowed({ capabilityKey: "make_primary_contact" }).allowed).toBe(
            true
        );
        expect(assertDestructiveCommitAllowed({ capabilityKey: "delete_lead" }).allowed).toBe(true);
        expect(assertDestructiveCommitAllowed({ capabilityKey: "cancel_tour" }).allowed).toBe(true);
    });

    it("blocks Archive/Withdraw facade commit; Primary, Delete, Cancel Tour are allowlisted", async () => {
        expect(isCommandRuntimeFacadeExecutionSupported("make_primary_contact")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("delete_lead")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("cancel_tour")).toBe(true);
        for (const key of ["archive_lead", "withdraw_child"] as const) {
            expect(isCommandRuntimeFacadeExecutionSupported(key)).toBe(false);
            const result = await executeCommandInvocation({
                request: {
                    mode: "execute",
                    invocation: baseRequest({
                        commandKey: key,
                        providedSubject: { entityType: "opportunity", entityId: "opp-1" },
                    }),
                    executionSubject: { entityType: "opportunity", entityId: "opp-1" },
                },
                server: {
                    orgId: "org-1",
                    userId: "user-1",
                    supabase: {} as never,
                },
            });
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(
                    result.error.code === "commit_globally_disabled" ||
                        result.error.code === "facade_execution_unsupported" ||
                        result.error.code === "capability_not_executable"
                ).toBe(true);
            }
        }
    });

    it("does not enable facade for withdraw_child or archive_lead", () => {
        expect(isCommandRuntimeFacadeExecutionSupported("withdraw_child")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("archive_lead")).toBe(false);
    });
});

describe("P4.S1 fixture adapters (read-only preview)", () => {
    it("delete fixture is irreversible typed confirm without mutation", async () => {
        const policy = requireDestructiveCommandPolicy("delete_lead");
        const adapter = createDestructiveFixtureAdapter("delete");
        const preview = await adapter.preview({
            policy,
            orgId: "org-1",
            subjectType: "opportunity",
            subjectId: "opp-1",
            subjectLabel: "Acme Lead",
            domainVersion: "v1",
        });
        assertDestructivePreviewInvariants(preview, policy);
        expect(preview.affectedRecords.some((r) => r.effect === "deleted")).toBe(true);
        expect(preview.recovery.kind).toBe("none");
        expect(preview.confirmation.policy).toBe("typed_confirm");
        const commit = await adapter.commit({
            policy,
            orgId: "org-1",
            subjectType: "opportunity",
            subjectId: "opp-1",
            previewToken: preview.previewToken,
            domainVersion: "v1",
            confirmation: { confirmed: true, confirmationValue: "Acme Lead" },
        });
        expect(commit.ok).toBe(false);
        expect(commit.code).toBe("commit_disabled");
    });

    it("archive fixture retains history; recovery none until executor exists (P4.S4)", async () => {
        const policy = requireDestructiveCommandPolicy("archive_lead");
        expect(policy.recovery.kind).toBe("none");
        const adapter = createDestructiveFixtureAdapter("archive");
        const preview = await adapter.preview({
            policy,
            orgId: "org-1",
            subjectType: "opportunity",
            subjectId: "opp-1",
            subjectLabel: "Acme Lead",
            domainVersion: "v1",
        });
        assertDestructivePreviewInvariants(preview, policy);
        expect(preview.affectedRecords.some((r) => r.effect === "archived")).toBe(true);
        expect(preview.recovery.kind).toBe("none");
    });

    it("replacement fixture promotes and demotes", async () => {
        const policy = requireDestructiveCommandPolicy("make_primary_contact");
        expect(fixtureKindForPolicy("make_primary_contact")).toBe("replace");
        const adapter = createDestructiveFixtureAdapter("replace");
        const preview = await adapter.preview({
            policy,
            orgId: "org-1",
            subjectType: "person",
            subjectId: "person-new",
            subjectLabel: "New Primary",
            domainVersion: "household-v3",
        });
        assertDestructivePreviewInvariants(preview, policy);
        expect(preview.affectedRecords.some((r) => r.effect === "promoted")).toBe(true);
        expect(preview.affectedRecords.some((r) => r.effect === "demoted")).toBe(true);
        expect(preview.warnings.some((w) => w.code === "prior_contact_remains_linked")).toBe(
            true
        );
    });
});

describe("P4.S1 side-effect safety", () => {
    it("shared destructive framework has no direct domain write imports", () => {
        const dir = resolve(
            process.cwd(),
            "lib/platform/commands/runtime/destructive"
        );
        const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
        const banned = [
            "executeMutation",
            "executeRelationshipAction",
            "setHouseholdPrimaryContact",
            "from(\"opportunities\")",
            "supabase.from",
            "@/lib/mutations/runtime",
            "@/lib/admin/person/setHouseholdPrimaryContact",
        ];
        for (const file of files) {
            const src = readFileSync(join(dir, file), "utf8");
            for (const needle of banned) {
                expect(src.includes(needle), `${file} must not contain ${needle}`).toBe(false);
            }
        }
    });
});
