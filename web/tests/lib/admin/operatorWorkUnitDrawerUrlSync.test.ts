import { describe, expect, it, vi, afterEach } from "vitest";
import {
    isOperatorWorkUnitRecordIdOnlyPathChange,
    operatorWorkUnitRouteBase,
    syncOperatorWorkUnitUrlInBrowser,
} from "@/lib/admin/operatorWorkUnitDrawerUrlSync";

describe("operatorWorkUnitDrawerUrlSync", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("detects recordId-only path changes on the same work-unit slug", () => {
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

    it("syncOperatorWorkUnitUrlInBrowser uses history.replaceState", () => {
        const replaceState = vi.fn();
        vi.stubGlobal("window", {
            history: { replaceState, state: {} },
            location: { pathname: "/workspace/work-unit/new-leads" },
        });

        syncOperatorWorkUnitUrlInBrowser("new_leads", "opp-42");
        expect(replaceState).toHaveBeenCalledWith({}, "", "/workspace/work-unit/new-leads/opp-42");

        vi.stubGlobal("window", {
            history: { replaceState, state: {} },
            location: { pathname: "/workspace/work-unit/new-leads/opp-42" },
        });
        syncOperatorWorkUnitUrlInBrowser("new_leads", null);
        expect(replaceState).toHaveBeenCalledWith({}, "", "/workspace/work-unit/new-leads");
    });
});
