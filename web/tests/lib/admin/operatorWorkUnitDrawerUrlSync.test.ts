import { describe, expect, it, vi, afterEach } from "vitest";
import {
    isOperatorWorkUnitRecordIdOnlyPathChange,
    operatorWorkUnitRouteBase,
} from "@/lib/admin/operatorWorkUnitDrawerUrlSync";

describe("operatorWorkUnitDrawerUrlSync", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("detects same-base path changes on the same work-unit slug (drawer must not auto-close)", () => {
        expect(
            isOperatorWorkUnitRecordIdOnlyPathChange(
                "/workspace/work-unit/new-leads",
                "/workspace/work-unit/new-leads/opp-1",
            ),
        ).toBe(true);
        expect(
            isOperatorWorkUnitRecordIdOnlyPathChange(
                "/adminV2/workspace/work-unit/new-leads/rec-1",
                "/adminV2/workspace/work-unit/new-leads",
            ),
        ).toBe(true);
        expect(
            isOperatorWorkUnitRecordIdOnlyPathChange(
                "/workspace/work-unit/new-leads",
                "/workspace/work-unit/tours",
            ),
        ).toBe(false);
    });

    it("normalizes operator work-unit route base without record segment", () => {
        expect(operatorWorkUnitRouteBase("/workspace/work-unit/new-leads/opp-1")).toBe(
            "/workspace/work-unit/new-leads",
        );
    });
});
