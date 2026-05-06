import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { AttentionReasonCountSummary } from "@/lib/workspace/attentionReasonCountsSummary";
import { labelForReasonCode, type OpportunityAttentionResolvedConfig } from "@/lib/opportunities/opportunityAttentionConfig";
import { isOpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";

/**
 * Org/work-unit tunable “Needs attention” buckets (department lane + deep links).
 *
 * **Config path:** `metadata.opportunity_attention_rules.needs_attention_buckets` (JSON array).
 *
 * **Precedence:** work unit metadata → department metadata → {@link DEFAULT_NEEDS_ATTENTION_BUCKETS}
 * (see {@link resolveNeedsAttentionBucketsWithPrecedence}).
 *
 * **Counts (department lane):** Prefer {@link bucketCountsFromResolverMatches} over work-unit-scoped
 * resolver matches so totals align with the execution queue; histogram sums ({@link hydrateNeedsAttentionBucketCounts})
 * remain useful for org-wide previews only — see `docs/execution/crm-opportunity-needs-attention-count-semantics.md`.
 */
export type NeedsAttentionBucketConfig = {
    key: string;
    label: string;
    description: string | null;
    enabled: boolean;
    order: number;
    /** Canonical reason codes belonging to this bucket (stable filters). */
    reason_codes: string[];
};

/** True when resolver says needs_attention and any reason matches the bucket’s canonical codes. */
export function opportunityAttentionResultMatchesBucket(
    resolved: OpportunityAttentionResult,
    bucket: Pick<NeedsAttentionBucketConfig, "reason_codes">,
): boolean {
    if (!resolved.needs_attention) return false;
    const codes = new Set(bucket.reason_codes.map((c) => c.trim()).filter(Boolean));
    return resolved.reasons.some((r) => codes.has(String(r.code ?? "").trim()));
}

/**
 * Platform-default bucket catalog — safe starting labels only; orgs override via metadata.
 * Maps only to canonical resolver reason codes (no expressions).
 */
export const DEFAULT_NEEDS_ATTENTION_BUCKETS: readonly NeedsAttentionBucketConfig[] = [
    {
        key: "follow_up_overdue",
        label: "Follow-up overdue",
        description: "Records where the next family follow-up is overdue.",
        enabled: true,
        order: 10,
        reason_codes: ["follow_up_date_passed", "stale_quote_followup"],
    },
];

export function attentionRulesRootFromMetadata(metadata: unknown): Record<string, unknown> | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const root = (metadata as Record<string, unknown>).opportunity_attention_rules;
    if (root == null || typeof root !== "object" || Array.isArray(root)) return null;
    return root as Record<string, unknown>;
}

function parseBucketsArray(raw: unknown): NeedsAttentionBucketConfig[] | null {
    if (!Array.isArray(raw)) return null;
    const out: NeedsAttentionBucketConfig[] = [];
    for (const row of raw) {
        if (row == null || typeof row !== "object" || Array.isArray(row)) continue;
        const o = row as Record<string, unknown>;
        const key = typeof o.key === "string" ? o.key.trim() : "";
        if (!key) continue;
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const description = typeof o.description === "string" ? o.description.trim() || null : null;
        const enabled = o.enabled !== false;
        const order =
            typeof o.order === "number" && Number.isFinite(o.order) ? Math.floor(o.order) : DEFAULT_ORDER_FALLBACK(key);
        const rcRaw = o.reason_codes;
        const reason_codes: string[] = [];
        if (Array.isArray(rcRaw)) {
            for (const x of rcRaw) {
                if (typeof x !== "string" || !x.trim()) continue;
                const t = x.trim();
                if (isOpportunityAttentionReasonCode(t)) reason_codes.push(t);
            }
        }
        if (!reason_codes.length) continue;
        out.push({
            key,
            label: label || key,
            description,
            enabled,
            order,
            reason_codes,
        });
    }
    return out.length ? out : null;
}

function DEFAULT_ORDER_FALLBACK(key: string): number {
    const hit = DEFAULT_NEEDS_ATTENTION_BUCKETS.find((b) => b.key === key);
    return hit?.order ?? 100;
}

/**
 * Merge metadata buckets with {@link DEFAULT_NEEDS_ATTENTION_BUCKETS} by key (unknown keys append).
 * When no `needs_attention_buckets` array exists in metadata, returns platform defaults only.
 */
export function resolveNeedsAttentionBucketsFromMetadata(metadata: unknown): NeedsAttentionBucketConfig[] {
    const root = attentionRulesRootFromMetadata(metadata);
    const parsed = root ? parseBucketsArray(root.needs_attention_buckets) : null;
    if (!parsed?.length) return [...DEFAULT_NEEDS_ATTENTION_BUCKETS];

    const byKey = new Map<string, NeedsAttentionBucketConfig>();
    for (const d of DEFAULT_NEEDS_ATTENTION_BUCKETS) byKey.set(d.key, { ...d });
    for (const b of parsed) byKey.set(b.key, b);
    return [...byKey.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/**
 * Pick metadata object that owns `needs_attention_buckets` — **work unit wins** when the key is present
 * (including `[]`), otherwise department, otherwise callers should treat as “no overlay” and use defaults-only path.
 */
export function pickMetadataForNeedsAttentionBuckets(workUnitMetadata: unknown, departmentMetadata: unknown): unknown {
    const wuRoot = attentionRulesRootFromMetadata(workUnitMetadata);
    if (wuRoot && Object.prototype.hasOwnProperty.call(wuRoot, "needs_attention_buckets")) {
        return workUnitMetadata;
    }
    const deptRoot = attentionRulesRootFromMetadata(departmentMetadata);
    if (deptRoot && Object.prototype.hasOwnProperty.call(deptRoot, "needs_attention_buckets")) {
        return departmentMetadata;
    }
    return null;
}

/** Resolve bucket definitions: WU metadata → department metadata → merged defaults. */
export function resolveNeedsAttentionBucketsWithPrecedence(
    workUnitMetadata: unknown,
    departmentMetadata: unknown,
): NeedsAttentionBucketConfig[] {
    const picked = pickMetadataForNeedsAttentionBuckets(workUnitMetadata, departmentMetadata);
    return resolveNeedsAttentionBucketsFromMetadata(picked ?? {});
}

export type NeedsAttentionBucketWithCount = NeedsAttentionBucketConfig & { count: number };

/**
 * **Work-unit execution alignment:** count unique inquiries whose resolver `reasons[]` intersects the bucket’s
 * `reason_codes`. Matches filtered queue semantics better than summing histogram bins (especially for multi-code buckets).
 */
export function bucketCountsFromResolverMatches(
    buckets: readonly NeedsAttentionBucketConfig[],
    matches: ReadonlyArray<{ resolved: OpportunityAttentionResult }>,
): NeedsAttentionBucketWithCount[] {
    return buckets
        .filter((b) => b.enabled)
        .map((b) => {
            const codes = new Set(b.reason_codes.map((c) => c.trim()).filter(Boolean));
            let count = 0;
            for (const m of matches) {
                const r = m.resolved;
                if (!r.needs_attention || !r.primary_reason) continue;
                if (r.reasons.some((rr) => codes.has(rr.code))) count++;
            }
            return { ...b, count };
        })
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/**
 * Sum histogram bins for each bucket’s `reason_codes` (reason occurrences — **not** unique inquiries).
 * Prefer {@link bucketCountsFromResolverMatches} for department lanes scoped to a work unit.
 */
export function hydrateNeedsAttentionBucketCounts(
    buckets: readonly NeedsAttentionBucketConfig[],
    histogram: readonly AttentionReasonCountSummary[] | null | undefined,
): NeedsAttentionBucketWithCount[] {
    const byReason = new Map<string, number>();
    for (const row of histogram ?? []) {
        const k = String(row.reason_key ?? "").trim();
        if (!k) continue;
        byReason.set(k, Math.max(0, Math.floor(Number(row.count) || 0)));
    }
    return buckets
        .filter((b) => b.enabled)
        .map((b) => {
            let count = 0;
            for (const code of b.reason_codes) {
                count += byReason.get(code) ?? 0;
            }
            return { ...b, count };
        })
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/** Apply org label overrides from resolver config (`reason_overrides.label`) when a bucket maps a single code. */
export function applyAttentionConfigLabelsToBuckets(
    buckets: readonly NeedsAttentionBucketWithCount[],
    config: OpportunityAttentionResolvedConfig,
): NeedsAttentionBucketWithCount[] {
    return buckets.map((b) => {
        let label = b.label;
        if (b.reason_codes.length === 1) {
            const code = b.reason_codes[0]!;
            if (isOpportunityAttentionReasonCode(code)) {
                label = labelForReasonCode(code, config);
            }
        }
        return label === b.label ? b : { ...b, label };
    });
}
