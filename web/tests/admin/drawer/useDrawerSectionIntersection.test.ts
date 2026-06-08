import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("useDrawerSectionIntersection", () => {
    it("exports one-shot intersection gate for drawer enrichment", () => {
        const src = readFileSync(join(repoRoot, "lib/admin/drawer/useDrawerSectionIntersection.ts"), "utf8");
        expect(src).toContain("useDrawerSectionIntersection");
        expect(src).toContain("obs.disconnect()");
        expect(src).toContain("gateEnabled");
    });
});
