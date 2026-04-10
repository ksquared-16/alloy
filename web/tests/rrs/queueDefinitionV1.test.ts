import { describe, expect, it } from "vitest";
import {
    buildJobQueueIntent,
    getQueueDefinitionStoredVersion,
    normalizeQueueDefinitionForCreate,
    parseQueueDefinitionV1,
    parseQueueDefinitionV1Strict,
    queueDefinitionV1Schema,
} from "@/lib/rrs/queue/queueDefinitionV1";

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

describe("parseQueueDefinitionV1Strict", () => {
    it("rejects unknown top-level keys", () => {
        const r = parseQueueDefinitionV1Strict({
            version: 1,
            entity_type: "job",
            sort: { by: "updated_at", direction: "desc" },
            limit: 10,
            extra: 1,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain("unknown key");
    });

    it("rejects empty object", () => {
        const r = parseQueueDefinitionV1Strict({});
        expect(r.ok).toBe(false);
    });

    it("accepts minimal valid v1", () => {
        const r = parseQueueDefinitionV1Strict({
            version: 1,
            entity_type: "job",
            sort: { by: "updated_at", direction: "desc" },
            limit: 50,
        });
        expect(r.ok).toBe(true);
    });

    it("queueDefinitionV1Schema exposes parseStrict and getStoredVersion", () => {
        expect(queueDefinitionV1Schema.getStoredVersion({})).toBe(0);
        expect(queueDefinitionV1Schema.getStoredVersion({ version: 1 })).toBe(1);
        expect(getQueueDefinitionStoredVersion(null)).toBe(0);
    });
});

describe("normalizeQueueDefinitionForCreate", () => {
    it("accepts empty object as {}", () => {
        const r = normalizeQueueDefinitionForCreate({});
        expect(r.ok).toBe(true);
        if (r.ok) expect(Object.keys(r.value)).toHaveLength(0);
    });

    it("rejects non-v1 when non-empty", () => {
        const r = normalizeQueueDefinitionForCreate({ foo: 1 });
        expect(r.ok).toBe(false);
    });

    it("accepts strict v1", () => {
        const r = normalizeQueueDefinitionForCreate({
            version: 1,
            entity_type: "job",
            sort: { by: "updated_at", direction: "desc" },
            limit: 5,
        });
        expect(r.ok).toBe(true);
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
