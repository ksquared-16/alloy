import { describe, expect, it } from "vitest";
import {
    ADMINV2_DEPT_ATTENTION_LOADING_ROW_COUNT,
    ADMINV2_DRAWER_OPPORTUNITY_BOOTSTRAP_BODY_MIN_H,
    ADMINV2_KPI_STRIP_CELL_COUNT,
    ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT,
} from "@/lib/ui-v2/adminV2LoadingGeometry";

describe("adminV2LoadingGeometry", () => {
    it("exports stable queue and KPI placeholder counts", () => {
        expect(ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT).toBe(6);
        expect(ADMINV2_KPI_STRIP_CELL_COUNT).toBe(5);
        expect(ADMINV2_DEPT_ATTENTION_LOADING_ROW_COUNT).toBe(3);
    });

    it("uses drawer bootstrap body reserve shorter than legacy workflow block", () => {
        expect(ADMINV2_DRAWER_OPPORTUNITY_BOOTSTRAP_BODY_MIN_H).toBe("10.5rem");
    });
});
