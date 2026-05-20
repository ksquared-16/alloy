import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { AttentionReasonCountSummary } from "@/lib/workspace/attentionReasonCountsSummary";
import { labelForReasonCode, type OpportunityAttentionResolvedConfig } from "@/lib/opportunities/opportunityAttentionConfig";
import { isOpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";

/**
 * Org/work-unit tunable “Needs attention” buckets (department lane + deep links).
 *
 * **Config path:** `metadata.opportunity_attention_rules.needs_attention_buckets` (JSON array).
 *
 * **Precedence:** work unit metadata → department metadata when `needs_attention_buckets` is present on that layer.
 * There are **no** vertical-specific platform defaults — only metadata-defined buckets (childcare enrollment demo:
 * `web/lib/opportunities/enrollmentNeedsAttentionBucketsSeed.ts` + `ensureEnrollmentPipelineWorkUnitV1.ts`).
 *
 * **Counts (department lane):** Prefer {@link bucketCountsFromResolverMatches} over work-unit-scoped
 * resolver matches so totals align with the execution queue; histogram sums ({@link hydrateNeedsAttentionBucketCounts})
 * remain useful for org-wide previews only — see `docs/system/workspace-system.md`.
 */
export type NeedsAttentionBucketConfig = {
    key: string;
    label: string;
    description: string | null;
    enabled: boolean;
    order: number;
    /**
     * Operational severity rank for UI (department lane, settings): **lower runs first**.
     * When omitted, {@link order} is used for tie-breaking and sort fallback.
     */
    priority?: number;
    /** Optional Lucide icon token (kebab-case), resolved via workspace icon registry. */
    icon?: string | null;
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
 * Intentionally **empty**: visible Needs Attention buckets are **never** inferred from platform code.
 * Orgs / vertical seeds define `metadata.opportunity_attention_rules.needs_attention_buckets`.
 */
export const DEFAULT_NEEDS_ATTENTION_BUCKETS: readonly NeedsAttentionBucketConfig[] = [];

export function compareNeedsAttentionBuckets(
    a: Pick<NeedsAttentionBucketConfig, "priority" | "order" | "label">,
    b: Pick<NeedsAttentionBucketConfig, "priority" | "order" | "label">,
): number {
    const pa = a.priority ?? a.order;
    const pb = b.priority ?? b.order;
    if (pa !== pb) return pa - pb;
    return a.order - b.order || a.label.localeCompare(b.label);
}

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
        const priority =
            typeof o.priority === "number" && Number.isFinite(o.priority) ? Math.floor(o.priority) : undefined;
        const iconRaw = o.icon;
        const icon = typeof iconRaw === "string" && iconRaw.trim() ? iconRaw.trim() : null;
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
        const bucketConfig: NeedsAttentionBucketConfig = {
            key,
            label: label || key,
            description,
            enabled,
            order,
            reason_codes,
        };
        if (priority !== undefined) bucketConfig.priority = priority;
        if (icon !== null) bucketConfig.icon = icon;
        out.push(bucketConfig);
    }
    return out.length ? out : null;
}

function DEFAULT_ORDER_FALLBACK(key: string): number {
    const hit = DEFAULT_NEEDS_ATTENTION_BUCKETS.find((b) => b.key === key);
    return hit?.order ?? hit?.priority ?? 100;
}

/**
 * Parsed buckets from metadata only. Requires `opportunity_attention_rules.needs_attention_buckets` to be **present**
 * (use `[]` for an explicit empty lens list). If the key is omitted, returns **[]** — no platform enrollment fallback.
 */
export function resolveNeedsAttentionBucketsFromMetadata(metadata: unknown): NeedsAttentionBucketConfig[] {
    const root = attentionRulesRootFromMetadata(metadata);
    if (!root) return [];
    if (!Object.prototype.hasOwnProperty.call(root, "needs_attention_buckets")) return [];
    const parsed = parseBucketsArray(root.needs_attention_buckets);
    if (!parsed?.length) return [];

    const byKey = new Map<string, NeedsAttentionBucketConfig>();
    for (const d of DEFAULT_NEEDS_ATTENTION_BUCKETS) byKey.set(d.key, { ...d });
    for (const b of parsed) {
        const prior = byKey.get(b.key);
        byKey.set(b.key, prior ? { ...prior, ...b } : b);
    }
    return [...byKey.values()].sort(compareNeedsAttentionBuckets);
}

/**
 * Pick metadata object that owns `needs_attention_buckets` — **work unit wins** when the key is present
 * (including `[]`), otherwise department. When neither layer defines the key, callers resolve to **no buckets** (not platform defaults).
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

/** Resolve bucket definitions: WU metadata → department metadata (only when `needs_attention_buckets` exists on that layer). */
export function resolveNeedsAttentionBucketsWithPrecedence(
    workUnitMetadata: unknown,
    departmentMetadata: unknown,
): NeedsAttentionBucketConfig[] {
    const picked = pickMetadataForNeedsAttentionBuckets(workUnitMetadata, departmentMetadata);
    if (picked == null) return [];
    return resolveNeedsAttentionBucketsFromMetadata(picked);
}

export type NeedsAttentionBucketWithCount = NeedsAttentionBucketConfig & { count: number };

/**
 * **Work-unit execution alignment:** count unique inquiries whose resolver `reasons[]` intersects the bucket’s
 * `reason_codes`. Matches filtered queue semantics better than summing histogram bins (especially for multi-code buckets).
 */
function normalizedReasonCodeSet(codes: readonly string[]): Set<string> {
    const out = new Set<string>();
    for (const c of codes) {
        const t = c.trim();
        if (t) out.add(t);
    }
    return out;
}

export function bucketCountsFromResolverMatches(
    buckets: readonly NeedsAttentionBucketConfig[],
    matches: ReadonlyArray<{ resolved: OpportunityAttentionResult }>,
): NeedsAttentionBucketWithCount[] {
    const enabled = buckets.filter((b) => b.enabled);
    const bucketCodeSets = enabled.map((b) => normalizedReasonCodeSet(b.reason_codes));
    const counts = new Array<number>(enabled.length).fill(0);
    for (const m of matches) {
        const r = m.resolved;
        if (!r.needs_attention || !r.primary_reason) continue;
        const reasonCodes = new Set<string>();
        for (const rr of r.reasons) {
            const code = String(rr.code ?? "").trim();
            if (code) reasonCodes.add(code);
        }
        for (let i = 0; i < bucketCodeSets.length; i++) {
            const codes = bucketCodeSets[i]!;
            for (const code of reasonCodes) {
                if (codes.has(code)) {
                    counts[i]!++;
                    break;
                }
            }
        }
    }
    return enabled
        .map((b, i) => ({ ...b, count: counts[i] ?? 0 }))
        .sort(compareNeedsAttentionBuckets);
}

/** Collect membership matches from a single-pass `resolved_by_id` map (dept lane bucket path). */
export function collectNeedsAttentionResolverMatches(
    resolvedById: Readonly<Record<string, OpportunityAttentionResult>>,
): { resolved: OpportunityAttentionResult }[] {
    const out: { resolved: OpportunityAttentionResult }[] = [];
    for (const id in resolvedById) {
        const resolved = resolvedById[id];
        if (resolved?.needs_attention && resolved.primary_reason != null) {
            out.push({ resolved });
        }
    }
    return out;
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
        .sort(compareNeedsAttentionBuckets);
}

/** Apply org label overrides from resolver config (`reason_overrides.label`) when a bucket maps a single code. */
export function applyAttentionConfigLabelsToBuckets(
    buckets: readonly NeedsAttentionBucketWithCount[],
    config: OpportunityAttentionResolvedConfig,
): NeedsAttentionBucketWithCount[] {
    const mapped = buckets.map((b) => {
        let label = b.label;
        if (b.reason_codes.length === 1) {
            const code = b.reason_codes[0]!;
            if (isOpportunityAttentionReasonCode(code)) {
                label = labelForReasonCode(code, config);
            }
        }
        return label === b.label ? b : { ...b, label };
    });
    return [...mapped].sort(compareNeedsAttentionBuckets);
}
