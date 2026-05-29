/**
 * Deterministic operator copy for enrollment operational attention (P1-C).
 * Resolver-backed only — no AI. Safe for server + client.
 */

import type { EnrollmentWaitBucket, OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import {
    attentionReasonCodeToWaitBucket,
    worstSlaTier,
    type AttentionSlaClockConfidence,
    type AttentionSlaTier,
} from "@/lib/opportunities/attentionSla";
import type { AttentionWaitingFacet, ResolvedOpportunityAttentionReason } from "@/lib/opportunities/opportunityAttentionResolver";
import type { OpportunityAttentionSeverity } from "@/lib/opportunities/opportunityAttentionConfig";

export function severityHeadlinePrefix(severity: OpportunityAttentionSeverity | string | null | undefined): string {
    switch (severity) {
        case "critical":
            return "Urgent";
        case "high":
            return "Needs review";
        case "medium":
            return "Follow up";
        case "low":
            return "FYI";
        default:
            return "Attention";
    }
}

/** Short queue-row token for wait/blocked state */
export function waitingBucketQueueToken(bucket: string | null | undefined): string | null {
    switch (bucket) {
        case "waiting_on_family":
            return "Family wait";
        case "waiting_on_staff":
            return "Staff wait";
        case "waiting_on_documents":
            return "Docs wait";
        case "waiting_on_payment":
            return "Payment wait";
        case "blocked_internal":
            return "Internal block";
        case "blocked_external":
            return "External block";
        default:
            return null;
    }
}

export function slaTierPhrase(tier: AttentionSlaTier): string {
    switch (tier) {
        case "ok":
            return "Within expected window";
        case "approaching":
            return "Due soon";
        case "breached":
            return "Past due vs goal";
        default:
            return "—";
    }
}

function roughDaysBetween(nowMs: number, pastIso: string): number | null {
    const t = Date.parse(pastIso);
    if (!Number.isFinite(t)) return null;
    const d = (nowMs - t) / (24 * 60 * 60 * 1000);
    return d >= 0 ? Math.round(d) : null;
}

function relativeWaitPhrase(sinceIso: string | null, nowMs: number, confidence: AttentionSlaClockConfidence): string | null {
    if (!sinceIso?.trim()) return null;
    const days = roughDaysBetween(nowMs, sinceIso);
    if (days == null) return null;
    if (confidence === "high") {
        if (days === 0) return "Waiting since today";
        if (days === 1) return "Waiting since yesterday";
        return `Waiting ~${days} days`;
    }
    if (confidence === "medium") {
        return days <= 1 ? "Likely waiting ~1 day" : `Likely waiting ~${days} days`;
    }
    return days <= 1 ? "Timing approximate · recent activity" : `Likely inactive ~${days} days · derived from latest activity`;
}

/** One calm line for drawer / reason row timing */
export function timingPhraseForReason(
    reason: ResolvedOpportunityAttentionReason,
    waiting: AttentionWaitingFacet,
    nowMs: number,
): string {
    const bucket = attentionReasonCodeToWaitBucket(reason.code as OpportunityAttentionReasonCode);
    if (bucket && waiting.bucket === bucket && waiting.since_iso) {
        const rel = relativeWaitPhrase(waiting.since_iso, nowMs, reason.sla_clock_confidence);
        if (rel) return rel;
    }
    if (reason.sla_clock_confidence === "low") {
        return "Timing approximate · based on latest record activity";
    }
    if (reason.sla_clock_confidence === "medium") {
        return "Derived from last status / record timing";
    }
    return "Timing based on explicit enrollment operational dates";
}

export function waitingOwnershipLine(bucket: EnrollmentWaitBucket): string | null {
    switch (bucket) {
        case "waiting_on_family":
            return "Family owes the next response.";
        case "waiting_on_staff":
            return "Staff owes the next action.";
        case "waiting_on_documents":
            return "Outstanding documents.";
        case "waiting_on_payment":
            return "Payment status needs confirmation.";
        case "blocked_internal":
            return "Resolve internal blocker before advancing.";
        case "blocked_external":
            return "Blocked by an external dependency.";
        default:
            return null;
    }
}

export function nextStepGuidance(input: {
    primaryCode: OpportunityAttentionReasonCode | string | null | undefined;
    waitingBucket: EnrollmentWaitBucket;
    worstSlaTier: AttentionSlaTier;
}): string {
    const code = String(input.primaryCode ?? "").trim();
    const ws = input.waitingBucket;

    const base = nextStepForReasonCode(code as OpportunityAttentionReasonCode);
    if (ws !== "none") {
        const wLine = waitingOwnershipLine(ws);
        if (wLine && (code.startsWith("waiting_") || code.startsWith("blocked_"))) {
            return `${base} ${wLine}`.trim();
        }
        if (wLine) return `${base} (${wLine})`;
    }
    return base;
}

function nextStepForReasonCode(code: OpportunityAttentionReasonCode): string {
    switch (code) {
        case "follow_up_date_passed":
            return "Schedule or complete follow-up with the family.";
        case "tour_date_passed":
            return "Complete tour follow-up and update the next step.";
        case "overdue_commitment":
            return "Resolve the overdue commitment or set a new date.";
        case "missing_quote_after_execution":
            return "Finish and send the enrollment offer.";
        case "stale_quote_followup":
            return "Check in on the pending decision.";
        case "missing_identity":
            return "Link family contact before proceeding.";
        case "high_value_stale":
            return "Re-engage this high-value inquiry.";
        case "mid_funnel_stale":
            return "Advance the pipeline or document why it is paused.";
        case "stale_new_inquiry":
            return "Respond within policy for new inquiries.";
        case "stale_qualified":
            return "Move the qualified lead forward or update status.";
        case "waiting_on_family":
            return "Follow up when appropriate; confirm the family received the request.";
        case "waiting_on_staff":
            return "Staff: complete the outstanding action.";
        case "waiting_on_documents":
            return "Request or process outstanding documents.";
        case "waiting_on_payment":
            return "Confirm payment status or send a reminder.";
        case "blocked_internal":
            return "Resolve the internal blocker or reassign ownership.";
        case "blocked_external":
            return "Track the external dependency or escalate.";
        default:
            return "Review operational state and log the next touch.";
    }
}

export function worstTierAmongReasons(reasons: ResolvedOpportunityAttentionReason[]): AttentionSlaTier {
    let w: AttentionSlaTier = "ok";
    for (const r of reasons) {
        w = worstSlaTier(w, r.sla_tier);
    }
    return w;
}

export type QueueOperationalAttentionPresentationOpts = {
    /**
     * Queue list scan mode: fixed “Needs attention” headline (no severity prefixes like “Needs review”),
     * omits wait-bucket tokens — matching drawer operational copy.
     */
    queueScan?: boolean;
};

/** CRM compact row: one calm headline + optional second line */
export function buildQueueOperationalAttentionPresentation(
    row: {
        _attention_reason?: string | null;
        _attention_reason_label?: string | null;
        _attention_severity?: string | null;
        _attention_waiting_bucket?: string | null;
        _attention_reasons_detail?: unknown;
    },
    opts?: QueueOperationalAttentionPresentationOpts
): { summaryLine: string | null; nextHintLine: string | null } {
    const label = String(row._attention_reason_label ?? "").trim();
    if (!label) return { summaryLine: null, nextHintLine: null };

    const severity = row._attention_severity as OpportunityAttentionSeverity | undefined;
    const prefix = severityHeadlinePrefix(severity);
    const waitTok = waitingBucketQueueToken(row._attention_waiting_bucket ?? undefined);
    const details = row._attention_reasons_detail;
    const n =
        Array.isArray(details) && details.length > 1
            ? details.length - 1
            : 0;

    let summary: string;
    if (opts?.queueScan) {
        summary = `Needs attention: ${label}`;
        if (n > 0) summary = `${summary} · +${n} factor${n === 1 ? "" : "s"}`;
    } else {
        summary = `${prefix}: ${label}`;
        const suffixParts: string[] = [];
        if (waitTok) suffixParts.push(waitTok);
        if (n > 0) suffixParts.push(`+${n} factors`);
        if (suffixParts.length) summary = `${summary} · ${suffixParts.join(" · ")}`;
    }

    const primaryCode =
        String(row._attention_reason ?? "").trim() ||
        (Array.isArray(details) ? String((details[0] as { code?: string } | undefined)?.code ?? "").trim() : "") ||
        null;
    const wb = (row._attention_waiting_bucket ?? "none") as EnrollmentWaitBucket;
    const tiers: AttentionSlaTier[] = Array.isArray(details)
        ? (details as { sla_tier?: AttentionSlaTier }[]).map((x) => x.sla_tier).filter(Boolean) as AttentionSlaTier[]
        : [];
    let worst: AttentionSlaTier = "ok";
    for (const t of tiers) worst = worstSlaTier(worst, t);

    const nextHint =
        primaryCode || wb !== "none"
            ? nextStepGuidance({ primaryCode: primaryCode ?? "mid_funnel_stale", waitingBucket: wb, worstSlaTier: worst })
            : null;

    return { summaryLine: summary, nextHintLine: nextHint };
}
