import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { ReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import {
    DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1,
    parseOpportunityAttentionRuleConfigV1FromMetadata,
    type OpportunityAttentionReason,
    type OpportunityAttentionRuleConfigV1,
} from "@/lib/workspace/opportunityAttentionRules";
import {
    DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1,
    resolveReadinessAttentionProjectionProfileFromMetadata,
    type ReadinessAttentionProjectionProfileV1,
} from "@/lib/opportunities/readinessAttentionProjectionProfile";
import {
    DEFAULT_WAIT_BUCKET_SLA_HOURS,
    PLATFORM_PRIMARY_REASON_PRIORITY_ORDER,
    type EnrollmentWaitBucket,
    type OpportunityAttentionReasonCode,
    DEFAULT_SEVERITY_BY_REASON,
    isOpportunityAttentionReasonCode,
} from "@/lib/opportunities/attentionPlatformCatalog";

export type OpportunityAttentionSeverity = "critical" | "high" | "medium" | "low";

export type OpportunityAttentionReasonPolicy = {
    enabled: boolean;
    label?: string;
    severity?: OpportunityAttentionSeverity;
};

export type WaitBucketSlaHoursConfig = {
    warning_hours: number;
    critical_hours: number;
};

/**
 * Effective attention config for {@link resolveOpportunityAttention}.
 * Single algorithm: flags/thresholds only — no duplicate evaluators.
 */
export type OpportunityAttentionResolvedConfig = {
    version: 2;
    /** Hours-based thresholds for lifecycle reasons (v1 metadata shape). */
    thresholdsHours: OpportunityAttentionRuleConfigV1["thresholdsHours"];
    /** Mirrors QueueService high-value stale window. */
    highValueStaleDays: number;
    /** Mirrors QueueService mid-funnel stale window. */
    midFunnelStaleDays: number;
    /** Optional informational copy for auxiliary inputs (workflow/activity UI). Ignored unless future flags enable it. */
    auxiliary_signals_enabled: boolean;
    policies: Record<OpportunityAttentionReasonCode, OpportunityAttentionReasonPolicy>;
    /**
     * Platform SLA defaults for wait buckets (calendar-hour placeholders).
     * Tenants override via {@link wait_bucket_sla_hours}.
     */
    default_wait_bucket_sla_hours: Record<Exclude<EnrollmentWaitBucket, "none">, WaitBucketSlaHoursConfig>;
    /** Optional per-bucket SLA overrides (hours). */
    wait_bucket_sla_hours?: Partial<Record<Exclude<EnrollmentWaitBucket, "none">, WaitBucketSlaHoursConfig>>;
    /**
     * When set, replaces {@link PLATFORM_PRIMARY_REASON_PRIORITY_ORDER} for primary_reason selection.
     * Must only contain known reason codes (unknown entries stripped at parse time).
     */
    primary_reason_priority_order: OpportunityAttentionReasonCode[] | null;
    /** Optional weights for {@link computeAttentionPriorityScore} (sum normalization handled there). */
    priority_score_weights?: Partial<
        Record<"severity" | "sla" | "value" | "multi_reason" | "commitment", number>
    >;
    /** Readiness → attention projection policy (Phase 1). */
    readiness_projection: ReadinessAttentionProjectionProfileV1;
};

const LEGACY_KEYS: OpportunityAttentionReason[] = [
    "stale_new_inquiry",
    "stale_qualified",
    "stale_quote_followup",
    "missing_quote_after_execution",
];

type ReasonOverridesPartial = Partial<
    Record<
        OpportunityAttentionReasonCode,
        {
            enabled?: boolean;
            label?: string;
            severity?: OpportunityAttentionSeverity;
        }
    >
>;

function defaultPolicies(): Record<OpportunityAttentionReasonCode, OpportunityAttentionReasonPolicy> {
    const defaults: Record<OpportunityAttentionReasonCode, OpportunityAttentionReasonPolicy> = {
        blocked_internal: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.blocked_internal },
        waiting_on_staff: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.waiting_on_staff },
        missing_identity: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.missing_identity },
        missing_required_info: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.missing_required_info },
        overdue_commitment: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.overdue_commitment },
        tour_date_passed: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.tour_date_passed },
        follow_up_date_passed: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.follow_up_date_passed },
        missing_quote_after_execution: {
            enabled: true,
            severity: DEFAULT_SEVERITY_BY_REASON.missing_quote_after_execution,
        },
        stale_quote_followup: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.stale_quote_followup },
        waiting_on_family: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.waiting_on_family },
        waiting_on_documents: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.waiting_on_documents },
        waiting_on_payment: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.waiting_on_payment },
        blocked_external: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.blocked_external },
        high_value_stale: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.high_value_stale },
        mid_funnel_stale: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.mid_funnel_stale },
        stale_qualified: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.stale_qualified },
        stale_new_inquiry: { enabled: true, severity: DEFAULT_SEVERITY_BY_REASON.stale_new_inquiry },
    };
    return defaults;
}

function defaultLabels(): Record<OpportunityAttentionReasonCode, string> {
    return {
        blocked_internal: "Blocked internally",
        waiting_on_staff: "Waiting on staff",
        missing_identity: "Missing contact/customer",
        missing_required_info: "Required information missing",
        overdue_commitment: "Commitment overdue",
        tour_date_passed: "Tour date passed — follow up",
        follow_up_date_passed: "Follow-up overdue",
        missing_quote_after_execution: "Missing quote",
        stale_quote_followup: "Quote follow-up overdue",
        waiting_on_family: "Waiting on family",
        waiting_on_documents: "Waiting on documents",
        waiting_on_payment: "Waiting on payment",
        blocked_external: "Blocked externally",
        high_value_stale: "High-value stale > 2 days",
        mid_funnel_stale: "Stale > 7 days",
        stale_qualified: "Qualified but not progressing",
        stale_new_inquiry: "New inquiry is stale",
    };
}

export const DEFAULT_OPPORTUNITY_ATTENTION_LABELS: Readonly<Record<OpportunityAttentionReasonCode, string>> =
    defaultLabels();

export function createDefaultOpportunityAttentionResolvedConfig(): OpportunityAttentionResolvedConfig {
    return {
        version: 2,
        thresholdsHours: { ...DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1.thresholdsHours },
        highValueStaleDays: 2,
        midFunnelStaleDays: 7,
        auxiliary_signals_enabled: false,
        policies: defaultPolicies(),
        default_wait_bucket_sla_hours: { ...DEFAULT_WAIT_BUCKET_SLA_HOURS },
        wait_bucket_sla_hours: undefined,
        primary_reason_priority_order: null,
        priority_score_weights: undefined,
        readiness_projection: { ...DEFAULT_READINESS_ATTENTION_PROJECTION_PROFILE_V1 },
    };
}

function parseReasonOverridesDeep(raw: unknown): ReasonOverridesPartial | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const ro = o.reason_overrides;
    if (ro == null || typeof ro !== "object" || Array.isArray(ro)) return null;
    return ro as ReasonOverridesPartial;
}

function parseOptionalDays(raw: unknown, key: string, fallback: number): number {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return fallback;
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return fallback;
    return Math.floor(v);
}

function parseAuxiliarySignalsEnabled(raw: unknown): boolean {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return false;
    const v = (raw as Record<string, unknown>).auxiliary_signals_enabled;
    return v === true;
}

function parsePrimaryReasonPriorityOrder(raw: unknown): OpportunityAttentionReasonCode[] | null {
    if (!Array.isArray(raw)) return null;
    const canon = new Set(PLATFORM_PRIMARY_REASON_PRIORITY_ORDER as readonly string[]);
    const out: OpportunityAttentionReasonCode[] = [];
    for (const x of raw) {
        if (typeof x !== "string") continue;
        const c = x.trim();
        if (canon.has(c) && isOpportunityAttentionReasonCode(c)) out.push(c);
    }
    return out.length ? out : null;
}

function parseWaitBucketSlaOverrides(
    raw: unknown
): Partial<Record<Exclude<EnrollmentWaitBucket, "none">, WaitBucketSlaHoursConfig>> | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const buckets = [
        "waiting_on_staff",
        "blocked_internal",
        "waiting_on_family",
        "waiting_on_documents",
        "waiting_on_payment",
        "blocked_external",
    ] as const;
    const out: Partial<Record<Exclude<EnrollmentWaitBucket, "none">, WaitBucketSlaHoursConfig>> = {};
    for (const b of buckets) {
        const v = o[b];
        if (v == null || typeof v !== "object" || Array.isArray(v)) continue;
        const r = v as Record<string, unknown>;
        const wh = r.warning_hours;
        const ch = r.critical_hours;
        if (typeof wh !== "number" || typeof ch !== "number" || !Number.isFinite(wh) || !Number.isFinite(ch)) continue;
        out[b] = {
            warning_hours: Math.max(0, Math.floor(wh)),
            critical_hours: Math.max(0, Math.floor(ch)),
        };
    }
    return Object.keys(out).length ? out : undefined;
}

function parsePriorityScoreWeights(
    raw: unknown
): Partial<Record<"severity" | "sla" | "value" | "multi_reason" | "commitment", number>> | undefined {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const o = raw as Record<string, unknown>;
    const dims = ["severity", "sla", "value", "multi_reason", "commitment"] as const;
    const out: Partial<Record<(typeof dims)[number], number>> = {};
    for (const d of dims) {
        const v = o[d];
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) continue;
        out[d] = Math.min(1, Math.max(0.05, v));
    }
    return Object.keys(out).length ? out : undefined;
}

function mergeOverrides(
    base: Record<OpportunityAttentionReasonCode, OpportunityAttentionReasonPolicy>,
    overrides: ReasonOverridesPartial
): void {
    for (const key of Object.keys(overrides) as OpportunityAttentionReasonCode[]) {
        const patch = overrides[key];
        if (!patch || typeof patch !== "object") continue;
        const cur = base[key];
        if (!cur) continue;
        base[key] = {
            enabled: patch.enabled !== undefined ? patch.enabled : cur.enabled,
            label: patch.label?.trim() || cur.label,
            severity: patch.severity ?? cur.severity,
        };
    }
}

/**
 * Read effective config from org/work_unit `metadata` (`opportunity_attention_rules` subtree).
 * Backwards compatible with v1 thresholds-only metadata; optional v1 extensions:
 * - `reason_overrides`
 * - `stale_high_value_days`, `stale_mid_funnel_days`
 * - `auxiliary_signals_enabled` (reserved; core membership ignores unless enabled elsewhere)
 * - `primary_reason_priority_order`, `sla_wait_hours`, `priority_score_weights`
 */
export function resolveOpportunityAttentionConfigFromMetadata(metadata: unknown): OpportunityAttentionResolvedConfig {
    const out = createDefaultOpportunityAttentionResolvedConfig();
    out.readiness_projection = resolveReadinessAttentionProjectionProfileFromMetadata(metadata);
    const root =
        metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
            ? ((metadata as Record<string, unknown>).opportunity_attention_rules as Record<string, unknown> | undefined)
            : undefined;

    const v1 = parseOpportunityAttentionRuleConfigV1FromMetadata(metadata);
    if (v1) {
        for (const k of LEGACY_KEYS) {
            out.thresholdsHours[k] = v1.thresholdsHours[k];
        }
    }
    if (root && typeof root === "object" && !Array.isArray(root)) {
        out.highValueStaleDays = parseOptionalDays(root, "stale_high_value_days", out.highValueStaleDays);
        out.midFunnelStaleDays = parseOptionalDays(root, "stale_mid_funnel_days", out.midFunnelStaleDays);
        out.auxiliary_signals_enabled = parseAuxiliarySignalsEnabled(root);
        const ro = parseReasonOverridesDeep(root);
        if (ro) mergeOverrides(out.policies, ro);

        const po = parsePrimaryReasonPriorityOrder(root.primary_reason_priority_order);
        if (po) out.primary_reason_priority_order = po;

        const sla = parseWaitBucketSlaOverrides(root.sla_wait_hours);
        if (sla) out.wait_bucket_sla_hours = sla;

        const pw = parsePriorityScoreWeights(root.priority_score_weights);
        if (pw) out.priority_score_weights = pw;
    }

    return out;
}

/** Shared shape for {@link enrichOpportunityRows} readiness bridge inputs. */
export function buildOpportunityAttentionEnrichResolution(input: {
    defs: StatusDefinitionRow[];
    config: OpportunityAttentionResolvedConfig;
    nowMs: number;
    departmentMetadata?: unknown | null;
    departmentId?: string | null;
    readinessMemoScope?: ReadinessMemoScope;
}) {
    return {
        defs: input.defs,
        config: input.config,
        nowMs: input.nowMs,
        departmentMetadata: input.departmentMetadata ?? null,
        departmentId: input.departmentId ?? null,
        readinessMemoScope: input.readinessMemoScope,
    };
}

/** Work unit metadata overrides department for `opportunity_attention_rules` (matches bucket precedence). */
export function mergeAttentionMetadataForConfig(
    workUnitMetadata: unknown,
    departmentMetadata: unknown
): unknown {
    if (workUnitMetadata == null && departmentMetadata == null) return null;
    if (workUnitMetadata == null) return departmentMetadata;
    if (departmentMetadata == null) return workUnitMetadata;
    if (typeof workUnitMetadata !== "object" || Array.isArray(workUnitMetadata)) return departmentMetadata;
    if (typeof departmentMetadata !== "object" || Array.isArray(departmentMetadata)) return workUnitMetadata;
    const wu = workUnitMetadata as Record<string, unknown>;
    const dept = departmentMetadata as Record<string, unknown>;
    const wuRules = wu.opportunity_attention_rules;
    const deptRules = dept.opportunity_attention_rules;
    const mergedRules =
        typeof deptRules === "object" && deptRules && !Array.isArray(deptRules)
            ? {
                  ...(deptRules as Record<string, unknown>),
                  ...(typeof wuRules === "object" && wuRules && !Array.isArray(wuRules)
                      ? (wuRules as Record<string, unknown>)
                      : {}),
              }
            : wuRules;
    return {
        ...dept,
        ...wu,
        ...(mergedRules != null ? { opportunity_attention_rules: mergedRules } : {}),
    };
}

export function effectivePrimaryReasonPriorityOrder(
    config: OpportunityAttentionResolvedConfig
): readonly OpportunityAttentionReasonCode[] {
    return config.primary_reason_priority_order?.length
        ? config.primary_reason_priority_order
        : PLATFORM_PRIMARY_REASON_PRIORITY_ORDER;
}

export function labelForReasonCode(
    code: OpportunityAttentionReasonCode,
    config: OpportunityAttentionResolvedConfig
): string {
    const override = config.policies[code]?.label?.trim();
    if (override) return override;
    return DEFAULT_OPPORTUNITY_ATTENTION_LABELS[code];
}

export function severityForReasonCode(
    code: OpportunityAttentionReasonCode,
    config: OpportunityAttentionResolvedConfig
): OpportunityAttentionSeverity {
    const pol = config.policies[code]?.severity;
    if (pol) return pol;
    return DEFAULT_SEVERITY_BY_REASON[code] ?? "medium";
}
