import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FROZEN CONTRACT — compute placement beside the Oregon primary.
 *
 * Law 15 of docs/platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md. This was the one
 * load-bearing contract of that programme with NO durable guard: a config file cannot carry its
 * own reason, and `regions` looks exactly like the kind of line someone deletes while tidying.
 *
 * Every server-side data call is an HTTPS request to the Supabase REST API, and the primary is
 * West US (Oregon) / AWS us-west-2. Vercel's default iad1 cost ~116ms per REST hop; pdx1 reduced
 * it to ~37ms. Note that sfo1 is us-west-1 — a DIFFERENT AWS region — so the intuitive "US West"
 * choice is not co-located and would silently undo this.
 *
 * Rationale: docs/platform/governance/deployment-and-environments.md, "Compute placement".
 * Removing pdx1 requires a new topology measurement and an explicit architecture decision.
 */
const vercelConfig = JSON.parse(readFileSync(join(__dirname, "../../vercel.json"), "utf8")) as {
    regions?: unknown;
};

describe("frozen runtime placement", () => {
    it("pins compute to exactly one region", () => {
        expect(Array.isArray(vercelConfig.regions)).toBe(true);
        expect(vercelConfig.regions).toHaveLength(1);
    });

    it("that region is pdx1, beside the us-west-2 primary", () => {
        expect(vercelConfig.regions).toEqual(["pdx1"]);
    });

    it("is not a region that only reads as US West", () => {
        // sfo1 is us-west-1 and iad1 is the us-east-1 default. Both are wrong here, and both are
        // the plausible edits — which is the whole reason this guard exists.
        const regions = (vercelConfig.regions ?? []) as string[];
        expect(regions).not.toContain("sfo1");
        expect(regions).not.toContain("iad1");
    });

    it("POSITIVE CONTROL — the assertion can fail", () => {
        // If this guard ever passes because it is reading nothing, the control fails first.
        expect(() => {
            const decoy = { regions: ["iad1"] };
            expect(decoy.regions).toEqual(["pdx1"]);
        }).toThrow();
    });
});
