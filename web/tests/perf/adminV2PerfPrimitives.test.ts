import { describe, expect, it } from "vitest";
import { queueRowLogicalCacheKey, queueRowPrefetchLogicalKeys } from "@/lib/workspace/queueRowClientCache";

describe("Admin V2 queue row client cache helpers", () => {
    it("queueRowLogicalCacheKey encodes mapped vs unmapped bucket", () => {
        expect(queueRowLogicalCacheKey("wu-1", "pipeline", false)).toBe("wu-1:pipeline:all");
        expect(queueRowLogicalCacheKey("wu-1", "pipeline", true)).toBe("wu-1:pipeline:unmapped");
    });

    it("prefetch keys cover both logical tabs for one GET", () => {
        expect(queueRowPrefetchLogicalKeys("wu-1", "pipeline")).toEqual(["wu-1:pipeline:all", "wu-1:pipeline:unmapped"]);
    });
});
