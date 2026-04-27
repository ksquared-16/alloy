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
});

