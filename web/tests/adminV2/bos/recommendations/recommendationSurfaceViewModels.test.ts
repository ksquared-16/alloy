import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    resolveDrawerReviewAssistViewModel,
    resolveQueueOperationalReadSlot,
    QUEUE_PREVIEW_BOUNDARY_LABEL,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

const webRoot = join(__dirname, "../../../../");

describe("recommendationSurfaceViewModels / Card 2.7", () => {
    it("resolveDrawerReviewAssistViewModel owns drawer field pass-through", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const vm = resolveDrawerReviewAssistViewModel({
            _operational_recommendation: rec,
            _operational_attention: {
                needs_attention: true,
                auxiliary: { activity_stale: { key: "idle", label: "Idle", severity: "medium", threshold_minutes: 60 } },
            },
        });
        expect(vm).not.toBeNull();
        expect(vm!.display.operationalRead).toBeTruthy();
        expect(vm!.display.whyNow).toBeTruthy();
        expect(vm!.display.doNext).toBeTruthy();
        expect(vm!.readinessChrome.trustLines.length).toBeGreaterThan(0);
    });

    it("resolveQueueOperationalReadSlot uses normalized field names", () => {
        const slot = resolveQueueOperationalReadSlot({
            _operational_recommendation_preview: {
                next_label: "Send a warm first response",
                why_line: "New inquiries lose momentum when delayed.",
                urgency_band: "p1_today",
                recommendation_type: "communication",
            },
        });
        expect(slot?.operationalRead).toContain("Send a warm first response");
        expect(slot?.typeCue).toBe("Communication");
        expect(slot?.previewBoundary).toBe(QUEUE_PREVIEW_BOUNDARY_LABEL);
    });

    it("OperationalAttentionHeaderStrip uses composite drawer VM selector", () => {
        const src = readFileSync(
            join(webRoot, "components/admin/drawer/OperationalAttentionHeaderStrip.tsx"),
            "utf8"
        );
        expect(src).toContain("resolveDrawerReviewAssistViewModel");
        expect(src).not.toContain("getRecommendationDrawerStrip");
        expect(src).not.toContain("getRecommendationDetailSummary");
    });

    it("OperationalReviewAssistBand does not interpret stale or type fields locally", () => {
        const src = readFileSync(
            join(webRoot, "components/admin/drawer/OperationalReviewAssistBand.tsx"),
            "utf8"
        );
        expect(src).toContain("readinessChrome?.trustLines");
        expect(src).not.toContain("staleBanner");
        expect(src).not.toContain("confidenceLabel");
        expect(src).not.toContain("activityStaleLabel");
    });

    it("enrollment work unit VM uses queue slot selector", () => {
        const src = readFileSync(
            join(webRoot, "lib/workspace/viewModels/enrollmentWorkUnitViewModel.ts"),
            "utf8"
        );
        expect(src).toContain("resolveQueueOperationalReadSlot");
        expect(src).not.toContain("resolveQueueOperationalReadPreview");
    });
});
