import { describe, expect, it } from "vitest";
import { parseCommandConfigVariants } from "@/lib/platform/commands/commandConfigVariants";
import { listProcessCommandUsageForProcesses } from "@/lib/platform/commands/processCommandUsage";
import { confirmationPolicyLabel, listOrganizationCommandCatalog } from "@/lib/platform/commands/organizationCommandCatalog";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

describe("commandConfigVariants", () => {
    it("parses bounded variants from metadata", () => {
        const variants = parseCommandConfigVariants({
            command_config: {
                variants: [
                    { variant_key: "quick", label: "Quick schedule" },
                    { variantKey: "full", label: "Full intake", description: "Long form" },
                    { variant_key: "quick", label: "dup ignored" },
                ],
            },
        });
        expect(variants).toEqual([
            { variantKey: "quick", label: "Quick schedule" },
            { variantKey: "full", label: "Full intake", description: "Long form" },
        ]);
    });

    it("returns empty for missing or invalid metadata", () => {
        expect(parseCommandConfigVariants(null)).toEqual([]);
        expect(parseCommandConfigVariants({ other: true })).toEqual([]);
    });
});

describe("processCommandUsage", () => {
    it("lists processes that select a capability via command_set_v1", () => {
        const process: LifecycleBuilderProcessRecord = {
            id: "p1",
            key: "enrollment_lead",
            name: "Enrollment Lead",
            primary_entity: "opportunity",
            sort_order: 0,
            is_active: true,
            command_set_v1: {
                version: 1,
                commands: [
                    { capability_key: "schedule_tour", enabled: true },
                    { capability_key: "create_lead", enabled: false },
                ],
            },
            stages: [],
        };
        const rows = listProcessCommandUsageForProcesses({
            capabilityKey: "schedule_tour",
            processes: [process],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.processKey).toBe("enrollment_lead");
        expect(rows[0]?.authority).toBe("command_set_v1");

        expect(
            listProcessCommandUsageForProcesses({
                capabilityKey: "create_lead",
                processes: [process],
            })
        ).toHaveLength(0);
    });
});

describe("organizationCommandCatalog safety projection", () => {
    it("includes confirmation policy on catalog rows", () => {
        const rows = listOrganizationCommandCatalog();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => typeof r.confirmationPolicy === "string")).toBe(true);
        expect(confirmationPolicyLabel("typed_confirm")).toBe("Type to confirm");
        const destructive = rows.find((r) => r.destructiveKind);
        expect(destructive?.family === "destructive" || Boolean(destructive?.destructiveKind)).toBe(
            true
        );
    });
});
