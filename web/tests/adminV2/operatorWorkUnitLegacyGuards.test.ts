/** @vitest-environment node */

/**
 * Operator Work Unit — legacy quarantine guards.
 *
 * Forensic finding (this sprint): there is NO legacy Work Unit renderer or route reachable from
 * operator surfaces. The canonical operator route `/workspace/work-unit/:slug` mounts
 * WorkUnitSlugRouteHost → PresentationRuntime surface="work-unit" → the PRV2 WorkUnitSurface, with
 * no legacy fallback branch; Open-Process / drill hrefs are always the canonical route. The
 * "Enrollment (legacy)" label an operator can see is a DATABASE value (a lifecycle catalog / work
 * unit row literally named that) rendered by the canonical surface — not code, and not a legacy
 * renderer. These guards LOCK that state so a legacy Work Unit path cannot be reintroduced.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";

const web = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("Operator Work Unit — legacy quarantine guards", () => {
    it("Open-Process / drill hrefs are ALWAYS the canonical /workspace/work-unit/ route", () => {
        expect(operatorWorkUnitHrefFromKey("enrollment_pipeline")).toMatch(/^\/workspace\/work-unit\//);
        expect(operatorWorkUnitHrefFromKey("new_leads", "opp-1")).toMatch(
            /^\/workspace\/work-unit\/[^/]+\/opp-1$/,
        );
        // The metric drill builder resolves through the canonical href builder, never a legacy path.
        expect(read("lib/presentation/runtime/types.ts")).toContain(
            "operatorWorkUnitHrefFromKey(contract.workUnitKey)",
        );
    });

    it("the operator Work Unit route renders the canonical PRV2 surface (no legacy fallback branch)", () => {
        expect(read("app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx")).toContain(
            "WorkUnitSlugRouteHost",
        );
        expect(read("components/admin/workspace/WorkUnitSlugRouteHost.tsx")).toContain('surface="work-unit"');
        expect(read("components/presentation/PresentationRuntime.tsx")).toContain("WorkUnitSurface");
    });

    it("the deprecated /workspace/dept work-unit route does not exist", () => {
        expect(existsSync(resolve(web, "app/adminV2/workspace/dept"))).toBe(false);
    });

    it("the operator Work Unit surface tree never renders '(legacy)' nor imports the legacy drawer", () => {
        for (const rel of [
            "components/presentation/workUnit/WorkUnitSurface.tsx",
            "components/presentation/workUnit/QueueRegion.tsx",
            "components/presentation/workUnit/CondensedQueueRow.tsx",
            "components/presentation/workUnit/FocusPanelSurface.tsx",
            "components/presentation/PresentationRuntime.tsx",
        ]) {
            const src = read(rel);
            expect(src, `${rel} must not render a (legacy) literal`).not.toMatch(/\(legacy\)/i);
            expect(src, `${rel} must not import the legacy drawer`).not.toContain("AdminEntityDrawerLegacy");
        }
    });

    it("the legacy drawer runtime is deleted and suppressed on operator Work Unit surfaces", () => {
        const src = read("components/admin/AdminEntityDrawer.tsx");
        expect(src).toContain("isWorkUnitQueueSurfacePath");
        expect(src).not.toContain("AdminEntityDrawerLegacy");
        const guardIdx = src.indexOf("isWorkUnitQueueSurfacePath(pathname)");
        const returnNullIdx = src.indexOf("return null;");
        expect(guardIdx).toBeGreaterThan(-1);
        expect(returnNullIdx).toBeGreaterThan(guardIdx);
    });

    it("ProcessSummaryCard uses the model's canonical href, never a hand-built legacy/admin path", () => {
        const card = read("components/presentation/workspace/ProcessSummaryCard.tsx");
        expect(card).toContain("href={drillHref}");
        expect(card).not.toMatch(/href=["'`]\/(adminV2|legacy-admin|admin)\b/);
        expect(card).not.toMatch(/\(legacy\)/i);
    });
});
