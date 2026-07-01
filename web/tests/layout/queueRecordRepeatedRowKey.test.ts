import { describe, expect, it } from "vitest";
import { resolveQueueRecordRepeatedRowKey } from "@/lib/layout/runtime/queueRecordRepeatedRowKey";

describe("resolveQueueRecordRepeatedRowKey", () => {
    it("prefers non-empty row id", () => {
        expect(resolveQueueRecordRepeatedRowKey("children", { id: "row-1" }, 0)).toBe("children:row-1");
    });

    it("uses child id when row id is blank", () => {
        expect(
            resolveQueueRecordRepeatedRowKey("children", { id: "", "child.id": "child-9" }, 1),
        ).toBe("children:child:child-9");
    });

    it("uses display name when ids are missing", () => {
        expect(
            resolveQueueRecordRepeatedRowKey("children", { "child.name": "Alex Kelly" }, 2),
        ).toBe("children:name:Alex Kelly");
    });

    it("falls back to index and never returns empty", () => {
        const key = resolveQueueRecordRepeatedRowKey("children", {}, 3);
        expect(key).toBe("children:index:3");
        expect(key.length).toBeGreaterThan(0);
    });

    it("deduplicates blank ids across rows via index fallback", () => {
        const a = resolveQueueRecordRepeatedRowKey("children", { id: "" }, 0);
        const b = resolveQueueRecordRepeatedRowKey("children", { id: "" }, 1);
        expect(a).not.toBe(b);
        expect(a).toBe("children:index:0");
        expect(b).toBe("children:index:1");
    });
});
