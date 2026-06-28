import { describe, expect, it } from "vitest";
import {
    actionRequiresRecord,
    isContextResolution,
    isLogicalActionPlacement,
    isRequiredSubject,
    logicalPlacementForPhysicalSurface,
    requiredSubjectForAction,
    resolveCommandContext,
    resolveCommandSubject,
    resolveContextResolution,
} from "@/lib/adminV2/actions/invocationContext";
import type { ActionEntityType, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";

function action(input: {
    requiredContext?: Partial<RegisteredAction["requiredContext"]>;
    supportedEntityTypes?: readonly ActionEntityType[];
}): RegisteredAction {
    return {
        actionKey: "test",
        defaultLabel: "Test",
        description: "",
        supportedEntityTypes: input.supportedEntityTypes ?? ["opportunity"],
        supportedProcessKeys: [],
        requiredContext: {
            requiresEntityId: false,
            requiresOpportunity: false,
            requiresCustomer: false,
            ...input.requiredContext,
        },
        audit: { eventType: "action_executed", category: "record", mutates: true },
        confirmationPolicy: "required",
        bosProposalSupport: true,
        validatePayload: () => ({ ok: true, value: {} }),
        resolveEligibility: async () => ({ eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] }),
        buildPreview: async () => ({ summary: "", changes: [], before: null, after: null }),
        execute: async () => ({ ok: true, correlationId: "c", result: { actionKey: "test", entityType: "opportunity", entityId: "", affectedId: null, detail: {} } }),
    };
}

const createLead = action({ requiredContext: { requiresEntityId: false, requiresOpportunity: false } });
const scheduleTour = action({ requiredContext: { requiresEntityId: true, requiresOpportunity: true } });
const childAction = action({ requiredContext: { requiresEntityId: true }, supportedEntityTypes: ["child"] });

describe("logical placement + enum guards", () => {
    it("maps physical surfaces to canonical logical placements", () => {
        expect(logicalPlacementForPhysicalSurface({ surface: "record_header" })).toBe("focus_panel_manage");
        expect(logicalPlacementForPhysicalSurface({ surface: "queue_row" })).toBe("queue_row_menu");
        expect(logicalPlacementForPhysicalSurface({ surface: "work_unit" })).toBe("work_unit_actions");
        expect(logicalPlacementForPhysicalSurface({ surface: "right_rail" })).toBe("work_unit_actions");
    });

    it("recognizes placements, context resolutions, required subjects", () => {
        expect(isLogicalActionPlacement("focus_panel_manage")).toBe(true);
        expect(isLogicalActionPlacement("legacy_drawer")).toBe(false);
        expect(isContextResolution("current_record")).toBe(true);
        expect(isContextResolution("record_inherited")).toBe(false);
        expect(isRequiredSubject("opportunity")).toBe(true);
        expect(isRequiredSubject("nope")).toBe(false);
    });
});

describe("required subject derivation", () => {
    it("create-style commands require no subject", () => {
        expect(actionRequiresRecord(createLead)).toBe(false);
        expect(requiredSubjectForAction(createLead)).toBe("none");
    });
    it("record commands require their primary subject type", () => {
        expect(requiredSubjectForAction(scheduleTour)).toBe("opportunity");
        expect(requiredSubjectForAction(childAction)).toBe("child");
    });
});

describe("context resolution by placement", () => {
    it("no required subject → open", () => {
        expect(resolveContextResolution({ placement: "work_unit_actions", requiredSubject: "none" })).toBe("open");
    });
    it("focus panel + queue row inherit the current record", () => {
        expect(resolveContextResolution({ placement: "focus_panel_manage", requiredSubject: "opportunity" })).toBe("current_record");
        expect(resolveContextResolution({ placement: "queue_row_menu", requiredSubject: "opportunity" })).toBe("current_record");
    });
    it("work unit requires user selection; BOS proposes", () => {
        expect(resolveContextResolution({ placement: "work_unit_actions", requiredSubject: "opportunity" })).toBe("user_selection");
        expect(resolveContextResolution({ placement: "bos_recommendations", requiredSubject: "opportunity" })).toBe("bos_proposal");
    });
});

describe("subject resolution (no entityId-null mental model)", () => {
    it("open executes with no subject", () => {
        expect(resolveCommandSubject({ contextResolution: "open", requiredSubject: "none" })).toEqual({
            mode: "open",
            subjectId: null,
        });
    });

    it("current_record executes with the inherited subject; absent → needs subject", () => {
        expect(
            resolveCommandSubject({ contextResolution: "current_record", requiredSubject: "opportunity", inheritedSubjectId: "opp-1" }),
        ).toEqual({ mode: "execute", subjectId: "opp-1" });
        expect(
            resolveCommandSubject({ contextResolution: "current_record", requiredSubject: "opportunity", inheritedSubjectId: null }),
        ).toMatchObject({ mode: "needs_subject", resolution: "current_record", requiredSubject: "opportunity" });
    });

    it("user_selection never silently inherits — even with a suggested subject", () => {
        const out = resolveCommandSubject({
            contextResolution: "user_selection",
            requiredSubject: "opportunity",
            suggestedSubjectId: "opp-suggested",
        });
        expect(out).toEqual({
            mode: "needs_subject",
            resolution: "user_selection",
            requiredSubject: "opportunity",
            suggestedSubjectId: "opp-suggested",
        });
    });
});

describe("resolveCommandContext (shared contract)", () => {
    it("Work Unit action with no inherited subject but a required subject → needs_subject", () => {
        const out = resolveCommandContext({ action: scheduleTour, surface: "work_unit" });
        expect(out.placement).toBe("work_unit_actions");
        expect(out.requiredSubject).toBe("opportunity");
        expect(out.contextResolution).toBe("user_selection");
        expect(out.subject.mode).toBe("needs_subject");
    });

    it("Schedule Tour from Work Unit requires subject selection (suggested row not authoritative)", () => {
        const out = resolveCommandContext({ action: scheduleTour, surface: "work_unit", suggestedSubjectId: "opp-row" });
        expect(out.subject).toEqual({
            mode: "needs_subject",
            resolution: "user_selection",
            requiredSubject: "opportunity",
            suggestedSubjectId: "opp-row",
        });
    });

    it("Schedule Tour from Focus Panel Manage inherits the current record", () => {
        const out = resolveCommandContext({ action: scheduleTour, surface: "record_header", inheritedSubjectId: "opp-7" });
        expect(out.placement).toBe("focus_panel_manage");
        expect(out.contextResolution).toBe("current_record");
        expect(out.subject).toEqual({ mode: "execute", subjectId: "opp-7" });
    });

    it("Create Lead from Work Unit has no required subject → open", () => {
        const out = resolveCommandContext({ action: createLead, surface: "work_unit" });
        expect(out.requiredSubject).toBe("none");
        expect(out.contextResolution).toBe("open");
        expect(out.subject).toEqual({ mode: "open", subjectId: null });
    });

    it("Update Status from Work Unit does not silently inherit the selected row", () => {
        const updateStatus = scheduleTour; // same capability shape: opportunity + requires record
        const out = resolveCommandContext({ action: updateStatus, surface: "work_unit", suggestedSubjectId: "opp-highlighted" });
        expect(out.subject.mode).toBe("needs_subject");
    });

    it("Update Status from Focus Panel Manage inherits the current record", () => {
        const out = resolveCommandContext({ action: scheduleTour, surface: "record_header", inheritedSubjectId: "opp-status" });
        expect(out.subject).toEqual({ mode: "execute", subjectId: "opp-status" });
    });
});
