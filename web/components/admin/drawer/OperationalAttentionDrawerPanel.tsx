"use client";

import { useMemo, useState } from "react";
import { formatDateTime } from "@/lib/adminFormatters";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { OperationalAttentionAttachmentError } from "@/lib/admin/operationalAttentionEntityAttachment";
import {
    nextStepGuidance,
    slaTierPhrase,
    timingPhraseForReason,
    waitingOwnershipLine,
    worstTierAmongReasons,
} from "@/lib/opportunities/operationalAttentionExplain";
import type { EnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import { isEnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";

type Props = {
    payload: OpportunityAttentionResult | null | undefined;
    error?: OperationalAttentionAttachmentError | null | undefined;
    /** When true, skip primary + deterministic next blocks (shown in drawer header). */
    omitPrimaryAndNext?: boolean;
    /** Dev/review fixtures only — initial disclosure for deterministic screenshots */
    defaultReasonsExpanded?: boolean;
    defaultAdvancedExpanded?: boolean;
};

export default function OperationalAttentionDrawerPanel({
    payload,
    error,
    omitPrimaryAndNext = false,
    defaultReasonsExpanded = false,
    defaultAdvancedExpanded = false,
}: Props) {
    const [showReasons, setShowReasons] = useState(defaultReasonsExpanded);
    const [showAdvanced, setShowAdvanced] = useState(defaultAdvancedExpanded);
    const nowMs = useMemo(() => Date.now(), []);

    if (error && error.message) {
        return (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 px-3 py-2.5 text-sm text-alloy-midnight/80">
                <p className="font-medium text-alloy-midnight/90">Operational summary unavailable</p>
                <p className="mt-1 text-xs text-alloy-midnight/65">{error.message}</p>
            </div>
        );
    }

    if (!payload) {
        return (
            <p className="text-sm text-alloy-midnight/60">
                Operational attention could not be loaded. Refresh the drawer after a moment.
            </p>
        );
    }

    const wb = payload.waiting.bucket;
    const safeBucket: EnrollmentWaitBucket = isEnrollmentWaitBucket(wb) ? wb : "none";
    const worst = worstTierAmongReasons(payload.reasons);
    const primary = payload.primary_reason;

    if (!payload.needs_attention || !primary) {
        const evaluated =
            payload.computed_at_iso && formatDateTime(payload.computed_at_iso) !== "—"
                ? formatDateTime(payload.computed_at_iso)
                : null;
        return (
            <div className="space-y-1.5 text-sm text-alloy-midnight/75">
                <p>No active operational exceptions for this inquiry.</p>
                {evaluated ? (
                    <p className="text-xs text-alloy-midnight/55">
                        Last evaluated {evaluated} · Enrollment rules (resolver v{payload.resolver_version})
                    </p>
                ) : (
                    <p className="text-xs text-alloy-midnight/55">Resolver v{payload.resolver_version}</p>
                )}
                {payload.auxiliary.activity_stale ? (
                    <div className="mt-2 rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-2.5 py-2 text-xs text-alloy-midnight/70">
                        <span className="font-medium text-alloy-midnight/80">Activity signal · </span>
                        {payload.auxiliary.activity_stale.label}
                    </div>
                ) : null}
            </div>
        );
    }

    const nextLine = nextStepGuidance({
        primaryCode: primary.code,
        waitingBucket: safeBucket,
        worstSlaTier: worst,
    });

    const extra = Math.max(0, payload.reasons.length - 1);
    const waitLine =
        safeBucket !== "none" ? waitingOwnershipLine(safeBucket) : null;
    const slaSummary = slaTierPhrase(worst);

    return (
        <div className="space-y-3 text-sm text-alloy-midnight/85">
            {omitPrimaryAndNext ? null : (
                <>
                    <div className="space-y-1">
                        <p>
                            <span className="font-medium text-alloy-midnight/90">Primary · </span>
                            {primary.label}
                            <span className="text-alloy-midnight/55"> · {slaSummary}</span>
                        </p>
                        {extra > 0 ? (
                            <p className="text-xs text-alloy-midnight/60">
                                +{extra} additional operational factor{extra === 1 ? "" : "s"}
                            </p>
                        ) : null}
                        {waitLine ? <p className="text-xs text-alloy-midnight/65">{waitLine}</p> : null}
                    </div>

                    <div className="rounded-md border border-alloy-stone/18 bg-white/60 px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">Suggested next step</p>
                        <p className="mt-0.5 text-[13px] leading-snug text-alloy-midnight/88">{nextLine}</p>
                    </div>
                </>
            )}

            <button
                type="button"
                className="text-xs font-medium text-alloy-blue hover:underline"
                onClick={() => setShowReasons((v) => !v)}
                aria-expanded={showReasons}
            >
                {showReasons ? "Hide" : "Show"} operational factors ({payload.reasons.length})
            </button>

            {showReasons ? (
                <ul className="space-y-2 border-t border-alloy-stone/15 pt-2">
                    {payload.reasons.map((r) => (
                        <li key={r.code} className="text-xs leading-relaxed text-alloy-midnight/78">
                            <span className="font-medium text-alloy-midnight/88">{r.label}</span>
                            <span className="text-alloy-midnight/50"> · {slaTierPhrase(r.sla_tier)}</span>
                            <span className="block text-alloy-midnight/58 mt-0.5">{timingPhraseForReason(r, payload.waiting, nowMs)}</span>
                        </li>
                    ))}
                </ul>
            ) : null}

            <button
                type="button"
                className="block text-xs font-medium text-alloy-midnight/50 hover:text-alloy-midnight/70 hover:underline"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
            >
                {showAdvanced ? "Hide" : "Advanced"} priority detail
            </button>

            {showAdvanced ? (
                <div className="rounded-md border border-alloy-stone/15 bg-alloy-stone/[0.04] px-2.5 py-2 text-xs text-alloy-midnight/70 space-y-1.5">
                    <p>
                        Score band (internal) · <span className="font-mono">{payload.priority_score}</span>
                    </p>
                    {payload.priority_breakdown.length ? (
                        <ul className="list-none space-y-1 pl-0">
                            {payload.priority_breakdown.map((d) => (
                                <li key={d.dimension}>
                                    {d.dimension}: <span className="font-mono">{d.points}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-alloy-midnight/55">No dimension breakdown.</p>
                    )}
                </div>
            ) : null}

            {payload.auxiliary.activity_stale ? (
                <div className="rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-2.5 py-2 text-xs text-alloy-midnight/70">
                    <span className="font-medium text-alloy-midnight/80">Activity signal · </span>
                    {payload.auxiliary.activity_stale.label}
                </div>
            ) : null}
        </div>
    );
}
