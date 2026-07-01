import { describe, expect, it } from "vitest";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";
import { getQueueUiConfig, partitionQueueUiSections } from "@/lib/ui-v2/queueUiConfig";

describe("queue UI config helper", () => {
    it("returns configured sections (order preserved) when ui provided", () => {
        const def = validateQueueDefinition({
            version: 1,
            entity_type: "opportunity",
            queues: [
                { key: "all", label: "All", filters: [] },
                { key: "needs_attention", label: "Needs attention", filters: [] },
                { key: "paperwork", label: "Paperwork", filters: [] },
            ],
            ui: {
                layout: "pipeline_with_attention",
                primary_total_label: "Pipeline families",
                primary_total_queue: "all",
                sections: [
                    { key: "pipeline", label: "Pipeline", queue_keys: ["all", "paperwork"] },
                    { key: "attention", label: "Needs Attention", tone: "critical", queue_keys: ["needs_attention"] },
                ],
                row_preview: { variant: "crm_compact", fields: ["title", "status"], actions: ["open"] },
            },
        });

        const ui = getQueueUiConfig(def);
        expect(ui.sections.map((s) => s.key)).toEqual(["pipeline", "attention"]);
        expect(ui.sections[0]?.queue_keys).toEqual(["all", "paperwork"]);
        expect(ui.sections[1]?.queue_keys).toEqual(["needs_attention"]);
    });

    it("fallback returns single section + basic preview + open action when ui missing", () => {
        const def = validateQueueDefinition({
            version: 1,
            entity_type: "opportunity",
            queues: [
                { key: "all", label: "All", filters: [] },
                { key: "x", label: "X", filters: [] },
            ],
        });
        const ui = getQueueUiConfig(def);
        expect(ui.sections).toHaveLength(1);
        expect(ui.sections[0]?.queue_keys).toEqual(["all", "x"]);
        expect(ui.row_preview.variant).toBe("basic");
        expect(ui.row_preview.actions).toEqual(["open"]);
    });

    it("attention placement derives from section tone, not queue key", () => {
        const def = validateQueueDefinition({
            version: 1,
            entity_type: "opportunity",
            queues: [
                { key: "q1", label: "Queue 1", filters: [] },
                { key: "needs_attention", label: "Queue literally named needs_attention", filters: [] },
            ],
            ui: {
                layout: "pipeline_with_attention",
                sections: [
                    { key: "main", label: "Main", queue_keys: ["needs_attention"] }, // NOT critical
                    { key: "red", label: "Red Panel", tone: "critical", queue_keys: ["q1"] },
                ],
                row_preview: { variant: "basic", fields: ["title", "status"], actions: ["open"] },
            },
        });
        const ui = getQueueUiConfig(def);
        const { throughput, attention } = partitionQueueUiSections(ui);
        expect(throughput.flatMap((s) => s.queue_keys)).toContain("needs_attention");
        expect(attention.flatMap((s) => s.queue_keys)).toEqual(["q1"]);
    });
});

