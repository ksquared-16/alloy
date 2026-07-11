import { describe, expect, it } from "vitest";

import {
    resolveCanonicalWorkTemplateActionOptions,
    resolveCanonicalWorkTemplateAlternatePathOptions,
} from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";

describe("resolveCanonicalWorkTemplateActionOptions", () => {
    it("merges waitlist grain variants into one Move to Waitlist intent", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [
                    { action_key: "move_to_waitlist", recommendation: "recommended" },
                    { action_key: "waitlist_child", recommendation: "ready" },
                ],
            },
            stageDefinition: { journey_segment: "family" },
        });

        const waitlist = options.filter((row) => row.intentKey === "move_to_waitlist");
        expect(waitlist).toHaveLength(1);
        expect(waitlist[0]?.label).toBe("Move to Waitlist");
        expect(waitlist[0]?.ref).toBe("move_to_waitlist");
        expect(waitlist[0]?.aliases).toEqual(expect.arrayContaining(["waitlist_child", "move_to_waitlist"]));
    });

    it("persists intent ref regardless of stage journey segment", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [
                    { action_key: "move_to_waitlist", recommendation: "recommended" },
                    { action_key: "waitlist_child", recommendation: "ready" },
                ],
            },
            stageDefinition: { journey_segment: "child" },
        });

        const waitlist = options.find((row) => row.intentKey === "move_to_waitlist");
        expect(waitlist?.ref).toBe("move_to_waitlist");
        expect(waitlist?.label).toBe("Move to Waitlist");
        expect(options.some((row) => row.ref === "waitlist_child")).toBe(false);
    });

    it("hides generic status umbrella and mutation commands from editor options", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [
                    { action_key: "update_enrollment_status", recommendation: "ready" },
                    { action_key: "update_lead_status", recommendation: "ready" },
                    { action_key: "schedule_tour", recommendation: "recommended" },
                ],
            },
        });

        const refs = options.map((row) => row.ref);
        expect(refs).not.toContain("update_enrollment_status");
        expect(refs).not.toContain("update_lead_status");
        expect(refs).toContain("schedule_tour");
    });

    it("includes catalog-provided actions for non-enrollment fixtures", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [{ action_key: "record_payment", recommendation: "recommended" }],
            },
            processDefinition: { primary_entity: "opportunity" },
            stageDefinition: { journey_segment: "family" },
        });

        expect(options.map((row) => row.ref)).toContain("record_payment");
    });

    it("groups lifecycle actions for alternate paths without duplicate waitlist peers", () => {
        const options = resolveCanonicalWorkTemplateAlternatePathOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [
                    { action_key: "move_to_waitlist", recommendation: "recommended" },
                    { action_key: "waitlist_child", recommendation: "ready" },
                    { action_key: "close_lead", recommendation: "context_dependent" },
                ],
            },
            processTransitions: [{ key: "lead", label: "Lead" }, { key: "waitlist", label: "Waitlist" }],
            stageKey: "lead",
            stageDefinition: { journey_segment: "family" },
        });

        const waitlistActions = options.filter((row) => row.intentKey === "move_to_waitlist");
        expect(waitlistActions).toHaveLength(1);
        expect(options.some((row) => row.ref === "move_to_stage:waitlist")).toBe(true);
    });
});
