import { describe, expect, it } from "vitest";
import {
    buildDrawerEnrichmentState,
    drawerRelationshipsFullHydrateFailed,
} from "@/lib/adminV2/drawerPipeline/enrichmentState";

describe("buildDrawerEnrichmentState", () => {
    it("does not treat primary surface as background full failure", () => {
        const enrichment = buildDrawerEnrichmentState({
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: false,
        });
        expect(enrichment.full_pending).toBe(true);
        expect(drawerRelationshipsFullHydrateFailed(enrichment)).toBe(false);
    });

    it("warns only when background full failed", () => {
        const enrichment = buildDrawerEnrichmentState({
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: true,
        });
        expect(drawerRelationshipsFullHydrateFailed(enrichment)).toBe(true);
        expect(enrichment.full_pending).toBe(false);
    });

    it("marks full complete on surface=full", () => {
        const enrichment = buildDrawerEnrichmentState({
            record: { id: "opp-1", _record_surface: "full" },
            drawer_id: "opp-1",
            background_full_failed: false,
        });
        expect(enrichment.full_complete).toBe(true);
        expect(enrichment.full_pending).toBe(false);
    });
});
