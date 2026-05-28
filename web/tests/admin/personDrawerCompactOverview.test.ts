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
});
