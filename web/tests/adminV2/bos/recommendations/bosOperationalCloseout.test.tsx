import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BOS_ASSIST_CTA_DRAWER } from "@/lib/adminV2/bos/bosDrawerAssistHandoff";
import { resolveUrgencyBand } from "@/lib/adminV2/bos/recommendations/builders/resolveUrgencyAndConfidence";
import { getOperationalRecommendationCatalogEntry } from "@/lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog";
import {
    drawerUrgencyChipLabel,
    shouldShowDrawerUrgencyChip,
} from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";
import {
    getRecommendationDetailSummary,
    getRecommendationDrawerStrip,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { resolveQueueOperationalReadSlot } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import OperationalReviewAssistBand from "@/components/admin/drawer/OperationalReviewAssistBand";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("BOS operational closeout", () => {
    it("maps breached medium attention to Today band, not Urgent", () => {
        const catalog = getOperationalRecommendationCatalogEntry("stale_new_inquiry")!;
        const band = resolveUrgencyBand({
            catalog,
            normalized_signals: [
                {
                    code: "primary_attention_reason",
                    label: "Stale",
                    source_type: "attention_resolver",
                    provenance: "test",
                    severity: "medium",
                    sla_tier: "breached",
                    priority: 0,
                },
            ],
        });
        expect(band).toBe("p1_today");
    });

    it("resolves the queue operational read slot from the recommendation preview", () => {
        const slot = resolveQueueOperationalReadSlot({
            _operational_recommendation_preview: {
                next_label: "Send a warm first response",
                why_line: "24 days since the inquiry was created",
                urgency_band: "p2_soon",
            },
        });
        expect(slot?.operationalRead).toContain("Send a warm first response");
        expect(slot?.urgencyBand).toBe("p2_soon");
    });

    it("drawer urgency chip uses queue thresholds", () => {
        const display = {
            operationalRead: "Read",
            whyNow: "Why",
            doNext: "Next",
            urgencyBand: "p1_today" as const,
            urgencyLabel: "Today",
            urgencyReason: "3 days since the inquiry was created",
            source: "canonical_drawer_strip" as const,
        };
        expect(shouldShowDrawerUrgencyChip(display, { primarySeverity: "medium", slaTier: "ok" })).toBe(false);
        expect(
            shouldShowDrawerUrgencyChip(display, { primarySeverity: "medium", slaTier: "breached" })
        ).toBe(true);
        expect(drawerUrgencyChipLabel(display, { primarySeverity: "medium", slaTier: "breached" })).toBe("Today");
    });

    it("supporting detail summary is subdued", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const overview = { _operational_recommendation: rec };
        const display = getRecommendationDrawerStrip(overview);
        const supportingDetail = getRecommendationDetailSummary(overview);
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                supportingDetail={supportingDetail}
                variant="chrome"
                urgencyChipContext={{}}
            />,
        );
        expect(html).toContain("More detail");
        expect(html).not.toContain("Supporting detail · Based on");
    });
});
