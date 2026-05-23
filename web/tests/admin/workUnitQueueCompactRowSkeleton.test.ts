import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    WorkUnitQueueCompactRowSkeleton,
    WorkUnitQueueCompactRowSkeletonList,
    WorkUnitQueueLaneRowSkeleton,
    WorkUnitQueueLaneRowSkeletonList,
} from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("WorkUnitQueueLaneRowSkeleton", () => {
    it("exports row and list skeleton helpers", () => {
        expect(typeof WorkUnitQueueLaneRowSkeleton).toBe("function");
        expect(typeof WorkUnitQueueLaneRowSkeletonList).toBe("function");
        expect(typeof WorkUnitQueueCompactRowSkeleton).toBe("function");
        expect(typeof WorkUnitQueueCompactRowSkeletonList).toBe("function");
    });

    it("queue lane skeleton does not render metric Total copy", () => {
        const src = readFileSync(
            join(webRoot, "components/admin/workspace/WorkUnitQueueCompactRowSkeleton.tsx"),
            "utf8"
        );
        const laneBlock = src.slice(
            src.indexOf("export function WorkUnitQueueLaneRowSkeleton"),
            src.indexOf("function DeptOperBucketRowSkeleton")
        );
        expect(laneBlock).not.toContain(">Total<");
        expect(laneBlock).not.toContain('"Total"');
        expect(laneBlock).toContain("adminv2-ws-enrollment-crm-row--split");
        expect(laneBlock).toContain('data-wu-queue-row-skeleton-layout="queue_lane"');
    });

    it("QueueBlock uses queue-lane row skeleton only (not dept bucket variant)", () => {
        const queueBlock = readFileSync(
            join(webRoot, "app/adminV2/components/workspace/blocks/QueueBlock.tsx"),
            "utf8"
        );
        expect(queueBlock).toContain("WorkUnitQueueLaneRowSkeleton");
        expect(queueBlock).not.toContain('variant="standard"');
    });
});
