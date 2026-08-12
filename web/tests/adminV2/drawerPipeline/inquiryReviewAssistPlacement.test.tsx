import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { OpportunityInquirySummaryRightColumn } from "@/components/admin/opportunity/OpportunityInquirySummaryRightColumn";
import { buildInquirySummaryRightColumnModel } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildInquirySummaryRightColumn";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const minimalAttention = (): OpportunityAttentionResult => ({
    needs_attention: true,
    reasons: [
        {
            code: "stale_new_inquiry",
            label: "New inquiry is stale",
            severity: "medium",
            sla_tier: "breached",
            sla_clock_confidence: "low",
        },
    ],
    primary_reason: {
        code: "stale_new_inquiry",
        label: "New inquiry is stale",
        severity: "medium",
        sla_tier: "breached",
        sla_clock_confidence: "low",
    },
    waiting: { bucket: "none", since_iso: null, active: false },
    priority_score: 1,
    priority_breakdown: [],
    auxiliary: { activity_stale: null },
    resolver_version: 2,
    computed_at_iso: "2026-05-13T12:00:00.000Z",
});

describe("inquiry Review Assist placement", () => {

    it("renders review assist in inquiry summary right column", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const overview = {
            id: "opp-1",
            _operational_attention: minimalAttention(),
            _operational_recommendation: rec,
        };
        const model = buildInquirySummaryRightColumnModel({
            record: { ...overview, _record_surface: "drawer_primary" },
            enrichment: {
                record_surface: "drawer_primary",
                primary_loaded: true,
                full_pending: true,
                full_complete: false,
                background_full_failed: false,
                enrichment_held_until_interaction: false,
            },
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        const html = renderToStaticMarkup(
            <OpportunityInquirySummaryRightColumn
                model={model}
                opportunityId="opp-1"
                overviewData={overview}
            />
        );
        expect(html).toContain('data-drawer-slot="inquiry_summary_review_assist"');
        expect(html).toContain("New inquiry needs timely response");
        expect(html).toContain('data-inquiry-summary-right-column="true"');
    });
});
