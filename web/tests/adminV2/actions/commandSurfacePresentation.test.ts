import { describe, expect, it } from "vitest";
import {
    deriveCreateLeadCommandFromBosProposal,
    deriveCreateLeadCommandState,
} from "@/lib/adminV2/actions/createLead/createLeadCommandModel";
import { deriveCreateLeadSurfaceState } from "@/lib/adminV2/actions/surface/commandSurfaceModel";
import {
    commandSurfaceSectionCaption,
    commandSurfaceStageCaption,
    isConfirmAction,
    isOperatorSafeCopy,
    operatorFacingStrings,
} from "@/lib/adminV2/actions/surface/commandSurfacePresentation";
import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";

const complete = { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };

describe("command surface presentation contract", () => {
    it("renders a step caption from the stage indicator", () => {
        const surface = deriveCreateLeadSurfaceState(
            deriveCreateLeadCommandState({ knownInputs: {}, entryPoint: "work_unit_actions" })
        );
        expect(commandSurfaceStageCaption(surface)).toMatch(/^Step \d of \d · /);
    });

    it("uses operator section captions, never runtime enums", () => {
        expect(commandSurfaceSectionCaption("input_fields")).toBe("Add the required information");
        expect(commandSurfaceSectionCaption("confirmation")).toBe("Review and confirm");
        expect(isOperatorSafeCopy(commandSurfaceSectionCaption("input_fields"))).toBe(true);
    });

    it("flags a complete BOS proposal as a confirm action", () => {
        const surface = deriveCreateLeadSurfaceState(deriveCreateLeadCommandFromBosProposal({ parsedValues: complete }));
        expect(isConfirmAction(surface)).toBe(true);
    });

    it("guards against snake_case and runtime-enum leaks", () => {
        expect(isOperatorSafeCopy("Add the required information")).toBe(true);
        expect(isOperatorSafeCopy("first_name")).toBe(false);
        expect(isOperatorSafeCopy("create_lead")).toBe(false);
        expect(isOperatorSafeCopy("needs_required_input")).toBe(false);
    });

    it("every operator-facing string is safe across Create Lead states", () => {
        const states = [
            deriveCreateLeadSurfaceState(deriveCreateLeadCommandState({ knownInputs: {}, entryPoint: "work_unit_actions" })),
            deriveCreateLeadSurfaceState(deriveCreateLeadCommandFromBosProposal({ parsedValues: { first_name: "Ada" } })),
            deriveCreateLeadSurfaceState(deriveCreateLeadCommandFromBosProposal({ parsedValues: complete })),
        ];
        for (const state of states) {
            for (const copy of operatorFacingStrings(state)) {
                expect(isOperatorSafeCopy(copy), `unsafe copy: "${copy}"`).toBe(true);
            }
        }
    });

    it("success state caption collapses to the terminal label", () => {
        const okResult: ActionResultOk = {
            ok: true,
            correlationId: "c1",
            result: {
                actionKey: "create_lead",
                entityType: "opportunity",
                entityId: "opp-1",
                affectedId: "opp-1",
                detail: { kind: "create_lead", opportunity_id: "opp-1" },
            },
        };
        const surface = deriveCreateLeadSurfaceState(
            deriveCreateLeadCommandState({ knownInputs: complete, entryPoint: "manual", phase: "success", result: okResult })
        );
        expect(commandSurfaceStageCaption(surface)).not.toMatch(/Step/);
        for (const copy of operatorFacingStrings(surface)) {
            expect(isOperatorSafeCopy(copy)).toBe(true);
        }
    });
});
