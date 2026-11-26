/**
 * Stage commands — one ordered list per stage, the Process Card's command row.
 *
 * Guards the model (stage-owned, not work-owned), the read-time migration from legacy work-item
 * commands, and every place the list has to survive: parse, the editor's persist path, publish
 * validation, and live placement over a pinned revision.
 */

import { describe, expect, it } from "vitest";

import { overlayLiveCommandPlacementOntoPinnedRevision } from "@/lib/lifecycle/liveCommandPlacement";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { deriveStageCommandsFromWorkTemplates, resolveStageCommands } from "@/lib/lifecycle/stageCommands";
import {
    stageOperatingPlanDraftDirty,
    stageOperatingPlanDraftFromSaved,
    stageOperatingPlanDraftToPersisted,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import {
    parseStageOperatingPlanV1,
    type StageOperatingPlanV1,
    type StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { validateProcessCommandSetsForPublish } from "@/lib/lifecycle/validateProcessCommandSetsForPublish";

function template(key: string, extra: Partial<StageWorkTemplateV1> = {}): StageWorkTemplateV1 {
    return {
        template_key: key,
        label: key,
        required: false,
        due_policy: { kind: "same_day" },
        owner_strategy: "record_owner",
        ...extra,
    };
}

function plan(extra: Partial<StageOperatingPlanV1> = {}): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "lead",
        journey_segment: "family",
        work_templates: [],
        outcomes: [],
        outcome_rules: [],
        attention_rules: [],
        ...extra,
    };
}

const LEGACY_TEMPLATES = [
    template("follow_up", { helpful_actions: [{ action_ref: "send_form" }, { action_ref: "schedule_tour" }] }),
    template("contact_family", {
        primary: true,
        primary_action: { action_ref: "quick_message", override_label: "Contact Family" },
        helpful_actions: [{ action_ref: "schedule_tour" }],
    }),
];

describe("resolveStageCommands", () => {
    it("derives a legacy plan's list from EVERY work item — primary item first, primary command first, de-duplicated", () => {
        expect(deriveStageCommandsFromWorkTemplates(LEGACY_TEMPLATES)).toEqual([
            { action_ref: "quick_message", override_label: "Contact Family" },
            { action_ref: "schedule_tour" },
            { action_ref: "send_form" },
        ]);
        expect(resolveStageCommands(plan({ work_templates: LEGACY_TEMPLATES })).source).toBe("derived_from_work_items");
    });

    it("an authored list wins over work-item commands, in its own order", () => {
        const resolved = resolveStageCommands(
            plan({
                work_templates: LEGACY_TEMPLATES,
                stage_commands: [{ action_ref: "send_form" }, { action_ref: "add_child" }],
            }),
        );
        expect(resolved.source).toBe("stage");
        expect(resolved.commands.map((c) => c.action_ref)).toEqual(["send_form", "add_child"]);
    });

    it("an explicitly empty list means none — it never falls back to the work items", () => {
        const resolved = resolveStageCommands(plan({ work_templates: LEGACY_TEMPLATES, stage_commands: [] }));
        expect(resolved).toEqual({ commands: [], source: "stage" });
    });
});

describe("stage_commands survives storage and the editor", () => {
    it("parses, and is absent (not empty) on a plan that never had it", () => {
        const parsed = parseStageOperatingPlanV1(plan({ stage_commands: [{ action_ref: "send_form", override_label: "Send packet" }] }));
        expect(parsed?.stage_commands).toEqual([{ action_ref: "send_form", override_label: "Send packet" }]);
        expect(parseStageOperatingPlanV1(plan())?.stage_commands).toBeUndefined();
    });

    it("round-trips through the editor draft, and a legacy plan does not read as dirty on load", () => {
        const authored = plan({ stage_commands: [{ action_ref: "schedule_tour" }] });
        const draft = stageOperatingPlanDraftFromSaved(authored, "lead");
        expect(stageOperatingPlanDraftToPersisted(draft, "lead", "enrollment", { validate: false })?.stage_commands).toEqual([
            { action_ref: "schedule_tour" },
        ]);

        const legacy = plan({ work_templates: LEGACY_TEMPLATES });
        expect(stageOperatingPlanDraftDirty(legacy, stageOperatingPlanDraftFromSaved(legacy, "lead"), "lead")).toBe(false);
        const edited = { ...stageOperatingPlanDraftFromSaved(legacy, "lead"), stage_commands: [] };
        expect(stageOperatingPlanDraftDirty(legacy, edited, "lead")).toBe(true);
    });
});

describe("publish validation reads the stage's commands", () => {
    function builder(stagePlan: StageOperatingPlanV1): LifecycleBuilderV1 {
        return {
            version: 1,
            processes: [
                {
                    id: "p",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    command_set_v1: { version: 1, commands: [{ capability_key: "schedule_tour", enabled: true }] },
                    stages: [{ id: "s", key: "lead", label: "Lead", sort_order: 0, is_active: true, stage_operating_plan_v1: stagePlan }],
                },
            ],
        } as unknown as LifecycleBuilderV1;
    }

    it("refuses an authored stage command the Commands tab has not enabled", () => {
        const result = validateProcessCommandSetsForPublish(
            builder(plan({ stage_commands: [{ action_ref: "schedule_tour" }, { action_ref: "send_form" }] })),
        );
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.issues.map((i) => [i.code, i.capabilityKey])).toEqual([["stage_command_orphan", "send_form"]]);
    });

    it("ignores stale work-item commands once the stage authors its own list", () => {
        const result = validateProcessCommandSetsForPublish(
            builder(plan({ work_templates: LEGACY_TEMPLATES, stage_commands: [{ action_ref: "schedule_tour" }] })),
        );
        expect(result.ok).toBe(true);
    });
});

describe("live placement carries the stage's commands onto a pinned revision", () => {
    function payload(stagePlan: Record<string, unknown>) {
        return {
            version: 1,
            active_process_id: "p",
            processes: [
                {
                    id: "p",
                    key: "enrollment",
                    name: "Enrollment",
                    is_active: true,
                    sort_order: 0,
                    stages: [{ id: "s", key: "lead", label: "Lead", is_active: true, sort_order: 0, stage_operating_plan_v1: stagePlan }],
                },
            ],
        };
    }
    function stageCommandsOf(out: Record<string, unknown>) {
        const process = (out.processes as Array<Record<string, unknown>>)[0]!;
        const stage = (process.stages as Array<Record<string, unknown>>)[0]!;
        return (stage.stage_operating_plan_v1 as { stage_commands?: Array<{ action_ref: string }> }).stage_commands;
    }

    it("a list authored after the instance pinned its revision takes effect", () => {
        const pinned = payload(plan({ work_templates: LEGACY_TEMPLATES }) as unknown as Record<string, unknown>);
        const live = payload(plan({ work_templates: LEGACY_TEMPLATES, stage_commands: [{ action_ref: "add_child" }] }) as unknown as Record<string, unknown>);
        const out = overlayLiveCommandPlacementOntoPinnedRevision({
            pinnedBuilderPayload: pinned,
            liveDepartmentMetadata: { lifecycle_builder_v1: live },
            stageKey: "lead",
        });
        expect(out.placement.source).toBe("live_published");
        expect(stageCommandsOf(out.payload)?.map((c) => c.action_ref)).toEqual(["add_child"]);
        expect(resolveStageCommands(parseStageOperatingPlanV1(
            ((out.payload.processes as Array<Record<string, unknown>>)[0]!.stages as Array<Record<string, unknown>>)[0]!.stage_operating_plan_v1,
        )).commands.map((c) => c.action_ref)).toEqual(["add_child"]);
    });
});

describe("Manage lists every enabled process command", () => {
    it("an enabled command is always saved into Focus Panel Manage, whatever else it is placed on", async () => {
        const { enabledLifecycleActionPlacementIds } = await import("@/lib/lifecycle/lifecycleActionsMatrix");
        expect(enabledLifecycleActionPlacementIds([])).toEqual(["overflow"]);
        expect(enabledLifecycleActionPlacementIds(["work_unit_rail"])).toEqual(["overflow", "work_unit_rail"]);
        // Legacy "Focus Panel" normalizes onto Manage; deprecated queue_row drops.
        expect(enabledLifecycleActionPlacementIds(["drawer", "queue_row"])).toEqual(["overflow"]);
    });
});
