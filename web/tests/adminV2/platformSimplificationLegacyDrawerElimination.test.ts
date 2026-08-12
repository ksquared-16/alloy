/**
 * Platform Simplification Phase 4 — legacy drawer runtime eliminated.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());
const legacyPath = join(webRoot, "components/admin/AdminEntityDrawerLegacy.tsx");
const routerPath = join(webRoot, "components/admin/AdminEntityDrawer.tsx");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("platform simplification — legacy drawer elimination", () => {
    it("AdminEntityDrawerLegacy.tsx is deleted", () => {
        expect(existsSync(legacyPath)).toBe(false);
    });

    it("kill-switch gates are permanently on for VM runtimes", () => {
        expect(read("lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate.ts")).not.toContain(
            "NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH",
        );
        expect(read("lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate.ts")).not.toContain(
            "NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH",
        );
        expect(read("lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate.ts")).not.toContain(
            "NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH",
        );
    });

    it("settings locations do not use legacy drawer create", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).not.toContain("useAdminDrawer");
        expect(page).not.toContain("openDrawer");
    });
});
