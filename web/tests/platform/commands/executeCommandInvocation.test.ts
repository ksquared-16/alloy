import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/adminV2/actions/actionTypes";
import { REGISTERED_ACTION_CAPABILITY_KEYS } from "@/lib/platform/commands/capabilityRegistry";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import {
    COMMAND_RUNTIME_EXECUTION_BY_OWNER,
    isCommandRuntimeFacadeExecutionSupported,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { COMMAND_RUNTIME_EXECUTION_ENABLED } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

function invocation(
    partial: Partial<CommandInvocationRequest> & Pick<CommandInvocationRequest, "commandKey">
): CommandInvocationRequest {
    return {
        origin: "operator",
        operationalContext: "focus_panel",
        surface: "record_header",
        ...partial,
    };
}

function okActionResult(actionKey: string, mode: "preview" | "execute"): ActionResult {
    return {
        ok: true,
        correlationId: "cid-1",
        result: {
            actionKey,
            entityType: "opportunity",
            entityId: "opp-1",
            affectedId: mode === "execute" ? "opp-new" : null,
            detail: { mode },
        },
    };
}

describe("executeCommandInvocation (P1.S2)", () => {
    const supabase = {} as SupabaseClient;
    let runSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        runSpy = vi.fn(async (_sb, _ctx, inv, mode = "execute") =>
            okActionResult(inv.actionKey, mode as "preview" | "execute")
        );
    });

    it("executes all RegisteredActions through the adapter once", async () => {
        for (const key of REGISTERED_ACTION_CAPABILITY_KEYS) {
            runSpy.mockClear();
            const result = await executeCommandInvocation({
                request: {
                    invocation: invocation({
                        commandKey: key,
                        inputValues: key === "create_lead" ? { contact_name: "A" } : { status_key: "x" },
                    }),
                    mode: "execute",
                    executionSubject: {
                        entityType: "opportunity",
                        entityId: key === "create_lead" ? "create-lead" : "opp-1",
                    },
                    invocationId: `inv-${key}`,
                },
                server: { orgId: "org-1", userId: "user-1", supabase },
                deps: { runRegisteredAction: runSpy as never },
            });
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.executionOwner).toBe("registered_action");
                expect(result.status).toBe("committed");
                expect(result.invocationId).toBe(`inv-${key}`);
                expect(result.canonicalCapabilityKey).toBe(key);
            }
            expect(runSpy).toHaveBeenCalledTimes(1);
            expect(runSpy.mock.calls[0][3]).toBe("execute");
        }
    });

    it("delegates preview once without execute mode", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({ commandKey: "create_lead" }),
                mode: "preview",
                executionSubject: { entityType: "opportunity", entityId: "create-lead" },
                invocationId: "inv-preview",
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { runRegisteredAction: runSpy as never },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.status).toBe("previewed");
        expect(runSpy).toHaveBeenCalledTimes(1);
        expect(runSpy.mock.calls[0][3]).toBe("preview");
    });

    it("carries request departmentId into the RegisteredAction invocation context", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "create_lead",
                    inputValues: { contact_name: "A" },
                    workUnitId: "wu-1",
                }),
                mode: "execute",
                executionSubject: { entityType: "opportunity", entityId: "create-lead" },
                invocationId: "inv-dept",
                departmentId: "dept-1",
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { runRegisteredAction: runSpy as never },
        });
        expect(result.ok).toBe(true);
        expect(runSpy).toHaveBeenCalledTimes(1);
        // Dropping this strands Create Lead with no lifecycle binding → 422 "not configured
        // for this process/location" even when the client sent a valid department.
        expect(runSpy.mock.calls[0][2].context.department_id).toBe("dept-1");
    });

    it("rejects unknown, placeholder, unadapted relationship, navigation, processing, and uncut aliases", async () => {
        const cases = [
            "totally_unknown_xyz",
            "send_message_placeholder",
            "add_family_member",
            "schedule_tour",
            "open_record",
            "processing.create_lead",
            "mark_lost",
            "approve_enrollment",
        ] as const;
        for (const key of cases) {
            const result = await executeCommandInvocation({
                request: {
                    invocation: invocation({ commandKey: key }),
                    mode: "execute",
                    executionSubject: { entityType: "opportunity", entityId: "opp-1" },
                },
                server: { orgId: "org-1", userId: "user-1", supabase },
                deps: { runRegisteredAction: runSpy as never },
            });
            expect(result.ok).toBe(false);
            expect(runSpy).not.toHaveBeenCalled();
            runSpy.mockClear();
        }
    });

    it("accepts move_to_waitlist as waitlist_child facade alias", () => {
        expect(isCommandRuntimeFacadeExecutionSupported("move_to_waitlist")).toBe(true);
    });

    it("ignores client actor and uses server org/user", async () => {
        await executeCommandInvocation({
            request: {
                invocation: {
                    ...invocation({ commandKey: "update_status" }),
                    actor: { orgId: "spoof-org", userId: "spoof-user" },
                },
                mode: "execute",
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "real-org", userId: "real-user", supabase },
            deps: { runRegisteredAction: runSpy as never },
        });
        expect(runSpy).toHaveBeenCalledTimes(1);
        expect(runSpy.mock.calls[0][1]).toEqual(
            expect.objectContaining({ orgId: "real-org", userId: "real-user" })
        );
    });

    it("does not let client select execution owner via body fields on invocation", async () => {
        // Spoof attempt: cancel_tour is facade-adapted but still requires preview token + confirm;
        // RegisteredAction must never run.
        expect(isCommandRuntimeFacadeExecutionSupported("cancel_tour")).toBe(true);
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({
                    commandKey: "cancel_tour",
                    inputValues: { execution_owner: "registered_action", booking_id: "bk-1" },
                }),
                mode: "execute",
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { runRegisteredAction: runSpy as never },
        });
        expect(result.ok).toBe(false);
        expect(runSpy).not.toHaveBeenCalled();
    });

    it("rejects execute when confirmation explicitly denied", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({ commandKey: "create_lead", origin: "bos" }),
                mode: "execute",
                confirmation: { confirmed: false },
                executionSubject: { entityType: "opportunity", entityId: "create-lead" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { runRegisteredAction: runSpy as never },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe("confirmation_required");
        expect(runSpy).not.toHaveBeenCalled();
    });

    it("BOS origin alone does not bypass confirmation when denied", async () => {
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({ commandKey: "confirm_tour", origin: "bos" }),
                mode: "execute",
                confirmation: { confirmed: false },
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { runRegisteredAction: runSpy as never },
        });
        expect(result.ok).toBe(false);
        expect(runSpy).not.toHaveBeenCalled();
    });

    it("maps RegisteredAction errors to operator-safe failures without leaking diagnostics", async () => {
        runSpy.mockResolvedValueOnce({
            ok: false,
            correlationId: "cid-err",
            status: 400,
            error: "Missing required field.",
            blockers: [{ code: "missing_input", message: "Missing required field." }],
        });
        const result = await executeCommandInvocation({
            request: {
                invocation: invocation({ commandKey: "create_lead" }),
                mode: "execute",
                executionSubject: { entityType: "opportunity", entityId: "create-lead" },
                invocationId: "inv-err",
            },
            server: { orgId: "org-1", userId: "user-1", supabase },
            deps: { runRegisteredAction: runSpy as never },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.delegated).toBe(true);
            expect(result.error.operatorMessage).toBe("Missing required field.");
            expect(result.error.operatorMessage).not.toMatch(/stack|registered_action_failed/i);
            expect(result.diagnostics.some((d) => d.code === "registered_action_failed")).toBe(true);
        }
    });

    it("keeps preparation safety switch false and enables RegisteredAction + Lead + Enrollment + Relationship exact keys", () => {
        expect(COMMAND_RUNTIME_EXECUTION_ENABLED).toBe(false);
        expect(COMMAND_RUNTIME_EXECUTION_BY_OWNER.registered_action).toBe(true);
        expect(COMMAND_RUNTIME_EXECUTION_BY_OWNER.mutation_runtime).toBe(false);
        expect(COMMAND_RUNTIME_EXECUTION_BY_OWNER.relationship_runtime).toBe(false);
        expect(COMMAND_RUNTIME_EXECUTION_BY_OWNER.tour_domain).toBe(false);
        for (const key of REGISTERED_ACTION_CAPABILITY_KEYS) {
            expect(isCommandRuntimeFacadeExecutionSupported(key)).toBe(true);
        }
        expect(isCommandRuntimeFacadeExecutionSupported("close_lead")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("update_lead_status")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("waitlist_child")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("enroll_child")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("update_child_enrollment_status")).toBe(
            true
        );
        expect(isCommandRuntimeFacadeExecutionSupported("add_parent_guardian")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("link_existing_person")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("add_emergency_contact")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("add_authorized_pickup")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("add_billing_contact")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("add_child")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("link_existing_child")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("make_primary_contact")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("delete_lead")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("add_family_member")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("mark_lost")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("move_to_waitlist")).toBe(true);
    });

    it("forbids facade execute modules from importing domain mutation / raw handler execute paths", () => {
        const files = [
            "lib/platform/commands/runtime/executeCommandInvocation.ts",
            "lib/platform/commands/runtime/adapters/registeredActionExecutionAdapter.ts",
        ];
        for (const rel of files) {
            const source = readFileSync(resolve(process.cwd(), rel), "utf8");
            expect(source).not.toMatch(/executeAdminAction/);
            expect(source).not.toMatch(/domainRegistry/);
            expect(source).not.toMatch(/tourBookingService/);
            // Direct Relationship Framework import belongs only in the relationship adapter.
            if (rel.includes("executeCommandInvocation")) {
                expect(source).not.toMatch(
                    /from\s+[\"']@\/lib\/admin\/relationship\/executeRelationshipAction[\"']/
                );
            }
            expect(source).not.toMatch(/from \"@\/lib\/supabase/);
            // Adapter must not call handler.execute directly — only runRegisteredAction.
            if (rel.includes("registeredActionExecutionAdapter")) {
                expect(source).not.toMatch(/registered\.execute\s*\(/);
                expect(source).not.toMatch(/action\.execute\s*\(/);
                expect(source).toContain("runRegisteredAction");
            }
        }
    });

    it("prepareCommandInvocation remains side-effect free when used alone", async () => {
        const { prepareCommandInvocation } = await import(
            "@/lib/platform/commands/runtime/prepareCommandInvocation"
        );
        const snap = prepareCommandInvocation(invocation({ commandKey: "create_lead" }));
        expect(snap.snapshot.runnable).toBe(true);
        expect(runSpy).not.toHaveBeenCalled();
    });
});
