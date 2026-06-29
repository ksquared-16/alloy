import { describe, expect, it } from "vitest";

import {
    parseWorkspaceModalIntent,
    WORKSPACE_MODAL_INTENT_PARAM,
} from "@/lib/adminV2/workspaceModalIntent";
import {
    isInternalDrillHref,
    buildOperationalIntelligenceQuery,
} from "@/lib/analytics/runtime/operationalSurfaceModel";
import { SURFACE_OBJECTS } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

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

describe("modal-local filter query", () => {
    it("encodes site / window / compare", () => {
        expect(buildOperationalIntelligenceQuery({})).toBe("");
        expect(buildOperationalIntelligenceQuery({ siteId: "site-a" })).toBe("site_id=site-a");
        expect(buildOperationalIntelligenceQuery({ window: "rolling_7d" })).toBe("window=rolling_7d");
        expect(buildOperationalIntelligenceQuery({ compare: true })).toBe("compare=1");
        const all = new URLSearchParams(
            buildOperationalIntelligenceQuery({ siteId: "site-a", window: "rolling_24h", compare: true }),
        );
        expect(all.get("site_id")).toBe("site-a");
        expect(all.get("window")).toBe("rolling_24h");
        expect(all.get("compare")).toBe("1");
    });

    it("omits empty site and compare=off", () => {
        expect(buildOperationalIntelligenceQuery({ siteId: null, compare: false })).toBe("");
    });
});

describe("Surfaces runtime link opens the modal, not the dev mock", () => {
    const oi = SURFACE_OBJECTS.dashboards.find((d) => d.id === "operational-intelligence");

    it("runtime link is the workspace modal-intent deep-link (not /dev, not the removed route)", () => {
        expect(oi).toBeDefined();
        expect(oi?.liveHref).toBe("/workspace?workspaceModal=analytics");
        expect(oi?.liveHref).not.toContain("/dev/");
        expect(oi?.liveHref).not.toContain("/adminV2/intelligence");
        // and the intent param resolves to the analytics modal
        const search = oi!.liveHref!.split("?")[1] ?? "";
        expect(parseWorkspaceModalIntent(search)).toBe("analytics");
    });

    it("preview link remains the clearly-separate dev/mock surface", () => {
        expect(oi?.previewHref).toBe("/dev/analytics-surface-mocks");
    });
});
