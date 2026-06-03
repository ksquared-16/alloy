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
    effectivePrimaryReasonPriorityOrder,
    labelForReasonCode,
    type OpportunityAttentionResolvedConfig,
    type OpportunityAttentionSeverity,
    severityForReasonCode,
} from "@/lib/opportunities/opportunityAttentionConfig";
import {
    PLATFORM_PRIMARY_REASON_PRIORITY_ORDER,
    waitBucketToAttentionReasonCode,
    type OpportunityAttentionReasonCode,
} from "@/lib/opportunities/attentionPlatformCatalog";
import { parseEnrollmentOperationalFromMetadata, type EnrollmentOperationalValidated } from "@/lib/opportunities/enrollmentOperationalMetadata";
import {
    attentionReasonCodeToWaitBucket,
    computeCommitmentReasonSla,
    computeStaleReasonSla,
    computeWaitReasonSla,
    type AttentionReasonSlaSlice,
    type AttentionSlaClockConfidence,
    type AttentionSlaTier,
} from "@/lib/opportunities/attentionSla";
import {
    computeAttentionPriorityScore,
    type PriorityDimensionContribution,
} from "@/lib/opportunities/attentionPriorityScore";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import {
    projectReadinessToAttentionReasons,
    type ProjectedReadinessAttentionReason,
} from "@/lib/opportunities/readinessAttentionProjection";
import type { ReadinessAttentionProjectionProfileV1 } from "@/lib/opportunities/readinessAttentionProjectionProfile";

export type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";

/** @deprecated Use PLATFORM_PRIMARY_REASON_PRIORITY_ORDER from attentionPlatformCatalog — alias for tests/back-compat */
export const OPPORTUNITY_ATTENTION_REASON_PRIORITY_ORDER = PLATFORM_PRIMARY_REASON_PRIORITY_ORDER;

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

export const OPPORTUNITY_ATTENTION_RESOLVER_VERSION = 2 as const;

export type OpportunityAttentionSignalInput = {
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

/** Per-request shared defs/config/time cuts — avoids recomputing terminal keys and stale thresholds per row. */
export type OpportunityAttentionResolverBatchContext = {
    terminalStatusKeys: Set<string>;
    rulesV1: OpportunityAttentionRuleConfigV1;
    nowDate: Date;
    startTodayUtcMs: number;
    stale2dCutMs: number;
    stale7dCutMs: number;
};

export function createOpportunityAttentionResolverBatchContext(
    defs: StatusDefinitionRow[],
    config: OpportunityAttentionResolvedConfig,
    nowMs: number
): OpportunityAttentionResolverBatchContext {
    const nowDate = new Date(nowMs);
    return {
        terminalStatusKeys: terminalOpportunityStatusKeysFromDefs(defs),
        rulesV1: { version: 1, thresholdsHours: { ...config.thresholdsHours } },
        nowDate,
        startTodayUtcMs: Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()),
        stale2dCutMs: subtractDays(nowDate, config.highValueStaleDays).getTime(),
        stale7dCutMs: subtractDays(nowDate, config.midFunnelStaleDays).getTime(),
    };
}

export type OpportunityAttentionResolverInput = {
    opportunity: OpportunityAttentionEntityInput;
    nowMs: number;
    defs: StatusDefinitionRow[];
    config?: OpportunityAttentionResolvedConfig;
    optionalSignals?: OpportunityAttentionSignalInput | null;
    batch?: OpportunityAttentionResolverBatchContext;
    /**
     * Optional row context for SLA clock fallback (status transition time when available).
     * QueueService standalone paths omit this in GATE 3.
     */
    rowContext?: {
        lastStatusTransitionAtIso?: string | null;
    } | null;
    /**
     * Optional readiness snapshot (`record_view` trigger) — projected to attention reasons.
     * Evaluator must run outside the resolver; pass result only.
     */
    readiness?: ReadinessResult | null;
    /** Override profile; defaults to `config.readiness_projection`. */
    readinessProjectionProfile?: ReadinessAttentionProjectionProfileV1 | null;
};

export type ResolvedOpportunityAttentionReason = {
    code: OpportunityAttentionReasonCode;
    label: string;
    severity: OpportunityAttentionSeverity;
    sla_tier: AttentionSlaTier;
    sla_clock_confidence: AttentionSlaClockConfidence;
    /** Present when reason was projected from readiness gaps. */
    readiness_gap_ids?: string[];
    attention_source?: "platform" | "readiness";
};

export type AttentionWaitingFacet = {
    bucket: EnrollmentOperationalValidated["wait_bucket"];
    since_iso: string | null;
    active: boolean;
};

export type OpportunityAttentionResult = {
    needs_attention: boolean;
    reasons: ResolvedOpportunityAttentionReason[];
    primary_reason: ResolvedOpportunityAttentionReason | null;
    waiting: AttentionWaitingFacet;
    priority_score: number;
    priority_breakdown: PriorityDimensionContribution[];
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

function sortReasonCodes(codes: OpportunityAttentionReasonCode[], cfg: OpportunityAttentionResolvedConfig): OpportunityAttentionReasonCode[] {
    const order = effectivePrimaryReasonPriorityOrder(cfg);
    const idx = new Map(order.map((c, i) => [c, i]));
    return [...codes].sort((a, b) => {
        const ia = idx.get(a) ?? 1000;
        const ib = idx.get(b) ?? 1000;
        if (ia !== ib) return ia - ib;
        return a.localeCompare(b);
    });
}

function resolveWaitElapsedMs(params: {
    eo: EnrollmentOperationalValidated;
    row: OpportunityAttentionEntityInput;
    rowContext?: OpportunityAttentionResolverInput["rowContext"];
    nowMs: number;
}): { elapsedMs: number | null; confidence: AttentionSlaClockConfidence } {
    const { eo, row, rowContext, nowMs } = params;
    if (eo.wait_since) {
        const t = Date.parse(eo.wait_since);
        if (Number.isFinite(t)) return { elapsedMs: Math.max(0, nowMs - t), confidence: "high" };
    }
    const trans = rowContext?.lastStatusTransitionAtIso;
    if (trans) {
        const t = Date.parse(trans);
        if (Number.isFinite(t)) return { elapsedMs: Math.max(0, nowMs - t), confidence: "medium" };
    }
    if (row.updated_at) {
        const t = Date.parse(row.updated_at);
        if (Number.isFinite(t)) return { elapsedMs: Math.max(0, nowMs - t), confidence: "low" };
    }
    if (row.created_at) {
        const t = Date.parse(row.created_at);
        if (Number.isFinite(t)) return { elapsedMs: Math.max(0, nowMs - t), confidence: "low" };
    }
    return { elapsedMs: null, confidence: "low" };
}

function slaSliceForReason(
    code: OpportunityAttentionReasonCode,
    ctx: {
        eo: EnrollmentOperationalValidated;
        md: Record<string, unknown> | null;
        row: OpportunityAttentionEntityInput;
        nowMs: number;
        config: OpportunityAttentionResolvedConfig;
        rowContext?: OpportunityAttentionResolverInput["rowContext"];
    }
): AttentionReasonSlaSlice {
    const wb = attentionReasonCodeToWaitBucket(code);
    if (wb) {
        const { elapsedMs, confidence } = resolveWaitElapsedMs({
            eo: ctx.eo,
            row: ctx.row,
            rowContext: ctx.rowContext,
            nowMs: ctx.nowMs,
        });
        return computeWaitReasonSla({
            bucket: wb,
            elapsedMs,
            clockConfidence: confidence,
            config: ctx.config,
        });
    }
    if (code === "follow_up_date_passed" || code === "tour_date_passed" || code === "overdue_commitment") {
        return computeCommitmentReasonSla();
    }
    if (code === "missing_identity") {
        return { tier: "breached", clock_confidence: "medium", elapsed_ms: null };
    }
    return computeStaleReasonSla();
}

function collectQueueLaneCodes(input: {
    row: OpportunityAttentionEntityInput;
    now: Date;
    config: OpportunityAttentionResolvedConfig;
    batch?: OpportunityAttentionResolverBatchContext;
}): OpportunityAttentionReasonCode[] {
    const { row, now, config, batch } = input;
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
    const nowMs = batch?.nowDate.getTime() ?? now.getTime();

    const nfu = parseMetadataInstantMs(md, "next_follow_up_at");
    const tourMs = md ? parseTourDateYmdUtcMs(md.tour_date) : null;
    const startTodayUtc = batch?.startTodayUtcMs ?? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const hasUpcomingTour = sk === "tour_scheduled" && tourMs != null && tourMs >= startTodayUtc;

    if (nfu != null && nfu < nowMs && !hasUpcomingTour) {
        out.push("follow_up_date_passed");
    }

    const commitmentDue = parseMetadataInstantMs(md, "commitment_due_at");
    if (commitmentDue != null && commitmentDue < nowMs) {
        out.push("overdue_commitment");
    }

    if (sk === "tour_scheduled") {
        const startTodayUtc = batch?.startTodayUtcMs ?? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        if (tourMs != null && tourMs < startTodayUtc) {
            out.push("tour_date_passed");
        }
    }

    const stale2dCut = batch?.stale2dCutMs ?? subtractDays(now, config.highValueStaleDays).getTime();
    if (OPPORTUNITY_HIGH_VALUE_STALE_STATUS_KEY_SET.has(sk) && updatedAt.getTime() < stale2dCut) {
        out.push("high_value_stale");
    }

    const stale7dCut = batch?.stale7dCutMs ?? subtractDays(now, config.midFunnelStaleDays).getTime();
    if (QUEUE_LANE_MID_FUNNEL_STALE_STATUS_KEYS.has(sk) && updatedAt.getTime() < stale7dCut) {
        out.push("mid_funnel_stale");
    }

    const hasPerson = row.primary_person_id != null && String(row.primary_person_id).trim() !== "";
    const hasLegacyContact = row.primary_contact_id != null && String(row.primary_contact_id).trim() !== "";
    const missingContactLike = !(hasPerson || hasLegacyContact);
    if (missingContactLike || row.customer_id == null) {
        out.push("missing_identity");
    }

    return [...new Set(out)];
}

function collectWaitingCodesFromEo(eo: EnrollmentOperationalValidated): OpportunityAttentionReasonCode[] {
    if (eo.wait_bucket === "none") return [];
    return [waitBucketToAttentionReasonCode(eo.wait_bucket)];
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
    orderedCodes: OpportunityAttentionReasonCode[],
    config: OpportunityAttentionResolvedConfig,
    slaCtx: {
        eo: EnrollmentOperationalValidated;
        md: Record<string, unknown> | null;
        row: OpportunityAttentionEntityInput;
        nowMs: number;
        rowContext?: OpportunityAttentionResolverInput["rowContext"];
    },
    projectedByCode?: Map<OpportunityAttentionReasonCode, ProjectedReadinessAttentionReason>
): ResolvedOpportunityAttentionReason[] {
    return orderedCodes.map((code) => {
        const projected = projectedByCode?.get(code);
        if (projected) {
            return {
                code,
                label: projected.label,
                severity: projected.severity,
                sla_tier: projected.severity === "high" || projected.severity === "critical" ? "breached" : "approaching",
                sla_clock_confidence: "high" as AttentionSlaClockConfidence,
                readiness_gap_ids: projected.readiness_gap_ids,
                attention_source: "readiness",
            };
        }
        const sla = slaSliceForReason(code, { ...slaCtx, config });
        return {
            code,
            label: labelForReasonCode(code, config),
            severity: severityForReasonCode(code, config),
            sla_tier: sla.tier,
            sla_clock_confidence: sla.clock_confidence,
            attention_source: "platform",
        };
    });
}

function mergeReadinessProjectedCodes(
    platformCodes: OpportunityAttentionReasonCode[],
    readiness: ReadinessResult | null | undefined,
    profile: ReadinessAttentionProjectionProfileV1
): {
    codes: OpportunityAttentionReasonCode[];
    projectedByCode: Map<OpportunityAttentionReasonCode, ProjectedReadinessAttentionReason>;
} {
    const projected = projectReadinessToAttentionReasons(readiness, profile);
    const projectedByCode = new Map<OpportunityAttentionReasonCode, ProjectedReadinessAttentionReason>();
    for (const p of projected) {
        projectedByCode.set(p.code, p);
    }
    const codes = [...new Set([...platformCodes, ...projected.map((p) => p.code)])];
    return { codes, projectedByCode };
}

/**
 * Canonical opportunity operational attention evaluator (resolver v2).
 * Single implementation for QueueService + workspace + APIs.
 */
export function resolveOpportunityAttention(input: OpportunityAttentionResolverInput): OpportunityAttentionResult {
    const cfg = input.config ?? createDefaultOpportunityAttentionResolvedConfig();
    const batch =
        input.batch ?? createOpportunityAttentionResolverBatchContext(input.defs, cfg, input.nowMs);
    const now = batch.nowDate;

    const md = opportunityMetadataRecord(input.opportunity.metadata);
    const eo = parseEnrollmentOperationalFromMetadata(md);

    const queueCodes = collectQueueLaneCodes({
        row: input.opportunity,
        now,
        config: cfg,
        batch,
    });

    const life = collectLifecycleCode({
        row: input.opportunity,
        defs: input.defs,
        terminalStatusKeys: batch.terminalStatusKeys,
        rules: batch.rulesV1,
        nowMs: input.nowMs,
    });

    const waitingCodes = collectWaitingCodesFromEo(eo);

    const mergedPlatform: OpportunityAttentionReasonCode[] = [...queueCodes];
    if (life) mergedPlatform.push(life);
    mergedPlatform.push(...waitingCodes);

    const projectionProfile = input.readinessProjectionProfile ?? cfg.readiness_projection;
    const { codes: mergedWithReadiness, projectedByCode } = mergeReadinessProjectedCodes(
        mergedPlatform,
        input.readiness,
        projectionProfile
    );

    const enabledCodes = applyPolicies([...new Set(mergedWithReadiness)], cfg);
    const orderedCodes = sortReasonCodes(enabledCodes, cfg);

    const slaCtxBase = {
        eo,
        md,
        row: input.opportunity,
        nowMs: input.nowMs,
        rowContext: input.rowContext,
    };

    const reasons = toResolvedList(orderedCodes, cfg, slaCtxBase, projectedByCode);

    const activityStale = input.optionalSignals?.activityStale ?? null;

    const commitmentCodes: OpportunityAttentionReasonCode[] = [
        "follow_up_date_passed",
        "tour_date_passed",
        "overdue_commitment",
    ];
    const hasCommitmentReason = reasons.some((r) => commitmentCodes.includes(r.code));

    const { score, breakdown } = computeAttentionPriorityScore({
        severities: reasons.map((r) => r.severity),
        slaTiers: reasons.map((r) => r.sla_tier),
        monetary_value_cents: input.opportunity.monetary_value_cents,
        distinctReasonCount: reasons.length,
        hasCommitmentReason,
        weights: cfg.priority_score_weights,
    });

    const waitingFacet: AttentionWaitingFacet = {
        bucket: eo.wait_bucket,
        since_iso: eo.wait_since,
        active: eo.wait_bucket !== "none",
    };

    return {
        needs_attention: reasons.length > 0,
        reasons,
        primary_reason: reasons[0] ?? null,
        waiting: waitingFacet,
        priority_score: reasons.length > 0 ? score : 0,
        priority_breakdown: breakdown,
        auxiliary: {
            activity_stale: cfg.auxiliary_signals_enabled && activityStale ? activityStale : null,
        },
        resolver_version: OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
        computed_at_iso: now.toISOString(),
    };
}
