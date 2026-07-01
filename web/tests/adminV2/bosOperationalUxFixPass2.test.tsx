import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CrmCompactQueuePreview } from "@/app/adminV2/components/workspace/blocks/QueueBlock";
import { queueUrgencyChipLabel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { resolveQueueOperationalReadSlot } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import { buildEnrollmentCrmRowSemanticSlots } from "@/lib/workspace/viewModels/enrollmentWorkUnitViewModel";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

describe("queue operational read display (fix pass 2)", () => {
    it("renders do-next and why-now on separate lines", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const preview = projectOperationalRecommendationQueuePreview(rec);
        const slots = buildEnrollmentCrmRowSemanticSlots(
            {
                id: "opp-1",
                name: "Lee",
                status_key: "new_inquiry",
                _operational_recommendation_preview: preview,
                _operational_attention: {
                    needs_attention: true,
                    primary_reason: {
                        code: "stale_new_inquiry",
                        label: "New inquiry is stale",
                        severity: "medium",
                        sla_tier: "breached",
                        sla_clock_confidence: "high",
                    },
                    reasons: [],
                    waiting: { bucket: "none", since_iso: null, active: false },
                    priority_score: 1,
                    priority_breakdown: [],
                    auxiliary: {},
                    resolver_version: 2,
                    computed_at_iso: "2026-05-21T10:00:00.000Z",
                },
            } as never,
            { workUnitKey: "needs_attention" }
        );
        const html = renderToStaticMarkup(<CrmCompactQueuePreview scanMode slots={slots} />);
        expect(html).toContain('data-queue-preview-slot="operational_read"');
        expect(html).toContain('data-queue-preview-slot="operational_read_why"');
        expect(html).toContain("Send a warm first response");
        expect(html).toContain("Response window exceeded");
    });

    it("hides urgency chip for medium severity with p2 band", () => {
        expect(queueUrgencyChipLabel("p2_soon", { primarySeverity: "medium", slaTier: "ok" })).toBeNull();
        expect(queueUrgencyChipLabel("p1_today", { primarySeverity: "medium", slaTier: "ok" })).toBeNull();
        expect(queueUrgencyChipLabel("p1_today", { primarySeverity: "medium", slaTier: "breached" })).toBe(
            "Today"
        );
        expect(queueUrgencyChipLabel("p0_urgent", { primarySeverity: "medium", slaTier: "ok" })).toBe("Urgent");
    });

    it("do-next line is not merged with long why text", () => {
        const slot = resolveQueueOperationalReadSlot({
            _operational_recommendation_preview: {
                next_label: "Send a warm first response and confirm the family's preferred next step",
                why_line: "Response window exceeded · 24 days since the inquiry was created",
                urgency_band: "p2_soon",
            },
        });
        expect(slot?.operationalRead).toContain("Send a warm first response");
        expect(slot?.whyNow).toContain("24 days since the inquiry was created");
        expect(slot?.operationalRead).not.toContain("24 days since");
    });
});

describe("drawer primary BOS payload", () => {
    it("drawer_primary defers operational attention off the critical path", () => {
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
        const src = readFileSync(join(webRoot, "lib/admin/opportunityEntityRecord.ts"), "utf8");
        const primaryStart = src.indexOf('surfaceParamEarly === "drawer_primary"');
        const primaryBlock = src.slice(
            primaryStart,
            src.indexOf("return NextResponse.json(out", primaryStart)
        );
        // Attention bundle must NOT run synchronously in drawer_primary; it attaches on surface=full.
        expect(primaryBlock).not.toContain("attachOpportunityAttentionSuggestionBundle");
        expect(primaryBlock).toContain("_operational_attention_deferred = true");
    });
});
