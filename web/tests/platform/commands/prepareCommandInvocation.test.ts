import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getRegisteredAction, listRegisteredActionKeys } from "@/lib/adminV2/actions/actionRegistry";
import { processingCapabilityKey } from "@/lib/platform/commands/capabilityRegistry";
import {
    COMMAND_RUNTIME_EXECUTION_ENABLED,
    prepareCommandInvocation,
} from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";

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

describe("prepareCommandInvocation (P1.S1)", () => {
    it("resolves canonical keys and aliases to one capability", () => {
        const direct = prepareCommandInvocation(baseRequest({ commandKey: "close_lead" }));
        const alias = prepareCommandInvocation(baseRequest({ commandKey: "mark_lost" }));
        expect(direct.ok).toBe(true);
        expect(alias.ok).toBe(true);
        if (direct.ok && alias.ok) {
            expect(direct.snapshot.canonicalCapabilityKey).toBe("close_lead");
            expect(alias.snapshot.canonicalCapabilityKey).toBe("close_lead");
            expect(alias.snapshot.requestedKey).toBe("mark_lost");
        }
    });

    it("returns unavailable for unknown keys without executing", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "totally_unknown_xyz" }));
        expect(result.ok).toBe(false);
        expect(result.snapshot.runnable).toBe(false);
        expect(result.snapshot.currentLifecycleStage).toBe("unavailable");
        expect(result.snapshot.nextLifecycleStage).toBeNull();
        expect(result.snapshot.executionDestination.owner).toBe("none");
    });

    it("blocks placeholders from preview/confirm/execute", () => {
        const result = prepareCommandInvocation(
            baseRequest({ commandKey: "send_message_placeholder" })
        );
        expect(result.snapshot.maturity).toBe("placeholder");
        expect(result.snapshot.runnable).toBe(false);
        expect(result.snapshot.nextLifecycleStage).toBeNull();
        expect(["preview", "confirm", "execute"]).not.toContain(result.snapshot.nextLifecycleStage);
    });

    it("keeps processing-only internal and non-organization-catalog", () => {
        const key = processingCapabilityKey("create_lead");
        const result = prepareCommandInvocation(baseRequest({ commandKey: key }));
        expect(result.snapshot.maturity).toBe("processing_only");
        expect(result.snapshot.catalogVisibility).toBe("hidden");
        expect(result.snapshot.executionOwner).toBe("processing_identity");
        expect(result.snapshot.runnable).toBe(true); // classified runnable internally but not org catalog
        expect(result.snapshot.catalogVisibility).not.toBe("organization_command_catalog");
    });

    it("resolves navigation-only without mutation destination", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "open_record" }));
        expect(result.ok).toBe(true);
        expect(result.snapshot.maturity).toBe("navigation_only");
        expect(result.snapshot.executionDestination.owner).toBe("navigation");
        expect(result.snapshot.executionDestination.executableViaFacadeLater).toBe(false);
    });

    it("prepares all RegisteredActions without calling execute", () => {
        for (const key of listRegisteredActionKeys()) {
            const action = getRegisteredAction(key);
            expect(action).not.toBeNull();
            const executeSpy = vi.spyOn(action!, "execute").mockImplementation(async () => {
                throw new Error("execute must not be called during preparation");
            });
            const eligibilitySpy = vi.spyOn(action!, "resolveEligibility");
            const previewSpy = vi.spyOn(action!, "buildPreview");

            const result = prepareCommandInvocation(
                baseRequest({
                    commandKey: key,
                    providedSubject:
                        key === "create_lead"
                            ? null
                            : { entityType: "opportunity", entityId: "opp-1" },
                })
            );
            expect(result.snapshot.executionOwner).toBe("registered_action");
            expect(result.snapshot.executionDestination.owner).toBe("registered_action");
            expect(executeSpy).not.toHaveBeenCalled();
            expect(eligibilitySpy).not.toHaveBeenCalled();
            expect(previewSpy).not.toHaveBeenCalled();
            executeSpy.mockRestore();
            eligibilitySpy.mockRestore();
            previewSpy.mockRestore();
        }
    });

    it("preserves RegisteredAction confirmation and preview honesty via adapter", () => {
        const snap = prepareCommandInvocation(baseRequest({ commandKey: "create_lead" })).snapshot;
        expect(snap.supportsPreview).toBe(true);
        expect(snap.confirmationPolicy).toBe("confirm");
        expect(snap.nextLifecycleStage).toBe("preview");
        expect(COMMAND_RUNTIME_EXECUTION_ENABLED).toBe(false);

        const confirmTour = prepareCommandInvocation(
            baseRequest({
                commandKey: "confirm_tour",
                providedSubject: { entityType: "opportunity", entityId: "opp-1" },
            })
        ).snapshot;
        expect(confirmTour.confirmationPolicy).toBe("confirm");
        expect(confirmTour.supportsPreview).toBe(true);
        expect(confirmTour.executionDestination.owner).toBe("registered_action");
    });

    it("delegates Mutation / Relationship / Tour owners without executing", () => {
        const mutation = prepareCommandInvocation(
            baseRequest({
                commandKey: "close_lead",
                providedSubject: { entityType: "opportunity", entityId: "opp-1" },
            })
        );
        expect(mutation.snapshot.executionDestination.owner).toBe("mutation_runtime");
        expect(mutation.snapshot.eligibilityState).toEqual({
            status: "delegated",
            owner: "mutation_runtime",
        });

        const relationship = prepareCommandInvocation(
            baseRequest({
                commandKey: "add_parent_guardian",
                providedSubject: { entityType: "child", entityId: "child-1" },
            })
        );
        expect(relationship.snapshot.executionDestination.owner).toBe("relationship_runtime");

        const tour = prepareCommandInvocation(
            baseRequest({
                commandKey: "cancel_tour",
                providedSubject: { entityType: "opportunity", entityId: "opp-1" },
            })
        );
        expect(tour.snapshot.executionDestination.owner).toBe("tour_domain");
    });

    it("blocks reopen_tour from preview/confirm", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "reopen_tour" }));
        expect(result.snapshot.maturity).toBe("unavailable");
        expect(result.snapshot.runnable).toBe(false);
        expect(result.snapshot.currentLifecycleStage).toBe("unavailable");
        expect(result.snapshot.nextLifecycleStage).toBeNull();
    });

    it("resolves Focus Panel subject authoritatively when compatible", () => {
        const result = prepareCommandInvocation(
            baseRequest({
                commandKey: "update_status",
                operationalContext: "focus_panel",
                surface: "record_header",
                providedSubject: { entityType: "opportunity", entityId: "opp-99" },
            })
        );
        expect(result.snapshot.subjectState).toEqual({
            status: "resolved",
            subjectId: "opp-99",
            entityType: "opportunity",
        });
        expect(result.snapshot.currentLifecycleStage).not.toBe("resolve_subject");
    });

    it("requires subject selection for Work Unit open context", () => {
        const result = prepareCommandInvocation(
            baseRequest({
                commandKey: "update_status",
                operationalContext: "work_unit",
                surface: "work_unit",
                workUnitId: "wu-1",
                providedSubject: null,
                suggestedSubject: { entityType: "opportunity", entityId: "opp-suggested" },
            })
        );
        expect(result.snapshot.currentLifecycleStage).toBe("resolve_subject");
        expect(result.snapshot.nextLifecycleStage).toBe("resolve_subject");
        expect(result.snapshot.subjectState.status).toBe("suggested");
        if (result.snapshot.subjectState.status === "suggested") {
            expect(result.snapshot.subjectState.authoritative).toBe(false);
        }
    });

    it("marks suggested subjects as non-authoritative even when provided on selection surfaces", () => {
        const result = prepareCommandInvocation(
            baseRequest({
                commandKey: "close_lead",
                operationalContext: "work_unit",
                surface: "work_unit",
                workUnitId: "wu-1",
                providedSubject: { entityType: "opportunity", entityId: "opp-1" },
            })
        );
        expect(result.snapshot.subjectState.status).toBe("suggested");
    });

    it("returns incompatible subject state for wrong entity type", () => {
        const result = prepareCommandInvocation(
            baseRequest({
                commandKey: "update_status",
                operationalContext: "focus_panel",
                surface: "record_header",
                providedSubject: { entityType: "person", entityId: "p-1" },
            })
        );
        expect(result.ok).toBe(false);
        expect(result.snapshot.subjectState.status).toBe("incompatible");
        expect(result.snapshot.blockers.some((b) => b.code === "subject_incompatible")).toBe(true);
    });

    it("skips subject resolution for no-subject commands", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "create_lead" }));
        expect(result.snapshot.subjectState.status).toBe("none_required");
        expect(result.snapshot.subjectContract.kind).toBe("none");
    });

    it("does not treat availability/catalog visibility as authorization", () => {
        const result = prepareCommandInvocation(
            baseRequest({
                commandKey: "create_lead",
            })
        );
        expect(result.snapshot.authorizationEvaluated).toBe(false);
        expect(result.snapshot.authorizationGranted).toBeNull();
        expect(result.snapshot.catalogVisibility).toBe("organization_command_catalog");
    });

    it("does not let BOS origin skip confirmation when policy requires it", () => {
        const result = prepareCommandInvocation(
            baseRequest({
                commandKey: "create_lead",
                origin: "bos",
            })
        );
        expect(result.snapshot.confirmationPolicy).toBe("confirm");
        expect(result.snapshot.nextLifecycleStage).not.toBe("execute");
    });

    it("keeps operatorSafe free of diagnostic codes", () => {
        const result = prepareCommandInvocation(baseRequest({ commandKey: "create_lead" }));
        for (const d of result.snapshot.diagnostics) {
            expect(result.snapshot.operatorSafe.statusMessage.includes(d.code)).toBe(false);
        }
    });

    it("forbids facade prepare module from importing mutation executors", () => {
        const facadePath = resolve(
            process.cwd(),
            "lib/platform/commands/runtime/prepareCommandInvocation.ts"
        );
        const source = readFileSync(facadePath, "utf8");
        expect(source).not.toMatch(/executeAdminAction/);
        expect(source).not.toMatch(/actionExecutor/);
        expect(source).not.toMatch(/domainRegistry/);
        expect(source).not.toMatch(/tourBookingService/);
        expect(source).not.toMatch(/executeRelationshipAction/);
        expect(source).not.toMatch(/from \"@\/lib\/supabase/);
    });

    it("fails invariants when execution destination mismatches capability owner", async () => {
        const { assertCommandSnapshotInvariants } = await import(
            "@/lib/platform/commands/runtime/commandRuntimeInvariants"
        );
        const { getPlatformCapability } = await import(
            "@/lib/platform/commands/capabilityRegistry"
        );
        const capability = getPlatformCapability("close_lead");
        expect(capability).not.toBeNull();
        const good = prepareCommandInvocation(
            baseRequest({
                commandKey: "close_lead",
                providedSubject: { entityType: "opportunity", entityId: "opp-1" },
            })
        ).snapshot;
        const bad = {
            ...good,
            executionDestination: {
                owner: "registered_action" as const,
                label: "wrong",
                executableViaFacadeLater: true,
            },
        };
        expect(() => assertCommandSnapshotInvariants(bad, capability)).toThrow(/executionDestination/);
    });
});
