import { describe, expect, it } from "vitest";

import {
    applyOperationalWorkspaceGeometryVars,
    computeOperationalWorkspaceBounds,
    OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX,
    resolveOperationalBosRailLeft,
} from "@/lib/bos/operationalWorkspaceGeometry";

const GUTTER = 16;

describe("computeOperationalWorkspaceBounds", () => {
    it("fills the full band from sidebar to BOS rail (no centering)", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: 1600,
            viewportWidth: 1920,
        });
        expect(bounds.left).toBe(280 + OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX);
        expect(bounds.right).toBe(1600 - GUTTER);
        expect(bounds.width).toBe(bounds.right - bounds.left);
    });

    it("is never capped at 1280px on a wide band", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 80,
            bosRailLeft: 2480,
            viewportWidth: 2560,
        });
        expect(bounds.width).toBeGreaterThan(1280);
    });

    it("anchors left to the sidebar regardless of band width (never horizontally centered)", () => {
        const narrow = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: 900,
            viewportWidth: 1280,
        });
        const wide = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: 1800,
            viewportWidth: 1920,
        });
        // Centering would shift `left` rightward as the band grows; the operational band must not.
        expect(narrow.left).toBe(wide.left);
        expect(narrow.left).toBe(280 + OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX);
    });

    it("falls back to the viewport right edge when the BOS rail is unmeasured", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 280,
            bosRailLeft: null,
            viewportWidth: 1440,
        });
        expect(bounds.right).toBe(1440 - GUTTER);
        expect(bounds.left).toBe(280 + OPERATIONAL_WORKSPACE_LEFT_CLEARANCE_PX);
    });

    it("floating/closed presentation expands full band (bosRailLeft ignored via null)", () => {
        const floating = computeOperationalWorkspaceBounds({
            sidebarRight: 56,
            bosRailLeft: null,
            viewportWidth: 1440,
        });
        const pinned = computeOperationalWorkspaceBounds({
            sidebarRight: 56,
            bosRailLeft: 1100,
            viewportWidth: 1440,
        });
        expect(floating.width).toBeGreaterThan(pinned.width);
        expect(floating.right).toBe(1440 - GUTTER);
    });

    it("honors explicit gutter and clearance overrides", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 200,
            bosRailLeft: 1700,
            viewportWidth: 1920,
            gutterPx: 24,
            leftClearancePx: 8,
        });
        expect(bounds.left).toBe(208);
        expect(bounds.right).toBe(1676);
    });

    it("never produces a negative width", () => {
        const bounds = computeOperationalWorkspaceBounds({
            sidebarRight: 1000,
            bosRailLeft: 1010,
            viewportWidth: 1100,
        });
        expect(bounds.width).toBeGreaterThanOrEqual(0);
    });
});

describe("resolveOperationalBosRailLeft", () => {
    it("only pinned presentation reserves rail width", () => {
        expect(
            resolveOperationalBosRailLeft({
                bosPresentation: "floating",
                overlayLeft: 1200,
                columnLeft: 1200,
            }),
        ).toBeNull();
        expect(
            resolveOperationalBosRailLeft({
                bosPresentation: "closed",
                overlayLeft: 1200,
                columnLeft: 1200,
            }),
        ).toBeNull();
        expect(
            resolveOperationalBosRailLeft({
                bosPresentation: "pinned",
                overlayLeft: 1200,
                columnLeft: 1100,
            }),
        ).toBe(1200);
        expect(
            resolveOperationalBosRailLeft({
                bosPresentation: "pinned",
                overlayLeft: null,
                columnLeft: 1100,
            }),
        ).toBe(1100);
    });
});

describe("the write is idempotent — the other half of the pinned-BOS freeze fix", () => {
    // These vars size the operational surface, and when BOS is pinned that surface shares a
    // flex row with the rail this module measures. An unconditional write therefore resizes
    // an observed element every pass, guaranteeing another notification even when nothing
    // moved. A settled layout must produce no mutation at all.
    function rootStub(): HTMLElement {
        const values = new Map<string, string>();
        let writes = 0;
        return {
            style: {
                getPropertyValue: (n: string) => values.get(n) ?? "",
                setProperty: (n: string, v: string) => { writes += 1; values.set(n, v); },
                removeProperty: (n: string) => { values.delete(n); },
            },
            // exposed for assertions
            get __writes() { return writes; },
        } as unknown as HTMLElement & { __writes: number };
    }

    it("writes on the first pass and not again when the bounds are unchanged", () => {
        const root = rootStub() as HTMLElement & { __writes: number };
        const bounds = { left: 296, right: 1240, width: 944 };

        expect(applyOperationalWorkspaceGeometryVars(root, bounds)).toBe(true);
        const afterFirst = root.__writes;
        expect(afterFirst).toBe(3);

        expect(applyOperationalWorkspaceGeometryVars(root, bounds)).toBe(false);
        expect(root.__writes).toBe(afterFirst);
    });

    it("writes again — and reports it — when the band genuinely moves", () => {
        const root = rootStub() as HTMLElement & { __writes: number };
        applyOperationalWorkspaceGeometryVars(root, { left: 296, right: 1240, width: 944 });
        expect(applyOperationalWorkspaceGeometryVars(root, { left: 296, right: 1100, width: 804 })).toBe(true);
    });

    it("writes only the properties that changed", () => {
        const root = rootStub() as HTMLElement & { __writes: number };
        applyOperationalWorkspaceGeometryVars(root, { left: 296, right: 1240, width: 944 });
        const before = root.__writes;
        // Same left, moved right edge: two properties change, one does not.
        applyOperationalWorkspaceGeometryVars(root, { left: 296, right: 1100, width: 804 });
        expect(root.__writes - before).toBe(2);
    });
});
