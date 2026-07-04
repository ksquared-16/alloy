import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import {
    collectStatusKeysForCreateLeadStage,
    resolveCreateLeadEntryStageKey,
    stageOwnsCreateLeadStatus,
} from "@/lib/lifecycle/lifecycleCreateLeadEntryBinding";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const leadStage: LifecycleBuilderStageRecord = {
    id: "s-lead",
    key: "lead",
    label: "Lead",
    sort_order: 0,
    is_active: true,
};

const qualStage: LifecycleBuilderStageRecord = {
    id: "s-qual",
    key: "qualification",
    label: "Qualification",
    sort_order: 1,
    is_active: true,
};

describe("lifecycleCreateLeadEntryBinding", () => {
    it("finds stage owning new_inquiry from work unit metadata, not activation stage", () => {
        const workUnitByStageKey = new Map([
            [
                "lead",
                {
                    key: "lifecycle_wu_lead",
                    metadata: { status_keys: ["new_inquiry"], lifecycle_stage_key: "lead" },
                    queue_definition: {
                        version: 2,
                        entity_type: "opportunity",
                        queues: [
                            {
                                key: "lifecycle_lead",
                                label: "Lead",
                                filters: [{ type: "status", operator: "in", values: ["new_inquiry"] }],
                            },
                        ],
                    },
                },
            ],
            [
                "qualification",
                {
                    key: "lifecycle_wu_qualification",
                    metadata: {
                        status_keys: ["qualification", "contact_attempted"],
                        lifecycle_stage_key: "qualification",
                    },
                },
            ],
        ]);

        const entry = resolveCreateLeadEntryStageKey({
            stages: [qualStage, leadStage],
            statusPayload: null,
            workUnitByStageKey,
        });
        expect(entry).toBe("lead");
    });

    it("stale activation stage qualification does not affect entry stage resolution", () => {
        const entry = resolveCreateLeadEntryStageKey({
            stages: [leadStage, qualStage],
            statusPayload: null,
            workUnitByStageKey: new Map([
                [
                    "lead",
                    {
                        key: "lifecycle_wu_lead",
                        metadata: { status_keys: ["new_inquiry"] },
                    },
                ],
                [
                    "qualification",
                    {
                        key: "lifecycle_wu_qualification",
                        metadata: { status_keys: ["qualification"] },
                    },
                ],
            ]),
        });
        expect(entry).toBe("lead");
        expect(entry).not.toBe("qualification");
    });

    it("lead stage collects new_inquiry even without explicit status payload", () => {
        const keys = collectStatusKeysForCreateLeadStage("lead", null, {
            key: "lifecycle_wu_lead",
            metadata: { status_keys: ["new_inquiry"] },
        });
        expect(keys).toContain(NEW_LEAD_STATUS_KEY);
        expect(stageOwnsCreateLeadStatus(keys)).toBe(true);
    });

    it("qualification stage does not own new_inquiry", () => {
        const keys = collectStatusKeysForCreateLeadStage("qualification", null, {
            key: "lifecycle_wu_qualification",
            metadata: { status_keys: ["qualification", "contact_attempted"] },
        });
        expect(stageOwnsCreateLeadStatus(keys)).toBe(false);
    });

    it("falls back to first active stage when no stage owns new_inquiry", () => {
        const first: LifecycleBuilderStageRecord = {
            id: "s-a",
            key: "intake",
            label: "Intake",
            sort_order: 0,
            is_active: true,
        };
        const second: LifecycleBuilderStageRecord = {
            id: "s-b",
            key: "review",
            label: "Review",
            sort_order: 1,
            is_active: true,
        };
        const entry = resolveCreateLeadEntryStageKey({
            stages: [first, second],
            statusPayload: null,
            workUnitByStageKey: new Map([
                ["intake", { key: "lifecycle_wu_intake", metadata: { status_keys: ["open"] } }],
                ["review", { key: "lifecycle_wu_review", metadata: { status_keys: ["contacted"] } }],
            ]),
        });
        expect(entry).toBe("intake");
    });

    it("resolveLifecycleCreateLeadBinding uses entry binding for builder-owned departments", () => {
        const binding = read("lib/lifecycle/lifecycleRuntimeBinding.ts");
        expect(binding).toContain("resolveBuilderOwnedLifecycleCreateLeadBinding");
        expect(binding).toContain("departmentUsesCreateLeadEntryBinding");
        expect(binding).not.toMatch(
            /departmentUsesCreateLeadEntryBinding[\s\S]*activation\?\.stage_key[\s\S]*resolveBuilderOwned/
        );
    });

    it("entry binding resolves the configured entry-stage status, not a hardcoded new_inquiry", () => {
        const src = read("lib/lifecycle/lifecycleCreateLeadEntryBinding.ts");
        expect(src).toContain("status_key: entryStatusKey");
        expect(src).not.toContain("status_key: NEW_LEAD_STATUS_KEY");
        // Create Lead still applies the binding's resolved status when present.
        expect(read("lib/admin/actions/entryLifecycleActions.ts")).toContain("binding.status_key");
    });

    it("validation uses empty lifecycle copy when no records in scope", () => {
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "LIFECYCLE_NO_RECORDS_IN_LIFECYCLE_YET_COPY"
        );
        expect(read("lib/lifecycle/lifecycleWorkUnitQueueValidation.ts")).toContain(
            "visible by lifecycle filters"
        );
    });

    it("existing enrollment pipeline records are not auto-migrated", () => {
        expect(read("lib/lifecycle/attachLifecycleWorkUnitRecords.ts")).toContain(
            "attachMatchingRecordsToLifecycleWorkUnits"
        );
        expect(read("lib/lifecycle/lifecycleRuntimeBinding.ts")).not.toContain("auto-migrat");
    });
});
