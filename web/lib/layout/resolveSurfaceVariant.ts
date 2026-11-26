/**
 * resolveSurfaceVariant — the ONE applicability resolver for configured Work Unit surface regions.
 *
 * Every configured region (Work Unit header, queue rows, Focus Panel) selects its published variant
 * through this single resolver. It generalizes the Business-Process layout-assignment precedence
 * (see `resolveBusinessProcessLayoutAssignment`) by adding the **Work View** axis the legacy tiers
 * lacked, and by covering the header and focus-panel surfaces the legacy org-global lookups owned
 * ad hoc.
 *
 * DESIGN
 * - Pure + deterministic: given a context and a candidate set, the winner is a function of the
 *   inputs only (no clock, no I/O). The async fetch of candidates lives in the caller/adapter, so
 *   this core is exhaustively unit-testable.
 * - Published-only: draft/unpublished candidates are never resolved at runtime.
 * - Precedence: a candidate matches only if every constraint it declares equals the context; among
 *   matches, the most specific wins (Work View ≻ stage ≻ status), then the highest version.
 *
 * P0 is behavior-neutral: this module is introduced and unit-tested; no live region resolver is
 * repointed onto it until its dedicated cutover phase (P1 header, P2 queue, P3 focus panel).
 */
import type { LayoutSurface } from "@/lib/layout/layoutV2";

/** The operational context a surface variant is resolved against. Business Process is required; the
 *  finer axes are optional and, when present on a candidate, must match to apply. */
export type SurfaceVariantContext = {
    businessProcessKey: string;
    /** The active Work View (lens) the operator entered from. The new applicability axis. */
    workViewId?: string | null;
    stageKey?: string | null;
    statusKey?: string | null;
    /** Record-of-Truth entity type of the committed subject (e.g. "opportunities"). */
    entityType: string;
    /** Committed subject type, when it differs from entityType (reserved; opportunity-only today). */
    subjectType?: string | null;
    surface: LayoutSurface;
};

/** A published (or draft) layout candidate the resolver ranks. Mirrors an `entity_layouts` row plus
 *  its optional Business-Process/Work-View assignment constraints. */
export type SurfaceVariantCandidate = {
    layoutId: string;
    layoutKey: string;
    entityType: string;
    surface: LayoutSurface;
    status: "published" | "draft" | string;
    version: number;
    /** Assignment constraints. A null/undefined constraint is a wildcard (applies to any context). */
    businessProcessKey?: string | null;
    workViewId?: string | null;
    stageKey?: string | null;
    statusKey?: string | null;
};

export type SurfaceVariantMatchTier =
    | "process_workview_stage_status"
    | "process_workview_stage"
    | "process_workview_status"
    | "process_workview"
    | "process_stage_status"
    | "process_stage"
    | "process_status"
    | "process_surface_default";

export type SurfaceVariantResolution = {
    candidate: SurfaceVariantCandidate;
    tier: SurfaceVariantMatchTier;
    /** Specificity score used for ranking; exposed for diagnostics/tests. Higher wins. */
    specificity: number;
};

const AXIS_WORK_VIEW = 8;
const AXIS_STAGE = 4;
const AXIS_STATUS = 2;

function constrained(v: string | null | undefined): v is string {
    return typeof v === "string" && v.length > 0;
}

/** A candidate applies only if every constraint it declares equals the context. Surface + entity
 *  type must always match. Business Process must always match (the candidate is BP-scoped, or a
 *  wildcard BP default). */
function candidateApplies(c: SurfaceVariantCandidate, ctx: SurfaceVariantContext): boolean {
    if (c.entityType !== ctx.entityType) return false;
    if (c.surface !== ctx.surface) return false;
    if (constrained(c.businessProcessKey) && c.businessProcessKey !== ctx.businessProcessKey) return false;
    if (constrained(c.workViewId) && c.workViewId !== (ctx.workViewId ?? null)) return false;
    if (constrained(c.stageKey) && c.stageKey !== (ctx.stageKey ?? null)) return false;
    if (constrained(c.statusKey) && c.statusKey !== (ctx.statusKey ?? null)) return false;
    return true;
}

function specificityOf(c: SurfaceVariantCandidate): number {
    return (
        (constrained(c.workViewId) ? AXIS_WORK_VIEW : 0) +
        (constrained(c.stageKey) ? AXIS_STAGE : 0) +
        (constrained(c.statusKey) ? AXIS_STATUS : 0)
    );
}

function tierOf(c: SurfaceVariantCandidate): SurfaceVariantMatchTier {
    const w = constrained(c.workViewId);
    const st = constrained(c.stageKey);
    const su = constrained(c.statusKey);
    if (w && st && su) return "process_workview_stage_status";
    if (w && st) return "process_workview_stage";
    if (w && su) return "process_workview_status";
    if (w) return "process_workview";
    if (st && su) return "process_stage_status";
    if (st) return "process_stage";
    if (su) return "process_status";
    return "process_surface_default";
}

/**
 * Resolve the applicable published surface variant for a context.
 *
 * Deterministic: among published candidates that apply, the winner is the most specific (Work View ≻
 * stage ≻ status), breaking ties by highest version, then by lexically-least layoutId (a total order,
 * so the result never depends on candidate array order). Returns null when nothing published applies —
 * the caller is responsible for the built-in/default fallback (kept out of the resolver so "no
 * published variant" is an explicit, testable outcome rather than a hidden default).
 */
export function resolveSurfaceVariant(
    ctx: SurfaceVariantContext,
    candidates: readonly SurfaceVariantCandidate[],
): SurfaceVariantResolution | null {
    let best: SurfaceVariantResolution | null = null;
    for (const c of candidates) {
        if (c.status !== "published") continue; // published-only
        if (!candidateApplies(c, ctx)) continue;
        const specificity = specificityOf(c);
        if (best === null) {
            best = { candidate: c, tier: tierOf(c), specificity };
            continue;
        }
        // Total order: specificity, then version, then layoutId (stable regardless of input order).
        const b = best.candidate;
        if (
            specificity > best.specificity ||
            (specificity === best.specificity && c.version > b.version) ||
            (specificity === best.specificity && c.version === b.version && c.layoutId < b.layoutId)
        ) {
            best = { candidate: c, tier: tierOf(c), specificity };
        }
    }
    return best;
}
