import { describe, expect, it } from "vitest";

import {
    parseWorkspaceModalIntent,
    WORKSPACE_MODAL_INTENT_PARAM,
} from "@/lib/adminV2/workspaceModalIntent";
import { isInternalDrillHref } from "@/lib/analytics/runtime/operationalSurfaceModel";

/**
 * Covers the modal-integration glue: the Surfaces → Workspace deep-link bridge that
 * opens the Operational Intelligence (analytics) modal, and the drill-navigation guard
 * used by the in-modal runtime surface.
 */
describe("workspace modal deep-link intent", () => {
    it("opens the analytics modal from the intent param", () => {
        expect(parseWorkspaceModalIntent("workspaceModal=analytics")).toBe("analytics");
        expect(parseWorkspaceModalIntent(new URLSearchParams("workspaceModal=analytics"))).toBe("analytics");
    });

    it("ignores absent / empty / unknown / non-deep-linkable modal keys", () => {
        expect(parseWorkspaceModalIntent("")).toBeNull();
        expect(parseWorkspaceModalIntent("foo=bar")).toBeNull();
        expect(parseWorkspaceModalIntent("workspaceModal=")).toBeNull();
        expect(parseWorkspaceModalIntent("workspaceModal=bogus")).toBeNull();
        // valid shell modals that are intentionally NOT deep-linkable today
        expect(parseWorkspaceModalIntent("workspaceModal=processing")).toBeNull();
        expect(parseWorkspaceModalIntent("workspaceModal=inbox")).toBeNull();
    });

    it("preserves other params (bridge deletes only its own key)", () => {
        const params = new URLSearchParams(`site=abc&${WORKSPACE_MODAL_INTENT_PARAM}=analytics`);
        expect(parseWorkspaceModalIntent(params)).toBe("analytics");
        params.delete(WORKSPACE_MODAL_INTENT_PARAM);
        expect(params.toString()).toBe("site=abc");
    });
});

describe("in-modal drill navigation guard", () => {
    it("navigates only to internal app paths", () => {
        expect(isInternalDrillHref("/adminV2/workspace/dept/d/work-unit/wu?status_keys=new")).toBe(true);
        expect(isInternalDrillHref("/adminV2/workspace")).toBe(true);
    });

    it("rejects non-internal / placeholder / empty hrefs", () => {
        expect(isInternalDrillHref("#")).toBe(false);
        expect(isInternalDrillHref("https://example.com")).toBe(false);
        expect(isInternalDrillHref("")).toBe(false);
        expect(isInternalDrillHref(null)).toBe(false);
        expect(isInternalDrillHref(undefined)).toBe(false);
    });
});
