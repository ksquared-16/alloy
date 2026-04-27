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
                    label: "All inquiries",
                    description: "All enrollment opportunities.",
                    filters: [],
                    sort: [{ field: "updated_at", direction: "desc" }],
                    limit: 5,
                    priority: "standard",
                    display: "list",
                },
                {
                    key: "needs_attention",
                    label: "Needs attention",
                    description: "Enrollment records that need review.",
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
});

