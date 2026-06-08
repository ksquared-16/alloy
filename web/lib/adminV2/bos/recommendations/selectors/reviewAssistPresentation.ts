import type {
    QueueUrgencyChipContext,
    ResolvedDrawerRecommendationDisplay,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { queueUrgencyChipLabel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";

/** Likely outcome is omitted in compact chrome unless it adds distinct sequencing value. */
export function shouldShowDrawerLikelyOutcome(
    display: ResolvedDrawerRecommendationDisplay,
    variant: "chrome" | "panel",
): boolean {
    if (variant !== "panel") return false;
    const outcome = display.likelyOutcome?.trim();
    if (!outcome) return false;
    const doNext = display.doNext.trim().toLowerCase();
    const read = display.operationalRead.trim().toLowerCase();
    if (outcome.toLowerCase() === doNext || outcome.toLowerCase() === read) return false;
    return outcome.length <= 120;
}

export function shouldShowDrawerWhatChanged(display: ResolvedDrawerRecommendationDisplay): boolean {
    const reason = display.urgencyReason?.trim();
    const why = display.whyNow.trim();
    if (!reason) return false;
    if (reason === why) return false;
    if (why.includes(reason)) return false;
    const reasonNorm = reason.toLowerCase();
    const whyNorm = why.toLowerCase();
    if (reasonNorm.length > 12 && whyNorm.includes(reasonNorm.slice(0, Math.min(24, reasonNorm.length)))) {
        return false;
    }
    return true;
}

/** Drawer urgency chip — same thresholds as queue L0 (avoid Urgent/TODAY saturation). */
export function shouldShowDrawerUrgencyChip(
    display: ResolvedDrawerRecommendationDisplay,
    chipContext?: QueueUrgencyChipContext | null
): boolean {
    const band = display.urgencyBand ?? null;
    if (!band) return false;
    return queueUrgencyChipLabel(band, chipContext) != null;
}

export function drawerUrgencyChipLabel(
    display: ResolvedDrawerRecommendationDisplay,
    chipContext?: QueueUrgencyChipContext | null
): string | null {
    return queueUrgencyChipLabel(display.urgencyBand ?? null, chipContext);
}
