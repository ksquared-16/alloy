import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

/** `typeof Foo` in a route must not reference symbols removed from imports (tsc only runs at build). */
function assertNoStaleTypeofReferences(routeRel: string, allowedTypeofSymbols: string[]): void {
    const src = read(routeRel);
    const head = src.slice(0, src.search(/\nexport\s+async\s+function/));
    const typeofSymbols = [...src.matchAll(/\btypeof\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]!);
    for (const sym of typeofSymbols) {
        if (!allowedTypeofSymbols.includes(sym)) {
            throw new Error(`${routeRel}: unexpected typeof ${sym}`);
        }
        expect(head, `${routeRel} must import ${sym} when using typeof ${sym}`).toContain(sym);
    }
}

describe("admin route typeof reference guard", () => {
    it("work-unit operational-bootstrap uses cached right rail + explicit action types", () => {
        const routeRel = "app/api/admin/work-units/[id]/operational-bootstrap/route.ts";
        const src = read(routeRel);
        expect(src).toContain("loadRightRailActionsBundleCached");
        expect(src).not.toContain("typeof loadRightRailActionsBundleServer");
        expect(src).not.toMatch(/loadRightRailActionsBundleServer/);
        assertNoStaleTypeofReferences(routeRel, ["loadWorkUnitKpiPlacementsServer"]);
    });
});
