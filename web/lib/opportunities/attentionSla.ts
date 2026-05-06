import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/opportunityAttentionResolver";
import type { EnrollmentWaitBucket } from "@/lib/opportunities/attentionPlatformCatalog";
import type { OpportunityAttentionResolvedConfig } from "@/lib/opportunities/opportunityAttentionConfig";

export type AttentionSlaTier = "ok" | "approaching" | "breached";

export type AttentionSlaClockConfidence = "high" | "medium" | "low";

export type AttentionReasonSlaSlice = {
    tier: AttentionSlaTier;
    clock_confidence: AttentionSlaClockConfidence;
    elapsed_ms: number | null;
};

function tierFromWaitElapsed(elapsedMs: number, warningHours: number, criticalHours: number): AttentionSlaTier {
    const wh = Math.max(0, warningHours) * 60 * 60 * 1000;
    const ch = Math.max(0, criticalHours) * 60 * 60 * 1000;
    if (criticalHours <= 0 && warningHours <= 0) {
        return elapsedMs > 0 ? "breached" : "ok";
    }
    if (warningHours === 0) {
        if (elapsedMs < ch) return "approaching";
        return "breached";
    }
    if (elapsedMs < wh) return "ok";
    if (elapsedMs < ch) return "approaching";
    return "breached";
}

function thresholdsForBucket(
    bucket: Exclude<EnrollmentWaitBucket, "none">,
    cfg: OpportunityAttentionResolvedConfig
): { warning_hours: number; critical_hours: number } {
    const o = cfg.wait_bucket_sla_hours?.[bucket];
    if (o && typeof o.warning_hours === "number" && typeof o.critical_hours === "number") {
        return {
            warning_hours: Math.max(0, o.warning_hours),
            critical_hours: Math.max(0, o.critical_hours),
        };
    }
    const d = cfg.default_wait_bucket_sla_hours[bucket];
    return { warning_hours: d.warning_hours, critical_hours: d.critical_hours };
}

/** SLA for wait-type reasons driven by wait facet clocks. */
export function computeWaitReasonSla(params: {
    bucket: Exclude<EnrollmentWaitBucket, "none">;
    elapsedMs: number | null;
    clockConfidence: AttentionSlaClockConfidence;
    config: OpportunityAttentionResolvedConfig;
}): AttentionReasonSlaSlice {
    const { bucket, clockConfidence, config } = params;
    const elapsedMs = params.elapsedMs;
    if (elapsedMs == null || !Number.isFinite(elapsedMs)) {
        return { tier: "ok", clock_confidence: clockConfidence, elapsed_ms: null };
    }
    const { warning_hours, critical_hours } = thresholdsForBucket(bucket, config);
    return {
        tier: tierFromWaitElapsed(elapsedMs, warning_hours, critical_hours),
        clock_confidence: clockConfidence,
        elapsed_ms: elapsedMs,
    };
}

/** Commitment-style reasons: breached when the trigger is active (resolver only emits when true). */
export function computeCommitmentReasonSla(): AttentionReasonSlaSlice {
    return { tier: "breached", clock_confidence: "high", elapsed_ms: null };
}

/** Default stale / lifecycle reasons: treat as breached when reason is present (staleness is the signal). */
export function computeStaleReasonSla(): AttentionReasonSlaSlice {
    return { tier: "breached", clock_confidence: "medium", elapsed_ms: null };
}

export function worstSlaTier(a: AttentionSlaTier, b: AttentionSlaTier): AttentionSlaTier {
    const rank: Record<AttentionSlaTier, number> = { ok: 0, approaching: 1, breached: 2 };
    return rank[a] >= rank[b] ? a : b;
}

export type WaitReasonCode =
    | "waiting_on_family"
    | "waiting_on_staff"
    | "waiting_on_documents"
    | "waiting_on_payment"
    | "blocked_internal"
    | "blocked_external";

export function attentionReasonCodeToWaitBucket(code: OpportunityAttentionReasonCode): Exclude<EnrollmentWaitBucket, "none"> | null {
    switch (code) {
        case "waiting_on_family":
        case "waiting_on_staff":
        case "waiting_on_documents":
        case "waiting_on_payment":
        case "blocked_internal":
        case "blocked_external":
            return code;
        default:
            return null;
    }
}
