"use client";

import {
    REC_ACTION_LABELS,
    REC_CONFIDENCE_LABELS,
    type QueueRecommendationSummary,
} from "@/lib/pos/processingCase/recommendation/recommendationSummary";

const PILL_BY_CONFIDENCE: Record<string, string> = {
    high: "text-alloy-bend-pine",
    medium: "text-alloy-midnight/55",
    low: "text-alloy-midnight/45",
    review: "text-alloy-midnight/40",
};

export default function RecommendationBadge({
    rec,
    showName = true,
    showConfidence = true,
}: {
    rec: QueueRecommendationSummary;
    showName?: boolean;
    showConfidence?: boolean;
}) {
    const tone = PILL_BY_CONFIDENCE[rec.confidence] ?? PILL_BY_CONFIDENCE.review;
    return (
        <span className="inline-flex min-w-0 items-center gap-1">
            <span className={`inline-flex shrink-0 text-[7px] font-semibold ${tone}`}>
                {REC_ACTION_LABELS[rec.action]}
            </span>
            {showConfidence ? (
                <span className={`shrink-0 text-[7px] ${tone}`}>{REC_CONFIDENCE_LABELS[rec.confidence]}</span>
            ) : null}
            {showName && rec.matchedName ? (
                <span className="min-w-0 truncate text-[7px] text-alloy-midnight/40">· {rec.matchedName}</span>
            ) : null}
        </span>
    );
}
