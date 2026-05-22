import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { drawerOperationalStripReady } from "@/lib/adminV2/drawerPipeline/layoutLock";
import { buildDrawerEnrichmentState } from "@/lib/adminV2/drawerPipeline/enrichmentState";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("opportunity orchestrator handoff on drawer_primary", () => {
    it("drawerOperationalStripReady is true for primary contract without full", () => {
        const enrichment = buildDrawerEnrichmentState({
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: false,
        });
        expect(enrichment.primary_loaded).toBe(true);
        expect(enrichment.full_complete).toBe(false);
        expect(drawerOperationalStripReady(true, false, enrichment)).toBe(true);
    });

    it("inquiry summary uses atomic right_column model for handoff on primary", () => {
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("rightColumnModel");
        expect(drawer).toContain("OpportunityInquirySummaryRightColumn");
        const strip = readFileSync(
            join(webRoot, "components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"),
            "utf8"
        );
        expect(strip).toContain('data-drawer-slot="operational_orchestrator_handoff"');
        expect(strip).toContain("Continue in Orchestrator");
        expect(strip).toContain("showHandoffCard");
    });
});
