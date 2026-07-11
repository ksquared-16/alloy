/** @vitest-environment node */

/**
 * Work Unit pill switching runtime — source guards for Excel-tab behavior.
 *
 * Same-host pill clicks swap queue rows + focus panel in place (no router.push).
 * Header/KPIs stay mounted; auto-open re-arms per view; stale focus clears on switch.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("useWorkUnitSurfaceRuntime — pill switching runtime guards", () => {
    const src = read("lib/presentation/runtime/useWorkUnitSurfaceRuntime.ts");
    const surfaceSrc = read("components/presentation/workUnit/WorkUnitSurface.tsx");

    it("same-host pill switch uses in-page localWorkViewId instead of router.push", () => {
        expect(src).toContain("localWorkViewId");
        expect(src).toContain('action.kind === "in-page"');
        expect(src).toContain("resolveSelectWorkViewAction");
        expect(src).toMatch(/if \(action\.kind === "in-page"\)[\s\S]*?return;/);
        expect(src).not.toContain("autoOpenDoneRef");
    });

    it("selectWorkView clears stale focus panel before swapping views", () => {
        expect(src).toMatch(/closeDrawer\(\)/);
        expect(src).toMatch(/forceAutoOpenViewRef\.current = action\.workViewId/);
        expect(src).toMatch(/autoOpenedForViewRef\.current = null/);
    });

    it("first-row auto-open re-arms per work view after queue settles", () => {
        expect(src).toContain("autoOpenedForViewRef");
        expect(src).toContain("shouldAutoOpenFirstRowForView");
        expect(src).toContain("forceAutoOpenViewRef");
    });

    it("cross-host pill switch still navigates via router.push", () => {
        expect(src).toMatch(/router\.push\(action\.href\)/);
    });

    it("pill counts refresh through queueRefreshNonce on OPPORTUNITY_QUEUE_UPDATED_EVENT", () => {
        expect(src).toContain("queueRefreshNonce");
        expect(src).toContain("OPPORTUNITY_QUEUE_UPDATED_EVENT");
        expect(src).toContain("refreshToken: queueRefreshNonce");
    });

    it("WorkUnitSurface keys by workUnitId only — header stays mounted on same-host pill switch", () => {
        expect(surfaceSrc).toMatch(/key=\{shownModel\.workUnitId/);
        expect(surfaceSrc).not.toMatch(/key=\{.*workViewId/);
    });

    it("fetch error does not clear queueResult (queue-lane hold on failure)", () => {
        expect(src).not.toContain("setQueueResult(null)");
    });
});
