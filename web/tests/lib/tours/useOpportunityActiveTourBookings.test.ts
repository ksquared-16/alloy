import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("useOpportunityActiveTourBookings", () => {
    it("gates fetch on enabled flag", () => {
        const src = readFileSync(join(repoRoot, "lib/tours/hooks/useOpportunityActiveTourBookings.ts"), "utf8");
        expect(src).toContain("enabled = true");
        expect(src).toContain("if (!enabled || !oid)");
    });
});
