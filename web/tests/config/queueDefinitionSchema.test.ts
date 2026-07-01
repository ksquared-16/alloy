import { describe, expect, it } from "vitest";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

describe("QueueDefinition v1 schema", () => {
    it("accepts minimal valid v1", () => {
        const input = {
            version: 1,
            entity_type: "job",
            queues: [{ key: "all", label: "All Jobs", filters: [] }],
        };
        expect(validateQueueDefinition(input)).toEqual(input);
    });

    it("rejects missing version", () => {
        expect(() =>
            validateQueueDefinition({
                entity_type: "job",
                queues: [{ key: "all", label: "All Jobs", filters: [] }],
            })
        ).toThrow();
    });

    it("rejects null", () => {
        expect(() => validateQueueDefinition(null)).toThrow();
    });

    it("rejects unknown filter type", () => {
        expect(() =>
            validateQueueDefinition({
                version: 1,
                entity_type: "job",
                queues: [
                    {
                        key: "all",
                        label: "All Jobs",
                        filters: [{ type: "bogus", operator: "in", values: ["x"] }],
                    },
                ],
            })
        ).toThrow();
    });

    it("rejects wrong operator", () => {
        expect(() =>
            validateQueueDefinition({
                version: 1,
                entity_type: "job",
                queues: [
                    {
                        key: "all",
                        label: "All Jobs",
                        filters: [{ type: "status", operator: "eq", values: ["x"] }],
                    },
                ],
            })
        ).toThrow();
    });

    it("rejects missing filters", () => {
        expect(() =>
            validateQueueDefinition({
                version: 1,
                entity_type: "job",
                queues: [{ key: "all", label: "All Jobs" }],
            })
        ).toThrow();
    });

    it("rejects extra unknown fields", () => {
        expect(() =>
            validateQueueDefinition({
                version: 1,
                entity_type: "job",
                queues: [{ key: "all", label: "All Jobs", filters: [], extra: true }],
            })
        ).toThrow();
    });

    it("accepts Enrollment opportunity config shape", () => {
        const input = {
            version: 1,
            entity_type: "opportunity",
            queues: [
                {
                    key: "all",
                    label: "All families",
                    description: "All enrollment records.",
                    filters: [],
                    sort: [{ field: "updated_at", direction: "desc" }],
                    limit: 5,
                    priority: "standard",
                    display: "list",
                },
                {
                    key: "needs_attention",
                    label: "Needs attention",
                    description: "Records requiring intervention (time, missing info, or readiness issues).",
                    filters: [{ type: "exception", operator: "exists" }],
                    sort: [{ field: "updated_at", direction: "asc" }],
                    limit: 5,
                    priority: "critical",
                    display: "list",
                },
            ],
        };
        expect(validateQueueDefinition(input)).toEqual(input);
    });

    it("accepts v1 ui config", () => {
        const input = {
            version: 1,
            entity_type: "opportunity",
            ui: {
                layout: "pipeline_with_attention",
                primary_total_label: "Pipeline families",
                primary_total_queue: "all",
                sections: [
                    { key: "pipeline", label: "Pipeline", queue_keys: ["all"] },
                    { key: "attention", label: "Needs Attention", tone: "critical", queue_keys: ["needs_attention"] },
                ],
                row_preview: { variant: "crm_compact", fields: ["title", "status", "email"], actions: ["open", "email"] },
            },
            queues: [{ key: "all", label: "All", filters: [] }],
        };
        expect(validateQueueDefinition(input)).toEqual(input);
    });

    it("rejects ui.section.queue_keys empty", () => {
        expect(() =>
            validateQueueDefinition({
                version: 1,
                entity_type: "opportunity",
                ui: { layout: "single_section", sections: [{ key: "x", label: "X", queue_keys: [] }] },
                queues: [{ key: "all", label: "All", filters: [] }],
            })
        ).toThrow();
    });
});

