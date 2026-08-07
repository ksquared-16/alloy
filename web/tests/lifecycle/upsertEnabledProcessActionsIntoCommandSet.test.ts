import { describe, expect, it } from "vitest";

import { upsertEnabledProcessActionsIntoCommandSetMetadata } from "@/lib/lifecycle/lifecycleActionsMatrix";
import {
    LIFECYCLE_BUILDER_METADATA_KEY,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";

describe("upsertEnabledProcessActionsIntoCommandSetMetadata", () => {
    it("adds Move to Waitlist intent when Waitlist Child is enabled", () => {
        const metadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: "proc-1",
                processes: [
                    {
                        id: "proc-1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        command_set_v1: {
                            version: 1,
                            commands: [{ capability_key: "schedule_tour", enabled: true }],
                        },
                        stages: [],
                    },
                ],
            },
        };

        const patch = upsertEnabledProcessActionsIntoCommandSetMetadata(metadata, ["waitlist_child"]);
        expect(patch).not.toBeNull();
        const builder = lifecycleBuilderFromDepartmentMetadata(patch);
        const commands = builder.processes[0]!.command_set_v1!.commands;
        expect(commands.some((c) => c.capability_key === "move_to_waitlist" && c.enabled)).toBe(true);
        expect(commands.some((c) => c.capability_key === "schedule_tour" && c.enabled)).toBe(true);
    });

    it("re-enables a previously disabled command instead of duplicating", () => {
        const metadata = {
            [LIFECYCLE_BUILDER_METADATA_KEY]: {
                version: 1,
                active_process_id: "proc-1",
                processes: [
                    {
                        id: "proc-1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        command_set_v1: {
                            version: 1,
                            commands: [{ capability_key: "waitlist_child", enabled: false }],
                        },
                        stages: [],
                    },
                ],
            },
        };

        const patch = upsertEnabledProcessActionsIntoCommandSetMetadata(metadata, ["waitlist_child"]);
        const commands = lifecycleBuilderFromDepartmentMetadata(patch).processes[0]!.command_set_v1!.commands;
        expect(commands.filter((c) => c.capability_key === "waitlist_child" || c.capability_key === "move_to_waitlist")).toHaveLength(1);
        expect(commands[0]!.enabled).toBe(true);
    });
});
