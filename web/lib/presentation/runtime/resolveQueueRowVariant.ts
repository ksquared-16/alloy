/**
 * Presentation Runtime V2 — Queue Row Surface Variant selection (pure).
 *
 * ONE Queue Row runtime, multiple variants. At render time the runtime builds a match input from
 * the row's frozen QueueRowContext + the active runtime scope, evaluates variant rules in priority
 * order, and picks the FIRST matching variant. No match → null (caller renders the top-level
 * Default columns). The same CondensedQueueRow renders the selected variant's config — no alternate
 * renderer, no per-case surface.
 *
 * @see docs/platform/experience/presentation-runtime-v2.md (Queue Row Variants)
 */

import type { QueueRowVariant, QueueRowVariantRule } from "@/lib/layout/queueRecordLayoutV3";

/** Row + scope signals a variant rule can match against. All optional; missing = unknown. */
export type QueueRowVariantMatchInput = {
    stageKey?: string | null;
    statusKey?: string | null;
    grain?: string | null;
    workViewId?: string | null;
    workViewKey?: string | null;
    processKey?: string | null;
    rowType?: string | null;
};

/** A clause matches when it is absent/empty (unconstrained) or contains the (case-insensitive) value. */
function clauseMatches(allowed: readonly string[] | undefined, value: string | null | undefined): boolean {
    if (!allowed || allowed.length === 0) return true; // clause not set → no constraint
    const v = (value ?? "").trim().toLowerCase();
    if (!v) return false; // constrained but the row has no value → cannot match
    return allowed.some((a) => a.trim().toLowerCase() === v);
}

/**
 * Child-grain Waitlist rows and candidate-grain Waitlist rows share placement attention identity.
 * Published variants may declare either grain; accept both without inventing Waitlist-specific fields.
 */
function grainClauseMatches(allowed: readonly string[] | undefined, grain: string | null | undefined): boolean {
    if (clauseMatches(allowed, grain)) return true;
    if (!allowed || allowed.length === 0) return true;
    const g = (grain ?? "").trim().toLowerCase();
    if (!g) return false;
    const allowedNorm = allowed.map((a) => a.trim().toLowerCase());
    if (g === "child" && allowedNorm.includes("candidate")) return true;
    if (g === "candidate" && allowedNorm.includes("child")) return true;
    return false;
}

/**
 * Strip reserved `conditions` from a variant rule so saved config cannot imply unevaluated behavior.
 * Typed clauses (stage_key, grain, …) are preserved.
 */
export function sanitizeQueueRowVariantRule(
    rule: QueueRowVariantRule | undefined,
): QueueRowVariantRule | undefined {
    if (!rule) return rule;
    if (!rule.conditions || rule.conditions.length === 0) return rule;
    const { conditions: _reserved, ...rest } = rule;
    return rest;
}

/**
 * Whether a variant rule matches the input. Every present clause must match (AND). An absent or
 * empty rule is a catch-all (always matches). `rule.conditions` is reserved and ignored — see
 * `sanitizeQueueRowVariantRule`.
 */
export function queueRowVariantRuleMatches(
    rule: QueueRowVariantRule | undefined,
    input: QueueRowVariantMatchInput,
): boolean {
    if (!rule) return true;
    return (
        clauseMatches(rule.stage_key, input.stageKey) &&
        clauseMatches(rule.status_key, input.statusKey) &&
        grainClauseMatches(rule.grain, input.grain) &&
        clauseMatches(rule.work_view_id, input.workViewId) &&
        clauseMatches(rule.work_view_key, input.workViewKey) &&
        clauseMatches(rule.process_key, input.processKey) &&
        grainClauseMatches(rule.row_type, input.rowType)
    );
}

/**
 * Resolve the first matching variant by ascending priority (ties broken by original order — stable).
 * Returns null when there are no variants or none match — the caller renders the top-level Default
 * columns. Never throws.
 */
export function resolveQueueRowVariant(
    variants: readonly QueueRowVariant[] | undefined,
    input: QueueRowVariantMatchInput,
): QueueRowVariant | null {
    if (!variants || variants.length === 0) return null;
    const ordered = variants
        .map((variant, index) => ({ variant, index }))
        .sort((a, b) => a.variant.priority - b.variant.priority || a.index - b.index);
    for (const { variant } of ordered) {
        if (queueRowVariantRuleMatches(variant.appliesWhen, input)) return variant;
    }
    return null;
}
