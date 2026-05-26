/**
 * Restrained trust/readiness chrome labels (BOS Phase 2 / Card 2.6).
 * Selector-only — no confidence scoring or AI certainty language.
 */

export const TRUST_READINESS_LABELS = {
    needsRefresh: "Needs refresh",
    approximateTiming: "Approximate timing",
    basedOnAvailableActivity: "Based on available activity",
    supportingDetailAvailable: "Supporting detail available",
    preview: "Preview",
} as const;

export type ResolvedDrawerReadinessChrome = {
    trustLines: string[];
};

export type ResolvedQueuePreviewTrustChrome = {
    staleCueLabel: string | null;
};

function uniqueTrustLines(lines: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of lines) {
        const t = raw.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        out.push(t);
    }
    return out;
}

function isApproximateTimingLabel(label: string | null | undefined): boolean {
    const t = label?.trim().toLowerCase() ?? "";
    return t.includes("approximate");
}

/** Drawer Review Assist — calm readiness/provenance lines under operational read. */
export function resolveDrawerReadinessChrome(args: {
    isStale?: boolean;
    confidenceLabel?: string | null;
    hasActivitySignal?: boolean;
    hasSupportingDetail?: boolean;
}): ResolvedDrawerReadinessChrome {
    const lines: string[] = [];
    if (args.isStale) {
        lines.push(TRUST_READINESS_LABELS.needsRefresh);
    }
    if (isApproximateTimingLabel(args.confidenceLabel)) {
        lines.push(TRUST_READINESS_LABELS.approximateTiming);
    }
    if (args.hasActivitySignal) {
        lines.push(TRUST_READINESS_LABELS.basedOnAvailableActivity);
    }
    if (args.hasSupportingDetail) {
        lines.push(TRUST_READINESS_LABELS.supportingDetailAvailable);
    }
    return { trustLines: uniqueTrustLines(lines) };
}

/** Queue L0 — compact stale cue only; preview boundary stays separate. */
export function resolveQueuePreviewTrustChrome(isStale: boolean | undefined): ResolvedQueuePreviewTrustChrome {
    return {
        staleCueLabel: isStale ? TRUST_READINESS_LABELS.needsRefresh : null,
    };
}

/** Handoff seed — optional compact readiness note when stale or approximate timing. */
export function resolveHandoffTrustNote(args: {
    isStale?: boolean;
    confidenceLabel?: string | null;
}): string | null {
    if (args.isStale) return TRUST_READINESS_LABELS.needsRefresh;
    if (isApproximateTimingLabel(args.confidenceLabel)) {
        return TRUST_READINESS_LABELS.approximateTiming;
    }
    return null;
}
