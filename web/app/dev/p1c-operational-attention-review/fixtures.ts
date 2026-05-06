/**
 * Static resolver-shaped fixtures for P1-C UX screenshot review (dev-only page).
 * Labels mirror enrollment demo families where helpful (Patel, Nguyen, Chen).
 */

import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import { OPPORTUNITY_ATTENTION_RESOLVER_VERSION } from "@/lib/opportunities/opportunityAttentionResolver";
import type { CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";

const iso = "2026-05-06T15:30:00.000Z";

/** Drawer: healthy inquiry — no operational exceptions */
export const drawerNoAttention: OpportunityAttentionResult = {
    needs_attention: false,
    reasons: [],
    primary_reason: null,
    waiting: { bucket: "none", since_iso: null, active: false },
    priority_score: 0,
    priority_breakdown: [],
    auxiliary: { activity_stale: null },
    resolver_version: OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
    computed_at_iso: iso,
};

/** Drawer: single primary factor */
export const drawerSingleReason: OpportunityAttentionResult = {
    needs_attention: true,
    reasons: [
        {
            code: "tour_date_passed",
            label: "Tour date passed",
            severity: "high",
            sla_tier: "breached",
            sla_clock_confidence: "high",
        },
    ],
    primary_reason: {
        code: "tour_date_passed",
        label: "Tour date passed",
        severity: "high",
        sla_tier: "breached",
        sla_clock_confidence: "high",
    },
    waiting: { bucket: "none", since_iso: null, active: false },
    priority_score: 82,
    priority_breakdown: [
        { dimension: "severity", points: 75 },
        { dimension: "sla", points: 90 },
        { dimension: "value", points: 42 },
        { dimension: "multi_reason", points: 15 },
        { dimension: "commitment", points: 0 },
    ],
    auxiliary: { activity_stale: null },
    resolver_version: OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
    computed_at_iso: iso,
};

/** Drawer: staff wait + stale — multi-factor */
export const drawerMultiReason: OpportunityAttentionResult = {
    needs_attention: true,
    reasons: [
        {
            code: "waiting_on_staff",
            label: "Waiting on staff",
            severity: "high",
            sla_tier: "approaching",
            sla_clock_confidence: "high",
        },
        {
            code: "mid_funnel_stale",
            label: "Mid-funnel stale",
            severity: "medium",
            sla_tier: "breached",
            sla_clock_confidence: "low",
        },
        {
            code: "follow_up_date_passed",
            label: "Follow-up date passed",
            severity: "high",
            sla_tier: "breached",
            sla_clock_confidence: "high",
        },
    ],
    primary_reason: {
        code: "waiting_on_staff",
        label: "Waiting on staff",
        severity: "high",
        sla_tier: "approaching",
        sla_clock_confidence: "high",
    },
    waiting: {
        bucket: "waiting_on_staff",
        since_iso: "2026-05-04T14:00:00.000Z",
        active: true,
    },
    priority_score: 76,
    priority_breakdown: [
        { dimension: "severity", points: 75 },
        { dimension: "sla", points: 55 },
        { dimension: "value", points: 38 },
        { dimension: "multi_reason", points: 35 },
        { dimension: "commitment", points: 0 },
    ],
    auxiliary: {
        activity_stale: {
            key: "no_touch",
            label: "No activity 6d",
            severity: "medium",
            threshold_minutes: 4320,
        },
    },
    resolver_version: OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
    computed_at_iso: iso,
};

function baseQueueSlots(partial: Partial<CrmCompactRowSemanticSlots>): CrmCompactRowSemanticSlots {
    return {
        primaryIdentity: "Patel family",
        childName: "Liam Patel",
        childrenLines: null,
        stageLabel: null,
        statusLabel: "Contacted",
        nextStep: "Call to confirm tour window",
        lastActivity: "3d ago · outbound call",
        commercialValue: null,
        contactSnippet: null,
        programContext: null,
        roomContext: null,
        ageContext: "",
        attentionReason: null,
        familyNote: null,
        ...partial,
    };
}

/** Queue: one operational headline */
export const queueSingleReason: CrmCompactRowSemanticSlots = baseQueueSlots({
    attentionReason: "Needs review: Mid-funnel stale",
    operationalNextHint: "Advance the pipeline or document why it is paused.",
});

/** Queue: +N factors + wait token */
export const queueMultiFactors: CrmCompactRowSemanticSlots = baseQueueSlots({
    primaryIdentity: "Nguyen family",
    childName: "Sophia Nguyen",
    statusLabel: "Tour scheduled",
    attentionReason: "Needs review: Waiting on staff · Staff wait · +2 factors",
    operationalNextHint:
        "Staff: complete the outstanding action. Staff owes the next action.",
    activityStale: { label: "Tour window slipping", severity: "medium" },
});

/** Queue: emphasis on wait token (family) */
export const queueWaitToken: CrmCompactRowSemanticSlots = baseQueueSlots({
    primaryIdentity: "Chen family",
    childName: "Mia Chen",
    statusLabel: "New inquiry",
    attentionReason: "Follow up: Waiting on family · Family wait",
    operationalNextHint: "Follow up when appropriate; confirm the family received the request.",
});

/** Queue: emphasis on Next: line */
export const queueNextLine: CrmCompactRowSemanticSlots = baseQueueSlots({
    primaryIdentity: "Rivera family",
    childName: null,
    statusLabel: "Ready to enroll",
    attentionReason: "Needs review: High-value stale · Staff wait",
    operationalNextHint: "Re-engage this high-value inquiry. Staff owes the next action.",
    nextStep: null,
});
