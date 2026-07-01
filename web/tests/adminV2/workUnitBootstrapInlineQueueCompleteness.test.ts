import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORK_UNIT_QUEUE_ROWS_FETCH_MIN } from "@/lib/adminV2/workUnitQueueRowsFetchLimit";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("work unit bootstrap inline queue completeness", () => {
    it("bootstrap session primary_row_limit matches queue fetch min", () => {
        const src = read("lib/adminV2/workUnitBootstrapClientSession.ts");
        expect(src).toContain("WORK_UNIT_QUEUE_ROWS_FETCH_MIN");
        expect(WORK_UNIT_QUEUE_ROWS_FETCH_MIN).toBeGreaterThanOrEqual(20);
    });

    it("work-unit page refetches when inline bootstrap rows are fewer than pill count", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("inlineIncomplete");
        expect(page).toContain("pillCount > pl.items.length");
        expect(page).toContain("fetchQueueItemsRef.current");
        expect(page).toContain("suppressQueueFetchEffectOnceRef.current = !inlineIncomplete");
    });

    it("waitlist sections default collapsed in QueueBlock", () => {
        const block = read("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(block).toContain("setCollapsedPlacementGroups(keys)");
        expect(block).not.toContain("setCollapsedPlacementGroups(new Set())");
    });
});
