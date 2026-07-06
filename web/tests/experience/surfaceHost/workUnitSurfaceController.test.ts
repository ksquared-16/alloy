import { describe, expect, it } from "vitest";

import {
    coldShellTitleFromCache,
    resolveDeepLinkRecordAction,
    resolveUrlSyncRecordId,
    routeRecordIdFromPathname,
} from "@/lib/experience/surfaceHost/workUnitSurfaceController";

/**
 * The load-bearing behavior that MUST NOT change when the Surface Host takes over rendering the
 * work-unit surface (Step 3): record deep-link opening and drawer URL sync. Extracted pure so the
 * "does record opening still work / are deep links intact" contract is verifiable without the DOM.
 */

describe("routeRecordIdFromPathname — recordId parsing", () => {
    it("no record on the bare work-unit URL", () => {
        expect(routeRecordIdFromPathname("/workspace/work-unit/active-pipeline")).toBeNull();
    });
    it("parses the :recordId segment", () => {
        expect(routeRecordIdFromPathname("/workspace/work-unit/active-pipeline/opp-123")).toBe("opp-123");
    });
    it("no record on the workspace URL", () => {
        expect(routeRecordIdFromPathname("/workspace")).toBeNull();
    });
    it("canonicalizes the internal adminV2 path", () => {
        expect(routeRecordIdFromPathname("/adminV2/workspace/work-unit/x/opp-9")).toBe("opp-9");
    });
});

describe("resolveDeepLinkRecordAction — record opening (mirrors WorkUnitSlugRouteHost)", () => {
    it("does nothing until identity is ready", () => {
        expect(
            resolveDeepLinkRecordAction({
                ready: false,
                routeRecordId: "opp-1",
                alreadyOpenedRecordId: null,
                drawerType: null,
                drawerId: null,
            }),
        ).toEqual({ kind: "none" });
    });

    it("does nothing when the URL carries no record", () => {
        expect(
            resolveDeepLinkRecordAction({
                ready: true,
                routeRecordId: null,
                alreadyOpenedRecordId: null,
                drawerType: null,
                drawerId: null,
            }),
        ).toEqual({ kind: "none" });
    });

    it("OPENS the drawer for a genuine record deep link", () => {
        expect(
            resolveDeepLinkRecordAction({
                ready: true,
                routeRecordId: "opp-1",
                alreadyOpenedRecordId: null,
                drawerType: null,
                drawerId: null,
            }),
        ).toEqual({ kind: "open", recordId: "opp-1" });
    });

    it("only opens a given record once (no re-open after handled)", () => {
        expect(
            resolveDeepLinkRecordAction({
                ready: true,
                routeRecordId: "opp-1",
                alreadyOpenedRecordId: "opp-1",
                drawerType: null,
                drawerId: null,
            }),
        ).toEqual({ kind: "none" });
    });

    it("marks-handled (does NOT re-open) when that record is already the open drawer", () => {
        expect(
            resolveDeepLinkRecordAction({
                ready: true,
                routeRecordId: "opp-1",
                alreadyOpenedRecordId: null,
                drawerType: "opportunities",
                drawerId: "opp-1",
            }),
        ).toEqual({ kind: "mark-open", recordId: "opp-1" });
    });

    it("opens a NEW record even while a different record is open", () => {
        expect(
            resolveDeepLinkRecordAction({
                ready: true,
                routeRecordId: "opp-2",
                alreadyOpenedRecordId: null,
                drawerType: "opportunities",
                drawerId: "opp-1",
            }),
        ).toEqual({ kind: "open", recordId: "opp-2" });
    });
});

describe("resolveUrlSyncRecordId — drawer → URL", () => {
    it("carries the opportunity record id", () => {
        expect(resolveUrlSyncRecordId("opportunities", "opp-5")).toBe("opp-5");
        expect(resolveUrlSyncRecordId("opportunities", 5)).toBe("5");
    });
    it("no record when the drawer is closed or non-opportunity", () => {
        expect(resolveUrlSyncRecordId(null, null)).toBeNull();
        expect(resolveUrlSyncRecordId("opportunities", null)).toBeNull();
        expect(resolveUrlSyncRecordId("jobs", "job-1")).toBeNull();
    });
});

describe("coldShellTitleFromCache — configured names only", () => {
    it("prefers department name, then work-unit name, else empty (never a slug)", () => {
        expect(coldShellTitleFromCache({ departmentName: "Sales", workUnitName: "Pipeline" } as never)).toBe("Sales");
        expect(coldShellTitleFromCache({ workUnitName: "Pipeline" } as never)).toBe("Pipeline");
        expect(coldShellTitleFromCache(null)).toBe("");
    });
});
