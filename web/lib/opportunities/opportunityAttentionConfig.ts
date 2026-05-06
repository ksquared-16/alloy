import type { OpportunityAttentionReason } from "@/lib/workspace/opportunityAttentionRules";
import {
    DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1,
    parseOpportunityAttentionRuleConfigV1FromMetadata,
    type OpportunityAttentionRuleConfigV1,
} from "@/lib/workspace/opportunityAttentionRules";
import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/opportunityAttentionResolver";

export type OpportunityAttentionSeverity = "critical" | "high" | "medium" | "low";

export type OpportunityAttentionReasonPolicy = {
    enabled: boolean;
    label?: string;
    severity?: OpportunityAttentionSeverity;
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
        follow_up_date_passed: { enabled: true, severity: "high" },
        tour_date_passed: { enabled: true, severity: "high" },
        high_value_stale: { enabled: true, severity: "medium" },
        mid_funnel_stale: { enabled: true, severity: "medium" },
        missing_identity: { enabled: true, severity: "high" },
        stale_new_inquiry: { enabled: true, severity: "medium" },
        stale_qualified: { enabled: true, severity: "medium" },
        stale_quote_followup: { enabled: true, severity: "medium" },
        missing_quote_after_execution: { enabled: true, severity: "medium" },
    };
    return defaults;
}

function defaultLabels(): Record<OpportunityAttentionReasonCode, string> {
    return {
        follow_up_date_passed: "Follow-up date passed",
        tour_date_passed: "Tour date passed — follow up",
        high_value_stale: "High-value stale > 2 days",
        mid_funnel_stale: "Stale > 7 days",
        missing_identity: "Missing contact/customer",
        stale_new_inquiry: "New inquiry is stale",
        stale_qualified: "Qualified but not progressing",
        stale_quote_followup: "Priced follow-up is stale",
        missing_quote_after_execution: "Quoting started but no offer yet",
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
 */
export function resolveOpportunityAttentionConfigFromMetadata(metadata: unknown): OpportunityAttentionResolvedConfig {
    const out = createDefaultOpportunityAttentionResolvedConfig();
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
    }

    return out;
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
    return config.policies[code]?.severity ?? "medium";
}
