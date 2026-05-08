/**
 * QueueService helper (Card 6) — attaches {@link _placement_priority} previews and optionally reorders rows.
 * Does not load config or touch Supabase; {@link resolvePlacementQueueConfig} runs in QueueService.
 */

import { buildOpportunityPlacementFacts } from "@/lib/orchestration/placement/adapters/opportunityPlacementFacts";
import { evaluatePlacementPriority } from "@/lib/orchestration/placement/evaluatePlacementPriority";
import type {
    PlacementPrioritySnapshot,
    PlacementReason,
    PlacementEvaluateErr,
} from "@/lib/orchestration/placement/placementPriorityTypes";
import type { ResolvedPlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";

/** Version string embedded in snapshots for this integration surface. */
export const PLACEMENT_QUEUE_SERVICE_EVALUATOR_VERSION = "queueservice_placement_v1";

export type OpportunityQueuePlacementRowContext = {
    workUnitId: string;
    queueKey: string;
    nowMs: number;
    /** From queue lane status filters — feeds profile `cohort_filter.status_keys` overlap checks when set. */
    statusKeysAllowed?: string[];
};

export type PlacementPriorityRowPreview = {
    bucket_key: string;
    bucket_label: string;
    sort_tuple: Array<string | number | null>;
    reasons: PlacementReason[];
    warnings: Array<{ code: string; message: string; fact_keys?: string[] }>;
    shadow_mode: boolean;
    evaluated_at_ms: number;
};

export type PlacementPriorityRowPreviewError = {
    evaluate_error: true;
    code: PlacementEvaluateErr["code"] | "INVALID_ROW" | "UNEXPECTED";
    message: string;
    shadow_mode: boolean;
    evaluated_at_ms: number;
};

export type WorkUnitPlacementQueueDiagnostics = {
    evaluated_count: number;
    skipped_due_to_cap_count: number;
    reorder_applied: boolean;
    shadow_mode: boolean;
    row_evaluation_errors: number;
    profile_revision_mismatch: boolean;
    /** Echo of merged config `display` for UI (optional). */
    display?: {
        show_bucket_chip?: boolean;
        show_sort_hint?: boolean;
    } | null;
};

type EnabledPlacement = Extract<ResolvedPlacementQueueConfig, { status: "enabled" }>;

/** Lexicographic ascending: lower `bucket_priority_order` / earlier tie-breakers sort first. */
export function comparePlacementSortTuples(a: Array<string | number | null>, b: Array<string | number | null>): number {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
        const av = a[i];
        const bv = b[i];
        if (av === bv) continue;
        if (av == null && bv == null) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") {
            if (av !== bv) return av - bv;
            continue;
        }
        return String(av).localeCompare(String(bv));
    }
    return 0;
}

function readRowCore(row: Record<string, unknown>): {
    id: string;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
} {
    const id = typeof row.id === "string" ? row.id : "";
    const created_at = typeof row.created_at === "string" ? row.created_at : null;
    const m = row.metadata;
    const metadata = m != null && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : null;
    return { id, metadata, created_at };
}

function stripInternalSortTuple(row: Record<string, unknown>): Record<string, unknown> {
    const { __placement_sort_tuple: _t, ...rest } = row;
    return rest;
}

export function applyPlacementToOpportunityQueueRows(params: {
    rows: Array<Record<string, unknown>>;
    placement: EnabledPlacement;
    ctx: OpportunityQueuePlacementRowContext;
    waitSinceFallbackCreatedAt?: boolean;
}): { rows: Array<Record<string, unknown>>; diagnostics: WorkUnitPlacementQueueDiagnostics } {
    const { placement, ctx } = params;
    const shadow = placement.options.shadow_mode;
    const cap = Math.max(0, Math.floor(placement.options.evaluation_cap));

    const diagnostics: WorkUnitPlacementQueueDiagnostics = {
        evaluated_count: 0,
        skipped_due_to_cap_count: 0,
        reorder_applied: false,
        shadow_mode: shadow,
        row_evaluation_errors: 0,
        profile_revision_mismatch: placement.options.profile_revision_mismatch,
        display: placement.merged.display,
    };

    if (!params.rows.length) {
        return { rows: params.rows, diagnostics };
    }

    if (cap === 0) {
        diagnostics.skipped_due_to_cap_count = params.rows.length;
        return { rows: params.rows, diagnostics };
    }

    const head = params.rows.slice(0, cap);
    const tail = params.rows.slice(cap);
    diagnostics.skipped_due_to_cap_count = tail.length;

    type AccRow = Record<string, unknown> & { __placement_sort_tuple?: Array<string | number | null> };
    const enriched: AccRow[] = [];

    for (const row of head) {
        try {
            const core = readRowCore(row);
            if (!core.id) {
                diagnostics.row_evaluation_errors++;
                enriched.push({
                    ...row,
                    _placement_priority: {
                        evaluate_error: true,
                        code: "INVALID_ROW",
                        message: "missing opportunity id",
                        shadow_mode: shadow,
                        evaluated_at_ms: ctx.nowMs,
                    } satisfies PlacementPriorityRowPreviewError,
                });
                continue;
            }

            const facts = buildOpportunityPlacementFacts(
                { created_at: core.created_at, metadata: core.metadata },
                { wait_since_fallback_created_at: params.waitSinceFallbackCreatedAt }
            );

            const result = evaluatePlacementPriority({
                evaluator_version: PLACEMENT_QUEUE_SERVICE_EVALUATOR_VERSION,
                now_ms: ctx.nowMs,
                entity: { entity_type: "opportunity", entity_id: core.id },
                cohort: {
                    work_unit_id: ctx.workUnitId,
                    queue_key: ctx.queueKey,
                    ...(ctx.statusKeysAllowed?.length ? { status_keys_allowed: ctx.statusKeysAllowed } : {}),
                },
                facts,
                profile: placement.profile,
            });

            if (!result.ok) {
                diagnostics.row_evaluation_errors++;
                enriched.push({
                    ...row,
                    _placement_priority: {
                        evaluate_error: true,
                        code: result.code,
                        message: result.message,
                        shadow_mode: shadow,
                        evaluated_at_ms: ctx.nowMs,
                    } satisfies PlacementPriorityRowPreviewError,
                });
                continue;
            }

            const snap: PlacementPrioritySnapshot = result.value.snapshot;
            const preview: PlacementPriorityRowPreview = {
                bucket_key: snap.bucket_key,
                bucket_label: snap.bucket_label,
                sort_tuple: snap.sort_tuple,
                reasons: result.value.reasons,
                warnings: result.value.warnings,
                shadow_mode: shadow,
                evaluated_at_ms: snap.evaluated_at_ms,
            };
            diagnostics.evaluated_count++;
            enriched.push({ ...row, _placement_priority: preview, __placement_sort_tuple: snap.sort_tuple });
        } catch (e) {
            diagnostics.row_evaluation_errors++;
            enriched.push({
                ...row,
                _placement_priority: {
                    evaluate_error: true,
                    code: "UNEXPECTED",
                    message: e instanceof Error ? e.message : String(e),
                    shadow_mode: shadow,
                    evaluated_at_ms: ctx.nowMs,
                } satisfies PlacementPriorityRowPreviewError,
            });
        }
    }

    let orderedHead = enriched;
    if (!shadow) {
        const beforeIds = enriched.map((r) => String(r.id ?? ""));
        orderedHead = [...enriched].sort((rA, rB) => {
            const ta = rA.__placement_sort_tuple;
            const tb = rB.__placement_sort_tuple;
            const hasA = Array.isArray(ta);
            const hasB = Array.isArray(tb);
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            if (!hasA && !hasB) return String(rA.id ?? "").localeCompare(String(rB.id ?? ""));
            const c = comparePlacementSortTuples(
                ta as Array<string | number | null>,
                tb as Array<string | number | null>
            );
            if (c !== 0) return c;
            return String(rA.id ?? "").localeCompare(String(rB.id ?? ""));
        });
        const afterIds = orderedHead.map((r) => String(r.id ?? ""));
        diagnostics.reorder_applied =
            head.length > 1 && beforeIds.some((id, i) => id !== afterIds[i]);
    }

    const stripped = orderedHead.map(stripInternalSortTuple);
    return { rows: [...stripped, ...tail], diagnostics };
}
