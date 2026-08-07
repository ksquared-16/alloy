import { describe, expect, it } from "vitest";

import {
    resolveCanonicalWorkTemplateActionOptions,
    resolveCanonicalWorkTemplateAlternatePathOptions,
} from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";

describe("resolveCanonicalWorkTemplateActionOptions", () => {
    it("promotes enabled waitlist_child alias into Move to Waitlist intent", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [
                {
                    key: "waitlist_child",
                    label: "Waitlist Child",
                    action_scope: "lifecycle",
                    placements: [{ placement_id: "p1", surface_label: "x", placement_label: "y", is_active: true }],
                    operator_stages: [],
                    action_definition_id: "d1",
                    base_action_label: "Waitlist Child",
                    display_order: 1,
                },
            ],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [],
            },
            stageDefinition: { journey_segment: "family" },
        });

        const waitlist = options.filter((row) => row.intentKey === "move_to_waitlist");
        expect(waitlist).toHaveLength(1);
        expect(waitlist[0]?.ref).toBe("move_to_waitlist");
        expect(waitlist[0]?.label).toBe("Move to Waitlist");
        expect(options.some((row) => row.ref === "waitlist_child")).toBe(false);
    });

    it("keeps schedule_tour when waitlist alias promotion runs", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [
                    { action_key: "waitlist_child", recommendation: "ready" },
                    { action_key: "schedule_tour", recommendation: "recommended" },
                ],
            },
            stageDefinition: { journey_segment: "family" },
        });

        expect(options.map((row) => row.ref)).toEqual(
            expect.arrayContaining(["move_to_waitlist", "schedule_tour"]),
        );
        expect(options.filter((row) => row.intentKey === "move_to_waitlist")).toHaveLength(1);
    });

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

    it("groups configured transitions for alternate paths without inventing waitlist peers", () => {
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
            stageOperatingPlan: {
                version: 1,
                lifecycle_key: "enrollment",
                stage_key: "lead",
                journey_segment: "family",
                work_templates: [],
                outcomes: [],
                outcome_rules: [],
                outgoing_transitions: [
                    {
                        transition_ref: "move_to_stage:waitlist",
                        source_stage_key: "lead",
                        target_stage_key: "waitlist",
                        label: "Move to Waitlist",
                        available: true,
                    },
                ],
            } as never,
        });

        // Alternate paths are stage transitions only — command intents belong on Helpful Actions.
        expect(options.some((row) => row.intentKey === "move_to_waitlist")).toBe(false);
        expect(options.some((row) => row.ref === "move_to_stage:waitlist")).toBe(true);
    });

    it("does not gate to nothing when a legacy process derives an empty selection", () => {
        // A process with no command_set_v1 and no stage action catalog derives an EMPTY legacy
        // selection. Treating that as "the operator selected no Commands" emptied the work-item
        // action picker entirely, leaving the work item unconfigurable in the product.
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [{ action_key: "schedule_tour", recommendation: "ready" }],
            },
            stageDefinition: { journey_segment: "family" },
            process: { id: "proc-1", key: "enrollment", stages: [] } as never,
        });

        expect(options.some((row) => row.ref === "schedule_tour")).toBe(true);
    });

    it("still honors an explicit empty command_set_v1 selection", () => {
        // An operator who explicitly selected no Commands is a real answer and must be respected.
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: {
                version: 1,
                candidate_actions: [{ action_key: "schedule_tour", recommendation: "ready" }],
            },
            stageDefinition: { journey_segment: "family" },
            process: {
                id: "proc-1",
                key: "enrollment",
                stages: [],
                command_set_v1: { version: 1, commands: [] },
            } as never,
        });

        expect(options).toHaveLength(0);
    });
});
