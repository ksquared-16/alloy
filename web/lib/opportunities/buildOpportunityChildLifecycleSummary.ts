/**
 * Read-only child lifecycle summary for opportunity/case display (Card 11).
 * Does not mutate opportunity.status_key or persist rollups.
 */

import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";

export type ChildLifecycleSummaryMemberInput = {
    outcome_status_key?: string | null;
    outcome_status_label?: string | null;
    display_name?: string | null;
};

export type OpportunityChildLifecycleSummary = {
    opportunity_id: string;
    total_children: number;
    has_children: boolean;
    counts_by_status_key: Record<string, number>;
    missing_status_count: number;
    is_mixed: boolean;
    /** Set when all children share one non-missing status. */
    primary_status_key: string | null;
    /** Primary line for drawer/header — e.g. "Children: 1 enrolled, 1 waitlisted" */
    headline_label: string | null;
    /** Compact summary — e.g. "2 children · 1 enrolled, 1 waitlisted" */
    display_summary: string | null;
    /** Short mixed-state label — e.g. "Mixed: enrolled + waitlisted" */
    short_summary: string | null;
    /** Clarifier that case status is separate from child lifecycle. */
    case_status_secondary_note: string;
    /** True when every listed child lacks enrollment lifecycle status — calmer drawer copy. */
    all_enrollment_status_unset: boolean;
};

const DEFAULT_CHILD_LIFECYCLE_LABELS: Record<string, string> = {
    waitlisted: "Waitlisted",
    enrolled: "Enrolled",
    offer_pending: "Offer pending",
    enrolling: "Enrolling",
    interested: "Interested",
    new_inquiry: "New lead",
    not_enrolling: "Not enrolling",
    withdrawn: "Withdrawn",
    deferred: "Deferred",
};

const MISSING_STATUS_KEY = "__missing__";
const MISSING_STATUS_LABEL = "enrollment status not set";

/** Stable UI ordering for mixed-state count fragments. */
const STATUS_DISPLAY_ORDER: string[] = [
    "enrolled",
    "waitlisted",
    "offer_pending",
    "enrolling",
    "interested",
    "new_inquiry",
    "deferred",
    "not_enrolling",
    "withdrawn",
];

export const OPPORTUNITY_CHILD_LIFECYCLE_CASE_NOTE =
    "Case status reflects family coordination; child summary reflects enrollment lifecycle.";

function normalizeKey(raw: unknown): string | null {
    if (raw == null || raw === "") return null;
    const t = String(raw).trim();
    return t || null;
}

function statusLabel(
    statusKey: string,
    memberLabel: string | null | undefined,
    labels: Record<string, string>
): string {
    if (statusKey === MISSING_STATUS_KEY) return MISSING_STATUS_LABEL;
    const fromMember = memberLabel?.trim();
    if (fromMember) return fromMember;
    return labels[statusKey] ?? humanizeSnakeCaseToken(statusKey, labels);
}

function compareStatusKeys(a: string, b: string): number {
    const ai = STATUS_DISPLAY_ORDER.indexOf(a);
    const bi = STATUS_DISPLAY_ORDER.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    if (a === MISSING_STATUS_KEY) return 1;
    if (b === MISSING_STATUS_KEY) return -1;
    return a.localeCompare(b);
}

function formatCountFragment(count: number, label: string): string {
    return count === 1 ? `1 ${label.toLowerCase()}` : `${count} ${label.toLowerCase()}`;
}

function buildCountFragments(
    counts: Map<string, number>,
    labelByKey: Map<string, string>
): string[] {
    const keys = [...counts.keys()].sort(compareStatusKeys);
    return keys.map((key) => formatCountFragment(counts.get(key) ?? 0, labelByKey.get(key) ?? key));
}

export function buildOpportunityChildLifecycleSummary(params: {
    opportunityId: string;
    members: ChildLifecycleSummaryMemberInput[];
    statusKeyLabels?: Record<string, string>;
}): OpportunityChildLifecycleSummary {
    const labels = { ...DEFAULT_CHILD_LIFECYCLE_LABELS, ...(params.statusKeyLabels ?? {}) };
    const opportunityId = params.opportunityId.trim();
    const members = params.members ?? [];
    const total = members.length;

    const base: OpportunityChildLifecycleSummary = {
        opportunity_id: opportunityId,
        total_children: total,
        has_children: total > 0,
        counts_by_status_key: {},
        missing_status_count: 0,
        is_mixed: false,
        primary_status_key: null,
        headline_label: null,
        display_summary: null,
        short_summary: null,
        case_status_secondary_note: OPPORTUNITY_CHILD_LIFECYCLE_CASE_NOTE,
        all_enrollment_status_unset: false,
    };

    if (!total) return base;

    const counts = new Map<string, number>();
    const labelByKey = new Map<string, string>();

    for (const member of members) {
        const key = normalizeKey(member.outcome_status_key);
        const bucket = key ?? MISSING_STATUS_KEY;
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
        if (!labelByKey.has(bucket)) {
            labelByKey.set(bucket, statusLabel(bucket, member.outcome_status_label, labels));
        }
    }

    const missingCount = counts.get(MISSING_STATUS_KEY) ?? 0;
    const nonMissingKeys = [...counts.keys()].filter((k) => k !== MISSING_STATUS_KEY);
    const isMixed = nonMissingKeys.length > 1 || (nonMissingKeys.length === 1 && missingCount > 0) || (nonMissingKeys.length === 0 && missingCount > 1);

    let primaryStatusKey: string | null = null;
    if (!isMixed && nonMissingKeys.length === 1 && missingCount === 0) {
        primaryStatusKey = nonMissingKeys[0] ?? null;
    }

    const countsByStatus: Record<string, number> = {};
    for (const [k, v] of counts) {
        if (k === MISSING_STATUS_KEY) continue;
        countsByStatus[k] = v;
    }

    const fragments = buildCountFragments(counts, labelByKey);
    const childWord = total === 1 ? "1 child" : `${total} children`;

    let familyStatusLine: string | null = null;
    if (primaryStatusKey) {
        const label = labelByKey.get(primaryStatusKey) ?? primaryStatusKey;
        familyStatusLine = `Family status: ${label}`;
    } else if (missingCount === total) {
        familyStatusLine = null;
    } else if (isMixed) {
        const displayCounts = new Map(counts);
        displayCounts.delete(MISSING_STATUS_KEY);
        if (displayCounts.size === 0) {
            familyStatusLine = null;
        } else if (missingCount === 0) {
            const uniqueLabels = nonMissingKeys.map((k) => labelByKey.get(k) ?? k);
            familyStatusLine =
                uniqueLabels.length > 1
                    ? `Family status: ${uniqueLabels.join(" + ")}`
                    : `Family status: ${uniqueLabels[0] ?? ""}`;
        } else {
            const displayFragments = buildCountFragments(displayCounts, labelByKey);
            familyStatusLine = displayFragments.length ? `Family status: ${displayFragments.join(", ")}` : null;
        }
    } else {
        const displayCounts = new Map(counts);
        displayCounts.delete(MISSING_STATUS_KEY);
        const displayFragments = buildCountFragments(displayCounts, labelByKey);
        familyStatusLine = displayFragments.length ? `Family status: ${displayFragments.join(", ")}` : null;
    }

    const headlineLabel = childWord;
    const displaySummary = familyStatusLine;
    const shortSummary = familyStatusLine?.replace(/^Family status:\s*/, "") ?? null;

    return {
        ...base,
        counts_by_status_key: countsByStatus,
        missing_status_count: missingCount,
        is_mixed: isMixed,
        primary_status_key: primaryStatusKey,
        headline_label: headlineLabel,
        display_summary: displaySummary,
        short_summary: shortSummary,
        all_enrollment_status_unset: missingCount === total && total > 0,
    };
}

/** Map inquiry drawer / metadata child rows to summary member inputs. */
export function childLifecycleMembersFromInquiryChildren(rows: unknown[]): ChildLifecycleSummaryMemberInput[] {
    const out: ChildLifecycleSummaryMemberInput[] = [];
    for (const raw of rows) {
        if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
        const row = raw as Record<string, unknown>;
        out.push({
            outcome_status_key:
                normalizeKey(row.outcome_status_key) ??
                normalizeKey(row.outcome_status) ??
                normalizeKey(row.status_key),
            outcome_status_label:
                normalizeKey(row.outcome_status_label) ?? normalizeKey(row.outcome_status) ?? null,
            display_name:
                normalizeKey(row.display_name) ??
                normalizeKey(row.child_display_name) ??
                normalizeKey(row.name),
        });
    }
    return out;
}

export function attachOpportunityChildLifecycleSummary(host: Record<string, unknown>): void {
    const opportunityId = String(host.id ?? host.opportunity_id ?? "").trim();
    const inquiryChildren = host._inquiry_children;
    const members = Array.isArray(inquiryChildren)
        ? childLifecycleMembersFromInquiryChildren(inquiryChildren)
        : [];
    host._child_lifecycle_summary = buildOpportunityChildLifecycleSummary({
        opportunityId,
        members,
    });
}
