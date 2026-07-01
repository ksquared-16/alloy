import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("AdminV2 Forms sidebar nav FD-12", () => {
    it("includes Forms module link with active route prefix", () => {
        const src = readFileSync(join(webRoot, "app/adminV2/components/Sidebar.tsx"), "utf8");
        expect(src).toContain("CANONICAL_OPERATOR_BASE");
        expect(src).not.toMatch(/href:\s*"\/adminV2\/workspace/);
    });
});
