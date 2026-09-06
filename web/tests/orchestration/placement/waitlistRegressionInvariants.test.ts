import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

/**
 * Track B — waitlist architecture invariants.
 *
 * ── WHAT BELONGS IN THIS FILE, AND WHAT NO LONGER DOES ──
 *
 * A source-level assertion is the right tool for exactly one kind of contract: a property of the
 * MODULE GRAPH or of forbidden content, which has no runtime value to observe. "This module is the
 * one that resolves sections", "this seed file must never contain a production label" — a
 * behavioural test cannot see the *absence* of a second implementation, so reading the source is
 * not a shortcut, it is the only instrument.
 *
 * It is the wrong tool for anything with a runtime answer. This file used to assert:
 *
 *   - `toContain("shadow_mode: true")` and `not.toMatch(/shadow_mode:\s*false/)` — the default of the
 *     boolean that decides whether the waitlist is ordered at all;
 *   - `toContain("skipPlacementProjection ? true : placementResolved.options.shadow_mode")` — an
 *     EXACT TERNARY SOURCE EXPRESSION, which a Prettier reflow breaks and a behavioural inversion
 *     that preserved the characters would pass;
 *   - that ANOTHER TEST FILE contained two particular test-name strings — a test asserting a test
 *     exists by name, which survives that test being emptied;
 *   - `toMatch(/site_id|placement_candidate/)` against a queue module — an alternation over two
 *     tokens so common in this file as to be unfalsifiable.
 *
 * Those are now behaviour, in `waitlistShadowModeBehaviour.test.ts` (shadow on/off ordering and
 * manual-position application, each with a positive control) and in the section-presentation and
 * site-scope suites that own those questions directly. What remains below is only the graph and
 * forbidden-content kind.
 */
describe("waitlist architecture invariants (source-level by nature)", () => {
    it("section grouping is owned by the canonical resolver, not re-implemented in the queue", () => {
        // Ownership: exactly one module decides waitlist sections.
        expect(read("lib/orchestration/placement/waitlistQueueSectionPresentation.ts")).toContain(
            "resolveWaitlistQueueSection",
        );
        // The queue must consume it rather than deriving its own sectioning.
        const queue = read("lib/queues/candidateGrainWaitlistQueue.ts");
        expect(queue).not.toContain("function resolveWaitlistQueueSection");
    });

    it("the candidate-grain queue evaluates through the canonical V2 engine and household context", () => {
        // Graph wiring: these are the owners this path must call, not a value to observe at runtime.
        const src = read("lib/queues/candidateGrainWaitlistQueue.ts");
        expect(src).toContain("applyPlacementV2ToOpportunityQueueRows");
        expect(src).toContain("loadPlacementEvaluationHouseholdContext");
    });

    it("demo seed scenarios never carry a production location label", () => {
        // Forbidden content: there is no runtime observation of "this string is absent from a seed file".
        const scenarios = read("lib/orchestration/placement/waitlistDemoScenarios.ts");
        expect(scenarios).not.toContain("Waitlist Demo - North Campus");
        expect(scenarios).toContain("waitlist_demo_");
    });
});
