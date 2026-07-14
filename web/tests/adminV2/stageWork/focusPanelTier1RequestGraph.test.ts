/**
 * Focus Panel Tier-1 first-paint request-graph guards. Deployed: Tier 1 was 1.4–1.7s and the panel
 * showed blank structural cards. The record's first paint must not fan out to person/child VMs,
 * activity, related graph, communications, or recipients, and the loading state must be ONE coherent
 * final-geometry skeleton — never multiple empty cards that rearrange.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const web = resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");

describe("Tier-1 compose defers the heavy secondary work", () => {
    const compose = read("lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts");

    it("communications preview and stage work are deferred out of the blocking compose", () => {
        expect(compose).toContain("deferCommunicationsPreview");
        expect(compose).toContain("deferStageWork");
        // The compose resolves the record + above-fold; it does not fetch activity / related / person
        // / child drawer VMs inline (those are client secondary loads).
        expect(compose).not.toContain("/api/admin/activity");
        expect(compose).not.toContain("/api/admin/related/");
        expect(compose).not.toMatch(/view-models\/drawer\/(person|child)/);
    });
});

describe("the related-graph secondary warm is bounded and off first paint", () => {
    it("is scheduler-held (not on the reveal path) and capped", () => {
        const warm = read("lib/adminV2/viewModel/drawer/vmRuntime/warmRelatedDrawerGraph.ts");
        expect(warm).toContain(".slice(0, RELATED_DRAWER_WARM_TARGET_CAP)");
        const schedule = read("lib/adminV2/viewModel/drawer/vmRuntime/drawerVmPayloadWarmRelated.ts");
        // Held through the central prewarm scheduler (drained after coordinated reveal), not eager.
        expect(schedule).toContain("scheduleDrawerVmPrewarm");
    });
});

describe("the Focus Panel loading state is one coherent final-geometry skeleton", () => {
    const panel = read("components/presentation/workUnit/InlineOpportunityFocusPanel.tsx");

    it("renders the published-grid skeleton (same grid as the resolved body), not ad-hoc empty cards", () => {
        expect(panel).toContain("FocusPanelSummarySkeleton");
    });

    it("holds the prior resolved grid across a record swap (no flash to a placeholder)", () => {
        expect(panel).toContain("holdPriorPayload");
    });
});
