/**
 * REGRESSION CONTROL — the removed serial round trip must not come back.
 *
 * `placement_candidates` was read TWICE in a row on the queue-critical path: the ensure pass reads it
 * inside its own concurrent wave to decide what to insert, and `bulkLoadPlacementCandidatesByOpportunity`
 * then read the same table with the same org + opportunity filter as the NEXT SERIAL step. Widening
 * the read already in the wave costs nothing extra there and lets the serial step disappear.
 *
 * Measured, matched, same host and database session: the waitlist leg's steady state fell from
 * ~550 ms to ~405 ms. This guard fails if the reuse is removed, or if queue truth starts depending
 * on deferred enrichment to obtain its candidates.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const WAITLIST = "lib/runtime/provisioning/attachChildGrainWaitlistPlacement.ts";
const ENSURE = "lib/orchestration/placement/placementCandidateLifecycleHook.ts";
const LOADER = "lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity.ts";

describe("queue-critical serial round trips", () => {
    it("the waitlist step reuses the candidates the ensure pass already read", () => {
        const s = strip(read(WAITLIST));
        expect(s).toMatch(/preloadedRows:\s*reusableCandidateRows/);
        expect(s, "reuse must be conditional on nothing having been inserted")
            .toMatch(/ensureResult\.created === 0/);
    });

    it("the ensure pass returns those rows in the loader's own shape", () => {
        const s = strip(read(ENSURE));
        expect(s).toMatch(/PLACEMENT_CANDIDATE_QUEUE_SELECT/);
        expect(s).toMatch(/candidateRows/);
        // The narrow seed-key-only read is what forced the second trip.
        expect(s, "the widened read must not revert to seed_key only")
            .not.toMatch(/from\("placement_candidates"\)\s*\.select\("seed_key"\)/);
    });

    it("the loader remains the ONE place candidate rows become queue truth", () => {
        const s = strip(read(LOADER));
        expect(s).toMatch(/preloadedRows/);
        // Preloaded rows are re-filtered by the same predicate the query applies, so a caller
        // cannot widen the result set.
        expect(s).toMatch(/idSet\.has\(oppId\)/);
        expect(s).toMatch(/activeOnly !== false && r\.status !== "active"/);
    });

    it("a pass that CREATED candidates still re-reads — the rows predate the insert", () => {
        const s = strip(read(WAITLIST));
        const m = s.match(/const reusableCandidateRows =[\s\S]{0,200}?;/);
        expect(m, "reuse expression not found").toBeTruthy();
        expect(m![0]).toMatch(/created === 0/);
        expect(m![0]).toMatch(/:\s*null/);
    });

    it("POSITIVE CONTROL — an unconditional loader call fails this guard", () => {
        // Models the pre-change caller: no preloadedRows, so the serial read returns.
        const preChange = `
            const candidatesByOpportunityId = await bulkLoadPlacementCandidatesByOpportunity({
                supabase: params.supabase, orgId: params.orgId, opportunityIds, activeOnly: false,
            });`;
        expect(/preloadedRows:\s*reusableCandidateRows/.test(preChange),
            "the guard must reject the pre-change call shape").toBe(false);
    });
});
