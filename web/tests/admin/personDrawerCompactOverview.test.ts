import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("person drawer compact overview", () => {
    it("AdminEntityDrawer uses compact overview and name-only header", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("usePersonCompactOverview");
        expect(drawer).toContain("PersonDrawerCompactOverview");
        expect(drawer).not.toMatch(/Person: \$\{/);
    });

    it("compact overview surfaces employee status above the fold", () => {
        const compact = read("components/admin/entity/PersonDrawerCompactOverview.tsx");
        expect(compact).toContain("PersonEmployeePlacementSection");
        expect(compact).toContain("Employee status");
        expect(compact).not.toContain("person_number");
    });

    it("renders PersonDrawerCompactOverview outside useConfigDrivenOverview gate", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        const nonConfigIdx = drawer.indexOf('drawerTab === "overview" && !useConfigDrivenOverview');
        const configIdx = drawer.indexOf("useConfigDrivenOverview &&");
        const compactIdx = drawer.indexOf("<PersonDrawerCompactOverview");
        expect(nonConfigIdx).toBeGreaterThan(-1);
        expect(compactIdx).toBeGreaterThan(nonConfigIdx);
        const configBlock = drawer.slice(configIdx, configIdx + 12000);
        expect(configBlock).not.toContain("<PersonDrawerCompactOverview");
    });

    it("person loading shell is gated on active fetch loading only", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("personDrawerShowLoadingShell");
        expect(drawer).toContain("personDrawerExistingReady");
        const shellBlock = drawer.slice(
            drawer.indexOf("const personDrawerShowLoadingShell"),
            drawer.indexOf("const personDrawerShowLoadingShell") + 420
        );
        expect(shellBlock).toContain("loading");
        expect(shellBlock).not.toContain("drawerGateLoading");
    });

    it("async hydrates guard against drawer target key drift", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("drawerEntityTargetKeyRef");
        expect(drawer).toContain("drawerEntityTargetKeyRef.current !== requestedTargetKey");
        expect(drawer).toContain("drawerEntityTargetKeyRef.current !== oppTargetKey");
    });
});
