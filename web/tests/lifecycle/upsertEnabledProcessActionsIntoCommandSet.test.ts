import { describe, expect, it } from "vitest";

import { upsertEnabledProcessActionsIntoCommandSet } from "@/lib/lifecycle/lifecycleActionsMatrix";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    mergeCategoryFDepartmentMetadata,
    metadataPatchTouchesLifecycleBuilder,
} from "@/lib/lifecycle/mergeCategoryFDepartmentMetadata";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function processWithCommands(
    commands: Array<{ capability_key: string; enabled: boolean }>,
): LifecycleBuilderProcessRecord {
    return {
        id: "proc-1",
        key: "enrollment",
        name: "Enrollment",
        primary_entity: "opportunity",
        sort_order: 0,
        is_active: true,
        command_set_v1: { version: 1, commands },
        stages: [],
    };
}

describe("upsertEnabledProcessActionsIntoCommandSet", () => {
    it("adds registry-canonical Waitlist Child when enabled", () => {
        const next = upsertEnabledProcessActionsIntoCommandSet(
            processWithCommands([{ capability_key: "schedule_tour", enabled: true }]),
            ["waitlist_child"],
        );
        expect(next).not.toBeNull();
        expect(next!.command_set_v1!.commands.some((c) => c.capability_key === "waitlist_child" && c.enabled)).toBe(
            true,
        );
        expect(next!.command_set_v1!.commands.some((c) => c.capability_key === "schedule_tour")).toBe(true);
    });

    it("re-enables a previously disabled command instead of duplicating", () => {
        const next = upsertEnabledProcessActionsIntoCommandSet(
            processWithCommands([{ capability_key: "waitlist_child", enabled: false }]),
            ["waitlist_child"],
        );
        expect(next).not.toBeNull();
        const waitlistish = next!.command_set_v1!.commands.filter(
            (c) => c.capability_key === "waitlist_child" || c.capability_key === "move_to_waitlist",
        );
        expect(waitlistish).toHaveLength(1);
        expect(waitlistish[0]!.enabled).toBe(true);
        expect(waitlistish[0]!.capability_key).toBe("waitlist_child");
    });

    it("canonicalizes move_to_waitlist alias onto waitlist_child", () => {
        const next = upsertEnabledProcessActionsIntoCommandSet(
            processWithCommands([{ capability_key: "move_to_waitlist", enabled: true }]),
            ["waitlist_child"],
        );
        expect(next).not.toBeNull();
        expect(next!.command_set_v1!.commands).toEqual([{ capability_key: "waitlist_child", enabled: true }]);
    });

    it("maps Create Task Process Action onto create_work_item", () => {
        const next = upsertEnabledProcessActionsIntoCommandSet(processWithCommands([]), ["create_task"]);
        expect(next).not.toBeNull();
        expect(next!.command_set_v1!.commands).toEqual([{ capability_key: "create_work_item", enabled: true }]);
    });

    it("rewrites a legacy create_task command_set entry to create_work_item", () => {
        const next = upsertEnabledProcessActionsIntoCommandSet(
            processWithCommands([{ capability_key: "create_task", enabled: true }]),
            ["create_task"],
        );
        expect(next).not.toBeNull();
        expect(next!.command_set_v1!.commands).toEqual([{ capability_key: "create_work_item", enabled: true }]);
    });
});

describe("mergeCategoryFDepartmentMetadata", () => {
    it("preserves lifecycle_builder_v1 even when the patch includes a different builder", () => {
        const existing = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: { version: 1, active_process_id: "a", processes: [] },
            lifecycle_actions_matrix_order_v1: { version: 1, base_action_keys: ["waitlist_child"] },
        };
        const patch = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: { version: 1, active_process_id: "hijacked", processes: [] },
            lifecycle_actions_matrix_order_v1: { version: 1, base_action_keys: ["enroll_child"] },
        };
        const merged = mergeCategoryFDepartmentMetadata(existing, patch);
        expect(merged[LIFECYCLE_BUILDER_METADATA_KEY]).toEqual(existing[LIFECYCLE_BUILDER_METADATA_KEY]);
        expect(merged.lifecycle_actions_matrix_order_v1).toEqual(patch.lifecycle_actions_matrix_order_v1);
        expect(metadataPatchTouchesLifecycleBuilder(patch)).toBe(true);
        expect(metadataPatchTouchesLifecycleBuilder({ lifecycle_actions_matrix_order_v1: {} })).toBe(false);
    });
});

describe("lifecycle-actions-matrix route stays category F + draft for command_set", () => {
    const route = readFileSync(
        resolve(__dirname, "../../app/api/admin/departments/[departmentId]/lifecycle-actions-matrix/route.ts"),
        "utf8",
    );

    it("pins category-F metadata merges", () => {
        expect(route).toContain("mergeCategoryFDepartmentMetadata");
    });

    it("upserts command_set through the draft writer, not the projection", () => {
        expect(route).toContain("editProcessInDraft");
        expect(route).toContain("upsertEnabledProcessActionsIntoCommandSet");
        expect(route).not.toContain("mergeLifecycleBuilderIntoMetadata");
        expect(route).not.toContain("begin_lifecycle_projection_write");
    });

    it("reports publication_required when the draft moves", () => {
        expect(route).toContain("publication_required");
    });
});
