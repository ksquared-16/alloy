import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { resolveLifecycleSiblingNavHref } from "@/lib/lifecycle/lifecycleSiblingNavTarget";
import type { LifecycleSiblingWorkUnitNavRow } from "@/lib/lifecycle/lifecycleWorkUnitShellPills";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

function row(partial: Partial<LifecycleSiblingWorkUnitNavRow>): LifecycleSiblingWorkUnitNavRow {
    return { id: "wu-uuid", name: "Stage", total: null, ...partial };
}

describe("resolveLifecycleSiblingNavHref — sibling switch routes to the canonical slug", () => {
    it("prefers nav_platform_key → canonical /workspace/work-unit/:slug", () => {
        const href = resolveLifecycleSiblingNavHref(row({ nav_platform_key: "new_leads", key: "other" }));
        expect(href).toBe("/workspace/work-unit/new-leads");
    });

    it("falls back to the work-unit key when nav_platform_key is absent", () => {
        expect(resolveLifecycleSiblingNavHref(row({ key: "tour_scheduling" }))).toBe(
            "/workspace/work-unit/tour-scheduling",
        );
    });

    it("returns null (→ legacy in-page fallback) when no platform key is resolvable", () => {
        expect(resolveLifecycleSiblingNavHref(row({ key: null, nav_platform_key: null }))).toBeNull();
        expect(resolveLifecycleSiblingNavHref(row({ key: "   " }))).toBeNull();
        expect(resolveLifecycleSiblingNavHref(null)).toBeNull();
        expect(resolveLifecycleSiblingNavHref(undefined)).toBeNull();
    });
});

describe("Work-Unit compat page wires sibling switching to canonical navigation", () => {
    const page = readSrc(
        "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
    );

    it("lifecycle sibling selection navigates via resolveLifecycleSiblingNavHref + router.push (not in-page state)", () => {
        // The sibling switch resolves a canonical route and pushes to it, returning BEFORE the
        // legacy in-page activeWorkUnitId switch path.
        expect(page).toContain("resolveLifecycleSiblingNavHref(siblingNavRow)");
        expect(page).toMatch(/if \(siblingNavHref\) \{\s*router\.push\(siblingNavHref\);\s*return;/);
        // The canonical-nav decision is positioned ahead of the in-page switch's queue mutation.
        const navIdx = page.indexOf("if (siblingNavHref)");
        const inPageIdx = page.indexOf('applyActiveLifecycleWorkUnitSelection(targetSelection, "lifecycleWuNav")');
        expect(navIdx).toBeGreaterThan(-1);
        expect(inPageIdx).toBeGreaterThan(navIdx);
    });
});
