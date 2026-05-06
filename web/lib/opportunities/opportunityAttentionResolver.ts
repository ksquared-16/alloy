import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { ActivityStaleSignalVm } from "@/lib/admin/activitySignals";
import type {
    OpportunityAttentionReason,
    OpportunityAttentionRuleConfigV1,
} from "@/lib/workspace/opportunityAttentionRules";
import { computeOpportunityAttentionReason } from "@/lib/workspace/opportunityAttentionRules";
import { isOpportunityActiveForExecution, terminalOpportunityStatusKeysFromDefs } from "@/lib/workspace/opportunityExecutionEligibility";
import {
    createDefaultOpportunityAttentionResolvedConfig,
    labelForReasonCode,
    type OpportunityAttentionResolvedConfig,
    severityForReasonCode,
    type OpportunityAttentionSeverity,
} from "@/lib/opportunities/opportunityAttentionConfig";

/** Stable platform codes: legacy lifecycle + QueueService-style queue lane reasons. */
export type OpportunityAttentionReasonCode =
    | OpportunityAttentionReason
    | "follow_up_date_passed"
    | "tour_date_passed"
    | "high_value_stale"
    | "mid_funnel_stale"
    | "missing_identity";

/**
 * Lower index = higher precedence for `primary_reason` and display ordering
 * (aligned with legacy QueueService label chain, then lifecycle reasons).
 */
export const OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER: readonly OpportunityAttentionReasonCode[] = [
    "follow_up_date_passed",
    "tour_date_passed",
    "high_value_stale",
    "mid_funnel_stale",
    "missing_identity",
    "stale_new_inquiry",
    "stale_qualified",
    "missing_quote_after_execution",
    "stale_quote_followup",
] as const;

const PRIORITY_INDEX: Map<OpportunityAttentionReasonCode, number> = new Map(
    OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER.map((code, i) => [code, i])
);

/** Enrollment funnel stages: stale >N days (matches QueueService defaults). */
export const OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET = new Set([
    "tour_scheduled",
    "tour_completed",
    "application_in_progress",
    "ready_to_enroll",
]);

/** Queue lane: never surface for these statuses (QueueService parity). */
export const QUEUE_LANE_EXCLUDED_STATUS_KEYS = new Set(["lost", "enrolled", "new_inquiry"]);

/** Mid-funnel statuses for 7d stale rule (QueueService parity). */
export const QUEUE_LANE_MID_FUNNEL_STALE_STATUS_KEYS = new Set([
    "contact_attempted",
    "contacted",
    "waitlisted",
    "enrolling",
]);

export const OPPORTUNITY_ATTENTION_RESOLVER_VERSION = 1 as const;

export type OpportunityAttentionSignalInput = {
    /**
     * Optional workflow/activity-derived signal — never required for core membership in v1.
     * When `config.auxiliary_signals_enabled` is true, surfaces as `auxiliary.activity_stale` only.
     */
    activityStale?: ActivityStaleSignalVm | null;
};

export type OpportunityAttentionEntityInput = {
    id: string;
    status_key: string | null;
    created_at: string | null;
    updated_at: string | null;
    metadata: Record<string, unknown> | null;
    customer_id?: string | null;
    primary_person_id?: string | null;
    primary_contact_id?: string | null;
    quote_total?: number | string | null;
    estimated_price_cents?: number | string | null;
    monetary_value_cents?: number | string | null;
};

export type OpportunityAttentionResolverInput = {
    opportunity: OpportunityAttentionEntityInput;
    nowMs: number;
    defs: StatusDefinitionRow[];
    /**
     * Prefer passing explicit config (e.g. from {@link resolveOpportunityAttentionConfigFromMetadata}).
     * When omitted, uses defaults from {@link createDefaultOpportunityAttentionResolvedConfig}.
     */
    config?: OpportunityAttentionResolvedConfig;
    optionalSignals?: OpportunityAttentionSignalInput | null;
};

export type ResolvedOpportunityAttentionReason = {
    code: OpportunityAttentionReasonCode;
    label: string;
    severity: OpportunityAttentionSeverity;
};

export type OpportunityAttentionResult = {
    needs_attention: boolean;
    reasons: ResolvedOpportunityAttentionReason[];
    primary_reason: ResolvedOpportunityAttentionReason | null;
    /** Informational only unless future work wires membership to activity. */
    auxiliary: {
        activity_stale: ActivityStaleSignalVm | null;
    };
    resolver_version: typeof OPPORTUNITY_ATTENTION_RESOLVER_VERSION;
    computed_at_iso: string;
};

function subtractDays(now: Date, days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function opportunityMetadataRecord(metadata: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return metadata;
}

function parseMetadataInstantMs(md: Record<string, unknown> | null, key: string): number | null {
    if (!md) return null;
    const v = md[key];
    if (typeof v !== "string") return null;
    const t = Date.parse(v.trim());
    return Number.isFinite(t) ? t : null;
}

function parseTourDateYmdUtcMs(raw: unknown): number | null {
    if (typeof raw !== "string") return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function sortReasonCodes(codes: OpportunityAttentionReasonCode[]): OpportunityAttentionReasonCode[] {
    return [...codes].sort((a, b) => {
        const ia = PRIORITY_INDEX.get(a) ?? 999;
        const ib = PRIORITY_INDEX.get(b) ?? 999;
        if (ia !== ib) return ia - ib;
        return a.localeCompare(b);
    });
}

function collectQueueLaneCodes(input: {
    row: OpportunityAttentionEntityInput;
    now: Date;
    config: OpportunityAttentionResolvedConfig;
}): OpportunityAttentionReasonCode[] {
    const { row, now, config } = input;
    const out: OpportunityAttentionReasonCode[] = [];

    const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) {
        return out;
    }

    const sk = (row.status_key ?? "").trim().toLowerCase();
    if (QUEUE_LANE_EXCLUDED_STATUS_KEYS.has(sk)) {
        return out;
    }

    const md = opportunityMetadataRecord(row.metadata);

    const nfu = parseMetadataInstantMs(md, "next_follow_up_at");
    if (nfu != null && nfu < now.getTime()) {
        out.push("follow_up_date_passed");
    }

    if (sk === "tour_scheduled") {
        const tourMs = md ? parseTourDateYmdUtcMs(md.tour_date) : null;
        const startTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        if (tourMs != null && tourMs < startTodayUtc) {
            out.push("tour_date_passed");
        }
    }

    const stale2dCut = subtractDays(now, config.highValueStaleDays).getTime();
    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < stale2dCut) {
        out.push("high_value_stale");
    }

    const stale7dCut = subtractDays(now, config.midFunnelStaleDays).getTime();
    if (QUEUE_LANE_MID_FUNNEL_STALE_STATUS_KEYS.has(sk) && updatedAt.getTime() < stale7dCut) {
        out.push("mid_funnel_stale");
    }

    const pkg = md && typeof md.demo_seed_package === "string" ? String(md.demo_seed_package) : "";
    const isDemoV2 = pkg === "enrollment_pipeline_demo_v2";
    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = isDemoV2 ? !hasPerson : !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) {
        out.push("missing_identity");
    }

    const dedup = [...new Set(out)];
    return dedup;
}

function collectLifecycleCode(input: {
    row: OpportunityAttentionEntityInput;
    defs: StatusDefinitionRow[];
    terminalStatusKeys: Set<string>;
    rules: OpportunityAttentionRuleConfigV1;
    nowMs: number;
}): OpportunityAttentionReason | null {
    if (!isOpportunityActiveForExecution({ statusKey: input.row.status_key, terminalStatusKeys: input.terminalStatusKeys })) {
        return null;
    }
    return computeOpportunityAttentionReason({
        row: {
            id: input.row.id,
            status_key: input.row.status_key,
            quote_total: input.row.quote_total ?? null,
            estimated_price_cents: input.row.estimated_price_cents,
            monetary_value_cents: input.row.monetary_value_cents,
            created_at: input.row.created_at,
            updated_at: input.row.updated_at,
        },
        defs: input.defs,
        rules: input.rules,
        nowMs: input.nowMs,
    });
}

function applyPolicies(
    codes: OpportunityAttentionReasonCode[],
    config: OpportunityAttentionResolvedConfig
): OpportunityAttentionReasonCode[] {
    return codes.filter((code) => config.policies[code]?.enabled !== false);
}

function toResolvedList(
    codes: OpportunityAttentionReasonCode[],
    config: OpportunityAttentionResolvedConfig
): ResolvedOpportunityAttentionReason[] {
    const ordered = sortReasonCodes(codes);
    return ordered.map((code) => ({
        code,
        label: labelForReasonCode(code, config),
        severity: severityForReasonCode(code, config),
    }));
}

/**
 * Canonical opportunity Needs Attention evaluator (resolver v1).
 * Union of QueueService lane rules + legacy attention-queue lifecycle rules; single implementation.
 */
export function resolveOpportunityAttention(input: OpportunityAttentionResolverInput): OpportunityAttentionResult {
    const now = new Date(input.nowMs);
    const cfg = input.config ?? createDefaultOpportunityAttentionResolvedConfig();

    const rulesV1: OpportunityAttentionRuleConfigV1 = { version: 1, thresholdsHours: { ...cfg.thresholdsHours } };
    const terminalStatusKeys = terminalOpportunityStatusKeysFromDefs(input.defs);

    const queueCodes = collectQueueLaneCodes({
        row: input.opportunity,
        now,
        config: cfg,
    });

    const life = collectLifecycleCode({
        row: input.opportunity,
        defs: input.defs,
        terminalStatusKeys,
        rules: rulesV1,
        nowMs: input.nowMs,
    });

    const merged: OpportunityAttentionReasonCode[] = [...queueCodes];
    if (life) merged.push(life);

    const enabledCodes = applyPolicies([...new Set(merged)], cfg);
    const reasons = toResolvedList(enabledCodes, cfg);
    const activityStale = input.optionalSignals?.activityStale ?? null;

    return {
        needs_attention: reasons.length > 0,
        reasons,
        primary_reason: reasons[0] ?? null,
        auxiliary: {
            activity_stale:
                cfg.auxiliary_signals_enabled && activityStale ? activityStale : null,
        },
        resolver_version: OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
        computed_at_iso: now.toISOString(),
    };
}
