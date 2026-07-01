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

    it("lifecycle sibling selection navigates via resolveLifecycleSiblingNavHref + router.push (no in-page switch)", () => {
        // The sibling switch resolves a canonical route (keyed → slug, keyless → dept-nested) and
        // navigates to it. The in-page activeWorkUnitId switcher has been removed entirely.
        expect(page).toContain("resolveLifecycleSiblingNavHref(siblingNavRow)");
        expect(page).toMatch(/router\.push\(siblingNavHref\);\s*return;/);
        expect(page).not.toContain("setActiveWorkUnitId");
        expect(page).not.toContain("applyActiveLifecycleWorkUnitSelection");
        expect(page).not.toContain("replaceWorkUnitLocationHref");
    });
});
