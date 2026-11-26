/** @vitest-environment node */

/**
 * CP-1 / S4 — enforceable composition boundaries.
 *
 * The opportunity enriched drawer VM is composed from three OWNED modules with a real import direction:
 *   Shared Canonical Deps (C) ← Initial Panel (A, Tier-2)   and   ← Deferred Detail (B, Tier-3)
 * The orchestrator (`composeOpportunityDrawerViewModel`) is the ONLY layer that imports all three.
 *
 * These guards FAIL if the Initial Panel (Tier-2) can statically pull the Deferred Detail (Tier-3) into
 * its graph — the exact regression S4 exists to prevent.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string): string => readFileSync(join(webRoot, rel), "utf8");
const DIR = "lib/adminV2/viewModel/drawer/opportunity";

describe("drawer VM composition boundaries (S4)", () => {
    it("Initial Panel (Tier-2) imports NO Deferred Detail (Tier-3) implementation", () => {
        const a = read(`${DIR}/initialPanelResource.ts`);
        // Must not import Module B, nor the Tier-3 implementations B owns.
        expect(a).not.toContain("deferredDetailResource");
        expect(a).not.toContain("resolveOpportunityStageWorkSlice");
        expect(a).not.toContain("resolveFamilyCommunicationWorkspacePreview");
        expect(a).not.toContain("resolveStageOperatingPlanPurpose");
    });

    it("Deferred Detail (Tier-3) imports NO Initial Panel (Tier-2)", () => {
        const b = read(`${DIR}/deferredDetailResource.ts`);
        expect(b).not.toContain("initialPanelResource");
    });

    it("Shared Canonical Deps (C) imports neither tier", () => {
        const c = read(`${DIR}/sharedCanonicalDeps.ts`);
        expect(c).not.toContain("initialPanelResource");
        expect(c).not.toContain("deferredDetailResource");
    });

    it("the orchestrator composes all three owned modules", () => {
        const orch = read(`${DIR}/composeOpportunityDrawerViewModel.ts`);
        expect(orch).toContain("resolveSharedCanonicalDeps");
        expect(orch).toContain("buildInitialPanelResource");
        expect(orch).toContain("buildDeferredDetailResource");
    });
});
