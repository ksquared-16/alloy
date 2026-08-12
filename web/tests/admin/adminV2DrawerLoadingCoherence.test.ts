import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
    ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS,
    shouldCloseAdminV2DrawerOnOutsideTarget,
} from "@/lib/adminV2/drawerOutsideClick";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

/** Minimal Element mock for `closest()` contract tests (node test env). */
class MockClosestNode {
    constructor(
        public attrs: Record<string, string>,
        public parent?: MockClosestNode,
    ) {}

    closest(selector: string): MockClosestNode | null {
        const m = /\[([^=\]]+)(?:="([^"]*)")?\]/.exec(selector);
        if (!m) return null;
        const [, attr, val] = m;
        let cur: MockClosestNode | undefined = this;
        while (cur) {
            if (attr in cur.attrs && (val === undefined || cur.attrs[attr] === val)) return cur;
            cur = cur.parent;
        }
        return null;
    }
}

function mockTarget(attrs: Record<string, string>, parent?: MockClosestNode): EventTarget {
    return new MockClosestNode(attrs, parent) as unknown as EventTarget;
}

describe("AdminV2 drawer outside click", () => {
    it("ignores drawer panel and command bar targets", () => {
        const drawerPanel = mockTarget({ "data-adminv2-drawer": "true" });
        const commandBar = mockTarget({ "data-adminv2-ai-command-bar": "" });
        const commandSurface = mockTarget({ "data-adminv2-ai-command-surface": "" });
        const outside = mockTarget({});

        expect(shouldCloseAdminV2DrawerOnOutsideTarget(drawerPanel)).toBe(false);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(commandBar)).toBe(false);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(commandSurface)).toBe(false);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(outside)).toBe(true);
        expect(
            shouldCloseAdminV2DrawerOnOutsideTarget(
                mockTarget({ "data-current-work-detail-popover": "true" }),
            ),
        ).toBe(false);
    });

    it("ignores nested targets inside the drawer panel", () => {
        const panel = new MockClosestNode({ "data-adminv2-drawer": "true" });
        const inner = mockTarget({}, panel);
        expect(shouldCloseAdminV2DrawerOnOutsideTarget(inner)).toBe(false);
    });

    it("Drawer wires mousedown listener with cleanup", () => {
        const src = read("components/admin/Drawer.tsx");
        expect(src).toContain("shouldCloseAdminV2DrawerOnOutsideTarget");
        expect(src).toContain('document.addEventListener("mousedown", onMouseDown)');
        expect(src).toContain('document.removeEventListener("mousedown", onMouseDown)');
        expect(src).toContain("pointer-events-none");
    });

    it("exports stable ignore selectors for command bar surfaces", () => {
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain("[data-adminv2-ai-command-bar]");
        expect(ADMINV2_DRAWER_OUTSIDE_CLICK_IGNORE_SELECTORS).toContain("[data-adminv2-ai-command-surface]");
    });
});

describe("Deferred opportunity drawer open (first-paint gate)", () => {

    it("does not force a 1500ms wait before commit", () => {
        const lib = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        expect(lib).not.toContain("1500");
        expect(lib).toContain("OPPORTUNITY_DRAWER_OPEN_ANTI_FLICKER_MS");
    });
});

describe("Drawer opportunity header grouped loading", () => {

    it("WU route skeleton uses dept-like queue cards and corner status chip", () => {
        const src = read("components/admin/workspace/workspaceRouteSkeletons.tsx");
        expect(src).toContain("QueueCardSkeleton");
        expect(src).toContain("WorkUnitOperLaneStatusChip");
        expect(src).toContain("adminv2-ws-dept-qsec");
        expect(src).toContain("adminv2-ws-work-unit-route-loading");
        expect(src).not.toContain("WorkUnitOperLaneSpinner");
    });

    it("WU route loading applies subtle pine accent in workspace css", () => {
        const css = read("app/adminV2/components/workspace/workspace.css");
        expect(css).toContain("adminv2-ws-work-unit-route-loading");
        expect(css).toMatch(/border-left:[\s\S]*?var\(--d-pine\)/);
    });

});

describe("Drawer operational bootstrap (Cards 4–7)", () => {

    it("composed open gates on primary contract, not surface=full", () => {
        const coord = read("lib/admin/opportunityDrawerOpenCoordinator.ts");
        const gateFn = coord.match(
            /export function opportunityDrawerComposedRevealReady\(preload[\s\S]*?\n\}/,
        )?.[0];
        expect(gateFn).toBeTruthy();
        expect(gateFn).toContain("opportunityDrawerPrimaryContractReady");
        expect(gateFn).not.toContain("fullEntity");
        expect(gateFn).not.toContain("enrichmentHeldUntilInteraction");
        expect(coord).toContain("peekOpportunityDrawerFullEntity");
        expect(coord).toMatch(/prefetchHit = bootstrapWarm && primaryWarm/);
    });

});

describe("Opportunity drawer first-paint contract", () => {
    it("defines primary contract and first-paint gates in shared module", () => {
        const mod = read("lib/admin/drawer/opportunityDrawerFirstPaintContract.ts");
        expect(mod).toContain("opportunityDrawerPrimaryContractReady");
        expect(mod).toContain("opportunityDrawerFirstPaintActive");
        expect(mod).toContain("filterOpportunityOverviewSectionsForFirstPaint");
    });

});
