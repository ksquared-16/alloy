import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isLeavingWorkUnitSurface } from "@/lib/admin/workUnitOutboundHold";

/**
 * Outbound skeleton suppression (Experience Layer Phase 0 #2).
 * The slug host must hold the prior stable surface when the URL has left this work unit,
 * never flash a work-unit cold shell on departure.
 * See docs/platform/experience/operational-experience-doctrine.md (Law 2, Continuity).
 */
describe("isLeavingWorkUnitSurface", () => {
    const HOST_SLUG = "new-leads";

    it("is NOT leaving while still on this work unit (arrival / in-lane)", () => {
        expect(isLeavingWorkUnitSurface("/workspace/work-unit/new-leads", HOST_SLUG)).toBe(false);
    });

    it("is NOT leaving when a record drawer is open on this work unit", () => {
        expect(
            isLeavingWorkUnitSurface("/workspace/work-unit/new-leads/opp-123", HOST_SLUG),
        ).toBe(false);
    });

    it("IS leaving when the URL is the workspace root (back to Workspace)", () => {
        expect(isLeavingWorkUnitSurface("/workspace", HOST_SLUG)).toBe(true);
    });

    it("IS leaving when the URL is a department (not a work-unit surface)", () => {
        expect(isLeavingWorkUnitSurface("/workspace/dept/dept-1", HOST_SLUG)).toBe(true);
    });

    it("IS leaving when the URL is a different work unit (incoming host owns its arrival)", () => {
        expect(isLeavingWorkUnitSurface("/workspace/work-unit/tours", HOST_SLUG)).toBe(true);
    });

    it("normalizes internal rewrite paths before matching (adminV2 → operator base)", () => {
        expect(
            isLeavingWorkUnitSurface("/adminV2/workspace/work-unit/new-leads", HOST_SLUG),
        ).toBe(false);
        expect(isLeavingWorkUnitSurface("/adminV2/workspace", HOST_SLUG)).toBe(true);
    });

    it("does not suppress when pathname is unknown (null/empty) — safe default", () => {
        expect(isLeavingWorkUnitSurface(null, HOST_SLUG)).toBe(false);
        expect(isLeavingWorkUnitSurface("", HOST_SLUG)).toBe(false);
    });
});

describe("WorkUnitSlugRouteHost wiring", () => {
    const host = readFileSync(
        path.join(process.cwd(), "components/admin/workspace/WorkUnitSlugRouteHost.tsx"),
        "utf8",
    );

    it("guards the cold shell with the outbound-hold predicate, returning null before it", () => {
        // The guard must short-circuit to `return null` BEFORE the cold shell renders.
        expect(host).toMatch(
            /isLeavingWorkUnitSurface\(pathname, workUnitSlug\)[\s\S]*return null[\s\S]*WorkUnitWorkspaceColdShell/,
        );
    });

    it("still renders the cold shell for genuine arrival (inbound first-load preserved)", () => {
        expect(host).toContain("WorkUnitWorkspaceColdShell");
        expect(host).toContain("warmWorkUnitSlugRoute");
    });
});
