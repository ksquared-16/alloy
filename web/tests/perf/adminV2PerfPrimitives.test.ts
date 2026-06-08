import { describe, expect, it } from "vitest";
import { queueRowLogicalCacheKey, queueRowPrefetchLogicalKeys } from "@/lib/workspace/queueRowClientCache";

const FP = "dept:all;site:all";

describe("Admin V2 queue row client cache helpers", () => {
    it("queueRowLogicalCacheKey encodes mapped vs unmapped bucket", () => {
        expect(queueRowLogicalCacheKey(FP, "wu-1", "pipeline", false)).toBe(`${FP}:wu-1:pipeline:all`);
        expect(queueRowLogicalCacheKey(FP, "wu-1", "pipeline", true)).toBe(`${FP}:wu-1:pipeline:unmapped`);
    });

    it("prefetch keys cover both logical tabs for one GET", () => {
        expect(queueRowPrefetchLogicalKeys(FP, "wu-1", "pipeline")).toEqual([
            `${FP}:wu-1:pipeline:all`,
            `${FP}:wu-1:pipeline:unmapped`,
        ]);
    });
});
