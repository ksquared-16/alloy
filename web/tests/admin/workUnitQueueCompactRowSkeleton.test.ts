import { describe, expect, it } from "vitest";
import {
    WorkUnitQueueCompactRowSkeleton,
    WorkUnitQueueCompactRowSkeletonList,
} from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";

describe("WorkUnitQueueCompactRowSkeleton", () => {
    it("exports row and list skeleton helpers", () => {
        expect(typeof WorkUnitQueueCompactRowSkeleton).toBe("function");
        expect(typeof WorkUnitQueueCompactRowSkeletonList).toBe("function");
    });
});
