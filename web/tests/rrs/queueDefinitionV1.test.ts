import { describe, expect, it } from "vitest";
import { buildJobQueueIntent, parseQueueDefinitionV1 } from "@/lib/rrs/queue/queueDefinitionV1";

describe("parseQueueDefinitionV1", () => {
    it("returns null for empty object", () => {
        expect(parseQueueDefinitionV1({})).toBeNull();
    });

    it("parses minimal valid v1 job definition", () => {
        const raw = {
            version: 1,
            entity_type: "job",
            sort: { by: "updated_at", direction: "desc" },
            limit: 100,
        };
        const d = parseQueueDefinitionV1(raw);
        expect(d).not.toBeNull();
        expect(d!.version).toBe(1);
        expect(d!.entity_type).toBe("job");
        expect(d!.sort.by).toBe("updated_at");
        expect(d!.limit).toBe(100);
    });

    it("rejects wrong version", () => {
        expect(
            parseQueueDefinitionV1({
                version: 2,
                entity_type: "job",
                sort: { by: "updated_at", direction: "desc" },
                limit: 10,
            })
        ).toBeNull();
    });

    it("clamps limit", () => {
        const hi = parseQueueDefinitionV1({
            version: 1,
            entity_type: "job",
            sort: { by: "created_at", direction: "asc" },
            limit: 99999,
        });
        expect(hi!.limit).toBe(500);
    });
});

describe("buildJobQueueIntent", () => {
    it("copies org and filters", () => {
        const def = parseQueueDefinitionV1({
            version: 1,
            entity_type: "job",
            filters: { status_keys: ["open", "scheduled"] },
            sort: { by: "scheduled_at", direction: "asc" },
            limit: 20,
        })!;
        const intent = buildJobQueueIntent("org-uuid", def);
        expect(intent.org_id).toBe("org-uuid");
        expect(intent.filters.status_keys).toEqual(["open", "scheduled"]);
        expect(intent.sort.by).toBe("scheduled_at");
    });
});
