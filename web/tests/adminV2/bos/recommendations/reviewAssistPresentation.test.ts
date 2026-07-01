import { describe, expect, it } from "vitest";

import {
    shouldShowDrawerLikelyOutcome,
    shouldShowDrawerWhatChanged,
} from "@/lib/adminV2/bos/recommendations/selectors/reviewAssistPresentation";
import type { ResolvedDrawerRecommendationDisplay } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";

const baseDisplay = (): ResolvedDrawerRecommendationDisplay => ({
    operationalRead: "New inquiry is stale",
    whyNow: "No response in several days",
    doNext: "Send a warm first response",
    likelyOutcome: "Family may lose momentum if outreach waits.",
    urgencyBand: "p1_today",
    urgencyLabel: "Today",
    urgencyReason: "No response in several days",
    source: "canonical_drawer_strip",
});

describe("reviewAssistPresentation", () => {
    it("hides likely outcome in chrome variant", () => {
        expect(shouldShowDrawerLikelyOutcome(baseDisplay(), "chrome")).toBe(false);
    });

    it("shows likely outcome in panel when distinct", () => {
        expect(shouldShowDrawerLikelyOutcome(baseDisplay(), "panel")).toBe(true);
    });

    it("suppresses what changed when it duplicates why now", () => {
        const d = baseDisplay();
        expect(shouldShowDrawerWhatChanged(d)).toBe(false);
    });
});
