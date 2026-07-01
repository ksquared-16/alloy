import { describe, expect, it } from "vitest";
import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";

describe("queueDefinitionV1Schema — JSON null parity", () => {
    it("accepts explicit null on optional queue strings and enums (JSONB)", () => {
        const def = {
            version: 1 as const,
            entity_type: "opportunity" as const,
            ui: {
                layout: "pipeline_with_attention" as const,
                primary_total_label: null,
                primary_total_queue: null,
                sections: [
                    {
                        key: "pipeline",
                        label: "Pipeline",
                        tone: null,
                        queue_keys: ["x"],
                    },
                ],
            },
            queues: [
                {
                    key: "x",
                    label: "Lane",
                    icon: null,
                    description: null,
                    filters: [{ type: "status" as const, operator: "in" as const, values: ["new_inquiry"] }],
                    sort: [{ field: "updated_at", direction: "desc" as const }],
                    limit: 50,
                    priority: null,
                    display: null,
                    group_by: null,
                },
            ],
        };
        expect(() => validateQueueDefinition(def)).not.toThrow();
    });
});
