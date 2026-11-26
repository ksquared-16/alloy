import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildInquirySummaryRightColumnModel } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildInquirySummaryRightColumn";
import { buildDrawerEnrichmentState } from "@/lib/adminV2/drawerPipeline/enrichmentState";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("opportunity orchestrator handoff on drawer_primary", () => {

    it("inquiry right column no longer reserves orchestrator handoff slot", () => {
        const enrichment = buildDrawerEnrichmentState({
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: false,
        });
        const model = buildInquirySummaryRightColumnModel({
            record: { id: "opp-1" },
            enrichment,
            below_fold_enrichment_ready: true,
            task_assist_enabled: true,
        });
        expect(model.orchestrator_handoff.visible).toBe(false);
    });

    it("compact strip does not render lower handoff card", () => {
        const strip = readFileSync(
            join(webRoot, "components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"),
            "utf8",
        );
        expect(strip).toContain("const showHandoffCard = false");
    });
});
