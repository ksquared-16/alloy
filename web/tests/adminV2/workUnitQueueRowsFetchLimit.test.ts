import { describe, expect, it } from "vitest";
import {
    resolveWorkUnitQueueRowsFetchLimit,
    WORK_UNIT_QUEUE_ROWS_FETCH_MAX,
    WORK_UNIT_QUEUE_ROWS_FETCH_MIN,
} from "@/lib/adminV2/workUnitQueueRowsFetchLimit";

describe("resolveWorkUnitQueueRowsFetchLimit", () => {
    it("defaults to minimum when count unknown", () => {
        expect(resolveWorkUnitQueueRowsFetchLimit(null)).toBe(WORK_UNIT_QUEUE_ROWS_FETCH_MIN);
        expect(resolveWorkUnitQueueRowsFetchLimit(undefined)).toBe(WORK_UNIT_QUEUE_ROWS_FETCH_MIN);
    });

    it("matches pill summary count up to API cap", () => {
        expect(resolveWorkUnitQueueRowsFetchLimit(26)).toBe(26);
        expect(resolveWorkUnitQueueRowsFetchLimit(100)).toBe(100);
        expect(resolveWorkUnitQueueRowsFetchLimit(150)).toBe(WORK_UNIT_QUEUE_ROWS_FETCH_MAX);
    });

    it("uses max fetch window when search is active", () => {
        expect(resolveWorkUnitQueueRowsFetchLimit(26, { searchActive: true })).toBe(WORK_UNIT_QUEUE_ROWS_FETCH_MAX);
    });
});
