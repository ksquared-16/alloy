import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

/** Track B — waitlist architecture invariants (no drawer coupling). */
describe("waitlist regression invariants", () => {
    it("keeps placement queue shadow_mode default true in candidate grain path", () => {
        const src = read("lib/queues/candidateGrainWaitlistQueue.ts");
        expect(src).toContain("shadow_mode: true");
        expect(src).not.toMatch(/shadow_mode:\s*false/);
    });

    it("groups waitlist by org program category, not room duplicates", () => {
        const presentation = read("lib/orchestration/placement/waitlistQueueSectionPresentation.ts");
        expect(presentation).toContain("resolveWaitlistQueueSection");
        const testSrc = read("tests/orchestration/placement/waitlistQueueSectionPresentation.test.ts");
        expect(testSrc).toContain("collapses duplicate infant keys");
        expect(testSrc).toContain("rolls room-level toddler labels into one org toddler section");
    });

    it("scopes waitlist rows to placement_candidate site_id", () => {
        const siteScope = read("tests/queues/candidateGrainWaitlistSiteScope.test.ts");
        expect(siteScope).toBeTruthy();
        const queue = read("lib/queues/candidateGrainWaitlistQueue.ts");
        expect(queue).toMatch(/site_id|placement_candidate/);
    });

    it("keeps demo seed keys isolated from North Campus contamination label", () => {
        const scenarios = read("lib/orchestration/placement/waitlistDemoScenarios.ts");
        expect(scenarios).not.toContain("Waitlist Demo - North Campus");
        expect(scenarios).toContain("waitlist_demo_");
    });
});
