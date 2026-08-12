import { describe, expect, it } from "vitest";

import { buildOperationalPriorityExplainability } from "@/lib/adminV2/bos/recommendations/operationalPriorityExplainability";
import { BOS_ASSIST_CTA_DRAWER } from "@/lib/adminV2/bos/bosDrawerAssistHandoff";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import BosDrawerAssistCta from "@/components/admin/drawer/BosDrawerAssistCta";
import { OpportunityInquirySummaryRightColumn } from "@/components/admin/opportunity/OpportunityInquirySummaryRightColumn";
import { buildInquirySummaryRightColumnModel } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildInquirySummaryRightColumn";
import { buildDrawerEnrichmentState } from "@/lib/adminV2/drawerPipeline/enrichmentState";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("BOS final quality pass", () => {
    it("uses Work with BOS label", () => {
        expect(BOS_ASSIST_CTA_DRAWER).toBe("Work with BOS");
    });

    it("BOS CTA uses OpportunityDrawerHeaderActionButton primitive", () => {
        const ctaSrc = readFileSync(join(webRoot, "components/admin/drawer/BosDrawerAssistCta.tsx"), "utf8");
        expect(ctaSrc).toContain('data-bos-assist-button="true"');
        expect(ctaSrc).toContain("OpportunityDrawerHeaderActionButton");
        expect(ctaSrc).toContain("OpportunityDrawerHeaderActionsPanel");
        expect(ctaSrc).not.toContain("OPPORTUNITY_DRAWER_SECTION_SECONDARY_BUTTON_CLASS");
        expect(ctaSrc).not.toContain("adminv2-bos-assist-cta");
    });

    it("priority explainability uses grounded copy without scores", () => {
        const exp = buildOperationalPriorityExplainability({
            chipLabel: "Today",
            urgencyBand: "p1_today",
            slaTier: "breached",
            urgencyReason: "Response window exceeded · 24 days since the inquiry was created",
        });
        expect(exp.ariaLabel).toContain("Priority: Today");
        expect(exp.ariaLabel).toMatch(/no first response for 24 days|24 days since/i);
        expect(exp.ariaLabel).not.toMatch(/priority_score|resolver|opportunity_attention_resolver/i);
    });

    it("Review Assist slot shows skeleton while BOS payload is loading", () => {
        const enrichment = buildDrawerEnrichmentState({
            record: { id: "opp-1", _record_surface: "drawer_primary" },
            drawer_id: "opp-1",
            background_full_failed: false,
        });
        const model = buildInquirySummaryRightColumnModel({
            record: { id: "opp-1" },
            enrichment,
            below_fold_enrichment_ready: false,
            task_assist_enabled: true,
        });
        const html = renderToStaticMarkup(
            <OpportunityInquirySummaryRightColumn
                model={model}
                opportunityId="opp-1"
                overviewData={{ id: "opp-1" }}
                reviewAssistLoading
            />
        );
        expect(html).toContain('data-drawer-slot="inquiry_summary_review_assist"');
        expect(html).toContain('data-review-assist-slot="skeleton"');
        expect(html).toContain('data-review-assist-skeleton="true"');
        expect(html).toContain("review_assist");
    });

    it("Review Assist calm state shows compact copy without duplicate BOS CTA", () => {
        const rightCol = readFileSync(
            join(webRoot, "components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx"),
            "utf8"
        );
        expect(rightCol).not.toContain("BosDrawerAssistCta");
        expect(rightCol).toContain('data-review-assist-calm="true"');
        expect(rightCol).toContain("No urgent action flagged.");
        expect(rightCol).not.toContain('data-review-assist-placeholder="reserved"');
    });

);
