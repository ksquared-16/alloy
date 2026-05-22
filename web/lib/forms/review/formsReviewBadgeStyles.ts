import type { FormsReviewBadgeTone } from "@/lib/forms/review/formsReviewPresentation";

const BADGE_BASE = "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-tight";

const TONE_CLASSES: Record<FormsReviewBadgeTone, string> = {
    neutral: "border-admin-border bg-alloy-stone/30 text-alloy-midnight/75",
    info: "border-alloy-blue/30 bg-alloy-blue/10 text-alloy-blue",
    success: "border-alloy-pine/30 bg-alloy-pine/10 text-alloy-pine",
    warning: "border-alloy-ember/30 bg-alloy-ember/10 text-alloy-ember",
    error: "border-alloy-ember/35 bg-alloy-ember/12 text-alloy-ember",
    attention: "border-alloy-ember/40 bg-alloy-ember/15 text-alloy-midnight",
};

export function formsReviewBadgeClassName(tone: FormsReviewBadgeTone, className?: string): string {
    const toneClass = TONE_CLASSES[tone] ?? TONE_CLASSES.neutral;
    return className ? `${BADGE_BASE} ${toneClass} ${className}` : `${BADGE_BASE} ${toneClass}`;
}

/** @deprecated Prefer `formsReviewBadgeClassName` + `packetArtifactKindTone`. Kept for gradual migration. */
export function legacyArtifactKindBadgeClass(kind: string): string {
    return formsReviewBadgeClassName(
        kind === "generated_pdf" ? "success" : kind === "submitted_record" ? "info" : "neutral"
    );
}
