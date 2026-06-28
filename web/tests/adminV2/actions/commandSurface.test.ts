import { describe, expect, it } from "vitest";
import {
    deriveCreateLeadCommandFromBosProposal,
    deriveCreateLeadCommandState,
} from "@/lib/adminV2/actions/createLead/createLeadCommandModel";
import {
    commandSurfaceVariantForPlacement,
    deriveCommandSurfaceStateFromSnapshot,
    deriveCreateLeadSurfaceState,
    type GenericCommandSnapshot,
} from "@/lib/adminV2/actions/surface/commandSurfaceModel";
import { deriveCommandSurfaceState, humanizeFieldKey } from "@/lib/adminV2/actions/surface/deriveCommandSurfaceState";
import type { CommandSurfaceInput } from "@/lib/adminV2/actions/surface/commandSurfaceTypes";
import { buildCommandFlow } from "@/lib/adminV2/actions/commandFlow";
import { resolveCommandContext } from "@/lib/adminV2/actions/invocationContext";
import { updateStatusAction } from "@/lib/adminV2/actions/definitions/updateStatusAction";
import type { ActionResultOk, ActionEligibility } from "@/lib/adminV2/actions/actionTypes";

const complete = { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };

describe("Command Surface — Create Lead reference", () => {
    it("derives stable input-fields state from a Work Unit missing-input snapshot", () => {
        const snap = deriveCreateLeadCommandState({ knownInputs: {}, entryPoint: "work_unit_actions" });
        const surface = deriveCreateLeadSurfaceState(snap);
        expect(surface.variant).toBe("work_unit");
        expect(surface.section).toBe("input_fields");
        expect(surface.header.title).toBe("Create Lead");
        expect(surface.header.stage?.label).toBe("Details");
        expect(surface.footer.primary.enabled).toBe(false);
        expect(surface.body.missingInputs.length).toBeGreaterThan(0);
        // No subject stage for capture-first create lead.
        expect(surface.body.missingSubject).toBeNull();
    });

    it("derives a preview/confirmation state from a complete BOS proposal", () => {
        const snap = deriveCreateLeadCommandFromBosProposal({ parsedValues: complete });
        const surface = deriveCreateLeadSurfaceState(snap);
        expect(surface.variant).toBe("bos");
        expect(surface.section).toBe("confirmation");
        expect(surface.footer.primary.kind).toBe("execute");
        expect(surface.footer.primary.enabled).toBe(true);
        expect(surface.body.confirmationSummary?.length).toBeGreaterThan(0);
    });

    it("derives a success target from a Create Lead result", () => {
        const okResult: ActionResultOk = {
            ok: true,
            correlationId: "c1",
            result: {
                actionKey: "create_lead",
                entityType: "opportunity",
                entityId: "opp-9",
                affectedId: "opp-9",
                detail: { kind: "create_lead", opportunity_id: "opp-9" },
            },
        };
        const snap = deriveCreateLeadCommandState({
            knownInputs: complete,
            entryPoint: "manual",
            phase: "success",
            result: okResult,
        });
        const surface = deriveCreateLeadSurfaceState(snap);
        expect(surface.section).toBe("success");
        expect(surface.success?.openRecord).toEqual({ entityType: "opportunity", entityId: "opp-9" });
        expect(surface.success?.refreshTargets).toEqual([{ entityType: "opportunity", entityId: "opp-9" }]);
        expect(surface.footer.primary.kind).toBe("open_record");
    });

    it("Work Unit and BOS Create Lead produce compatible surface snapshots", () => {
        const wu = deriveCreateLeadSurfaceState(
            deriveCreateLeadCommandState({ knownInputs: complete, entryPoint: "work_unit_actions" })
        );
        const bos = deriveCreateLeadSurfaceState(deriveCreateLeadCommandFromBosProposal({ parsedValues: complete }));
        // Same shell anatomy + section; only the variant (entry point) differs.
        expect(wu.section).toBe(bos.section);
        expect(wu.header.title).toBe(bos.header.title);
        expect(wu.footer.primary.kind).toBe(bos.footer.primary.kind);
        expect(wu.variant).not.toBe(bos.variant);
    });

    it("converts raw field keys to operator copy (never leaks payload keys)", () => {
        const snap = deriveCreateLeadCommandState({ knownInputs: {}, entryPoint: "work_unit_actions" });
        const surface = deriveCreateLeadSurfaceState(snap);
        for (const mi of surface.body.missingInputs) {
            expect(mi.label).not.toMatch(/_/); // no snake_case leaks
        }
        expect(humanizeFieldKey("desired_start_date")).toBe("Desired Start Date");
    });

    it("exposes raw payload keys only in debug mode", () => {
        const snap = deriveCreateLeadCommandState({ knownInputs: complete, entryPoint: "manual" });
        expect(deriveCreateLeadSurfaceState(snap).debug).toBeUndefined();
        const dbg = deriveCreateLeadSurfaceState(snap, { debug: true });
        expect(dbg.debug?.rawPayloadKeys).toContain("first_name");
    });
});

describe("Command Surface — config boundary", () => {
    function baseSnapshot(): GenericCommandSnapshot {
        const snap = deriveCreateLeadCommandState({ knownInputs: {}, entryPoint: "work_unit_actions" });
        return snap;
    }

    it("config can override content (title/description/confirm/blocker) only", () => {
        const surface = deriveCommandSurfaceStateFromSnapshot(
            baseSnapshot(),
            {},
            { titleOverride: "Add a family", descriptionOverride: "Start a new enrollment" }
        );
        expect(surface.header.title).toBe("Add a family");
        expect(surface.header.description).toBe("Start a new enrollment");
    });

    it("config cannot alter platform-owned anatomy (section, stage order, footer pattern)", () => {
        const snap = baseSnapshot();
        const platform = deriveCommandSurfaceStateFromSnapshot(snap);
        const withConfig = deriveCommandSurfaceStateFromSnapshot(
            snap,
            {},
            { titleOverride: "X", descriptionOverride: "Y", confirmLabelOverride: "Z" }
        );
        // Anatomy is identical regardless of config content overrides.
        expect(withConfig.section).toBe(platform.section);
        expect(withConfig.footer.primary.kind).toBe(platform.footer.primary.kind);
        expect(withConfig.footer.primary.enabled).toBe(platform.footer.primary.enabled);
        expect(withConfig.header.stage).toEqual(platform.header.stage);
        expect(withConfig.body.missingInputs).toEqual(platform.body.missingInputs);
    });
});

describe("Command Surface — Update Status (second command, same model)", () => {
    const validTransition: ActionEligibility = {
        eligible: true,
        blockers: [],
        availableTransitions: [{ key: "qualification", label: "Qualification" }],
        requiredInputs: [{ key: "status_key", label: "Target status", type: "status", required: true }],
    };
    const invalidTransition: ActionEligibility = {
        eligible: false,
        blockers: [{ code: "invalid_transition", message: "This record cannot move to Enrolled yet." }],
        availableTransitions: [],
        requiredInputs: [],
    };

    function updateStatusSnapshot(eligibility: ActionEligibility): GenericCommandSnapshot {
        const ctx = resolveCommandContext({
            action: updateStatusAction,
            surface: "record_header",
            inheritedSubjectId: "opp-1",
        });
        const flow = buildCommandFlow({
            requiredSubject: ctx.requiredSubject,
            subject: ctx.subject,
            eligibility,
            confirmationPolicy: updateStatusAction.confirmationPolicy,
            commandLabel: "Update status",
        });
        return {
            actionKey: updateStatusAction.actionKey,
            context: { placement: ctx.placement, requiredSubject: ctx.requiredSubject },
            flow,
            state: flow.state,
            message: flow.message,
            missingInputs: eligibility.blockers.filter((b) => b.code === "missing_required_input" || Boolean(b.field)),
            preview: { summary: "New Inquiry → Qualification", changes: ["Status: New Inquiry → Qualification"], before: null, after: null },
            success: null,
        };
    }

    it("Focus Panel Manage Update Status renders in the same shell with current record subject", () => {
        const surface = deriveCommandSurfaceStateFromSnapshot(updateStatusSnapshot(validTransition));
        expect(surface.variant).toBe("focus_panel_manage");
        expect(surface.section).toBe("confirmation");
        expect(surface.body.missingSubject).toBeNull();
        expect(surface.footer.primary.kind).toBe("execute");
    });

    it("invalid transition renders the blocker section", () => {
        const surface = deriveCommandSurfaceStateFromSnapshot(updateStatusSnapshot(invalidTransition));
        expect(surface.section).toBe("blocker");
        expect(surface.body.blockerCopy).toMatch(/cannot move to Enrolled/i);
        expect(surface.footer.primary.enabled).toBe(false);
    });
});

describe("Command Surface — variant mapping", () => {
    it("maps logical placements to surface variants", () => {
        expect(commandSurfaceVariantForPlacement("work_unit_actions")).toBe("work_unit");
        expect(commandSurfaceVariantForPlacement("focus_panel_manage")).toBe("focus_panel_manage");
        expect(commandSurfaceVariantForPlacement("queue_row_menu")).toBe("queue_row");
        expect(commandSurfaceVariantForPlacement("bos_recommendations")).toBe("bos");
    });

    it("derives a needs-subject prompt for a Work Unit command requiring a record", () => {
        const input: CommandSurfaceInput = {
            intentTitle: "Update Status",
            intentDescription: "Move a record forward.",
            variant: "work_unit",
            placement: "work_unit_actions",
            requiredSubject: "opportunity",
            state: "needs_subject",
            flow: buildCommandFlow({
                requiredSubject: "opportunity",
                subject: { mode: "needs_subject", resolution: "user_selection", requiredSubject: "opportunity", suggestedSubjectId: null },
                eligibility: { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] },
                commandLabel: "Update status",
            }),
            message: "Choose a record to continue.",
        };
        const surface = deriveCommandSurfaceState(input);
        expect(surface.section).toBe("subject_selector");
        expect(surface.body.missingSubject).toMatch(/Choose a record/i);
    });
});
