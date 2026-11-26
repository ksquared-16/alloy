/**
 * P6.S3 — Editor / Work Template authoring authority.
 */

import { describe, expect, it } from "vitest";

import {
    buildEnrollmentLeadProofProcess,
    enrollmentLeadProofActionCatalog,
} from "@/lib/lifecycle/enrollmentLeadProcessCommandAuthority";
import {
    ensureBuilderCommandSetsOnSave,
    ensureProcessCommandSetV1OnSave,
} from "@/lib/lifecycle/ensureProcessCommandSetV1OnSave";
import { emptyProcessCommandSetV1 } from "@/lib/lifecycle/processCommandSetV1";
import { resolveCanonicalWorkTemplateActionOptions } from "@/lib/lifecycle/resolveCanonicalWorkTemplateActionOptions";
import { validateProcessCommandSetsForPublish } from "@/lib/lifecycle/validateProcessCommandSetsForPublish";

describe("P6.S3 ensureProcessCommandSetV1OnSave", () => {
    it("stamps command_set_v1 from legacy migrate when absent", () => {
        const process = buildEnrollmentLeadProofProcess();
        expect(process.command_set_v1).toBeUndefined();
        const stamped = ensureProcessCommandSetV1OnSave(process);
        expect(stamped.command_set_v1?.version).toBe(1);
        expect(stamped.command_set_v1?.commands.map((c) => c.capability_key)).toEqual(
            expect.arrayContaining(["quick_message", "schedule_tour", "confirm_tour"])
        );
    });

    it("preserves explicit-empty V1 without legacy fill", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: emptyProcessCommandSetV1(),
        });
        const stamped = ensureProcessCommandSetV1OnSave(process);
        expect(stamped.command_set_v1?.commands).toHaveLength(0);
    });

    it("upserts newly seen stage catalog keys into existing V1", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "quick_message", enabled: true }],
            },
        });
        // Proof process already has schedule_tour in lead catalog — upsert should add it.
        const stamped = ensureProcessCommandSetV1OnSave(process);
        expect(stamped.command_set_v1?.commands.map((c) => c.capability_key)).toEqual(
            expect.arrayContaining(["quick_message", "schedule_tour"])
        );
    });

    it("stamps all processes in a builder config", () => {
        const process = buildEnrollmentLeadProofProcess();
        const config = {
            version: 1 as const,
            active_process_id: process.id,
            processes: [process],
        };
        const stamped = ensureBuilderCommandSetsOnSave(config);
        expect(stamped.processes[0]?.command_set_v1).toBeTruthy();
    });
});

describe("P6.S3 Work Template option gating", () => {
    it("without process keeps catalog∪registry behavior", () => {
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: enrollmentLeadProofActionCatalog(),
            processDefinition: { primary_entity: "opportunity" },
            stageDefinition: { journey_segment: "family" },
        });
        expect(options.map((o) => o.ref)).toEqual(
            expect.arrayContaining(["schedule_tour", "send_form"])
        );
    });

    it("with process V1 cannot introduce unselected Commands", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "schedule_tour", enabled: true }],
            },
        });
        const options = resolveCanonicalWorkTemplateActionOptions({
            actionRegistry: [],
            stageActionCatalog: enrollmentLeadProofActionCatalog(),
            processDefinition: { primary_entity: "opportunity" },
            stageDefinition: { journey_segment: "family" },
            process,
        });
        const refs = options.map((o) => o.ref);
        expect(refs).toContain("schedule_tour");
        expect(refs).not.toContain("send_form");
        expect(refs).not.toContain("close_lead");
    });
});

describe("P6.S3 publish validation", () => {
    it("accepts stamped Enrollment Lead process", () => {
        const process = ensureProcessCommandSetV1OnSave(buildEnrollmentLeadProofProcess());
        const result = validateProcessCommandSetsForPublish({
            version: 1,
            active_process_id: process.id,
            processes: [process],
        });
        expect(result.ok).toBe(true);
    });

    it("rejects stage orphans when V1 is narrow", () => {
        const process = buildEnrollmentLeadProofProcess({
            commandSet: {
                version: 1,
                commands: [{ capability_key: "quick_message", enabled: true }],
            },
        });
        const result = validateProcessCommandSetsForPublish({
            version: 1,
            active_process_id: process.id,
            processes: [process],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.issues.some((i) => i.code === "stage_orphan")).toBe(true);
        }
    });
});
