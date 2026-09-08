/**
 * QueueService V2 — placement_candidates + family_row rollup (Phase 2 — Card 3).
 * Attaches `_placement_priority_v2` only; does not mutate legacy `_placement_priority`.
 */

import {
    applyPlacementToOpportunityQueueRows,
    comparePlacementSortTuples,
    type OpportunityQueuePlacementRowContext,
    type WorkUnitPlacementQueueDiagnostics,
} from "@/lib/orchestration/placement/applyPlacementToOpportunityQueueRows";
import { evaluatePlacementCandidate } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import type { PlacementCandidatesByOpportunityId } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { filterPlacementCandidateBundlesForQueueDisplay } from "@/lib/orchestration/placement/filterPlacementCandidateBundlesForQueueDisplay";
import type { HouseholdPlacementFactContextByCustomerId } from "@/lib/orchestration/placement/bulkLoadHouseholdPlacementFactContext";
import { extractHouseholdFactSources } from "@/lib/orchestration/placement/householdPlacementFacts";
import { buildPlacementCandidateFacts } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { computeFamilyPlacementRollup } from "@/lib/orchestration/placement/computeFamilyPlacementRollup";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";
import { buildPlacementForecastPreview, resolvePlacementCandidateForecast } from "@/lib/orchestration/placement/placementForecastFactsProvider";
import type { ResolvedPlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import type { PlacementCandidateLoadDiagnostics } from "@/lib/orchestration/placement/placementCandidateLoadDiagnostics";

export const PLACEMENT_QUEUE_SERVICE_V2_EVALUATOR_VERSION = "queueservice_placement_v2";

export type PlacementPriorityV2CandidatePreview = {
    placement_candidate_id: string;
    child_display_name?: string | null;
    wait_since?: string | null;
    is_synthetic_fallback?: boolean;
    program_room_cohort_key: string;
    program_room_group_label?: string | null;
    bucket: string;
    score?: number;
    sort_tuple: Array<string | number | null>;
    diagnostics?: {
        evaluate_error?: boolean;
        code?: string;
        message?: string;
        warnings?: Array<{ code: string; message: string }>;
    };
    link_mode: "independent" | "preferred_together" | "strictly_together";
    active_override_kinds: string[];
    policy_bucket?: string;
    active_overrides?: Array<{ id: string; override_kind: string; reason: string }>;
    /**
     * The operator's requested position within this candidate's own cohort, when a pin is in force.
     * Absent when the candidate has no manual position. Consumed by
     * `applyCohortLocalManualPositions` — the ordinal is deliberately NOT part of `sort_tuple`,
     * because it is a position in the natural order rather than a component of it.
     */
    manual_pin_ordinal?: number;
    /** Card 6 — informational forecast hints (no ordering impact by default). */
    forecast_hints?: string[];
    forecast_facts_present?: string[];
    /** Dev/test — record sources for household priority flags when `ALLOY_PLACEMENT_FACT_SOURCES_DEBUG=1`. */
    fact_sources?: Record<string, { presence: string; source?: string }>;
    /** Dev/test — load provenance when `ALLOY_PLACEMENT_LOAD_DIAGNOSTICS=1` or NODE_ENV=test. */
    load_diagnostics?: PlacementCandidateLoadDiagnostics;
};

export type PlacementPriorityV2RowPreview = {
    projection_mode: "family_row";
    primary_group_fact_key: string;
    evaluated: boolean;
    shadow_mode: boolean;
    /** When true, V1 opportunity evaluator was used because no candidates were found. */
    fallback_to_v1?: boolean;
    fallback_reason?: string;
    candidates: PlacementPriorityV2CandidatePreview[];
    family_rollup: {
        bucket: string;
        sort_tuple: Array<string | number | null>;
        blocked_by_strict_link?: boolean;
        strict_link_cross_opportunity_incomplete?: boolean;
        candidate_count: number;
    };
};

export type EnabledPlacementV2 = Extract<ResolvedPlacementQueueConfig, { status: "enabled" }> & {
    engine_version: "v2";
};

type AccRow = Record<string, unknown> & { __placement_v2_sort_tuple?: Array<string | number | null> };

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

function stripInternal(row: Record<string, unknown>): Record<string, unknown> {
    const { __placement_v2_sort_tuple: _t, ...rest } = row;
    return rest;
}

export type ApplyPlacementV2Diagnostics = WorkUnitPlacementQueueDiagnostics & {
    placement_engine_version: "v2";
    v2_opportunities_with_candidates: number;
    v2_opportunities_fallback_v1: number;
    v2_candidates_evaluated: number;
};

export function applyPlacementV2ToOpportunityQueueRows(params: {
    rows: Array<Record<string, unknown>>;
    placement: EnabledPlacementV2;
    ctx: OpportunityQueuePlacementRowContext;
    candidatesByOpportunityId: PlacementCandidatesByOpportunityId;
    waitSinceFallbackCreatedAt?: boolean;
    /** When set, rows with no candidates use V1 apply on those rows only (merged into result). */
    v1FallbackForEmpty?: boolean;
    householdFactsByCustomerId?: HouseholdPlacementFactContextByCustomerId;
}): { rows: Array<Record<string, unknown>>; diagnostics: ApplyPlacementV2Diagnostics } {
    const { placement, ctx } = params;
    const shadow = placement.options.shadow_mode;
    const cap = Math.max(0, Math.floor(placement.options.evaluation_cap));
    const primaryGroupKey = placement.profile.primary_group_fact_key ?? "program_room_cohort_key";

    const diagnostics: ApplyPlacementV2Diagnostics = {
        evaluated_count: 0,
        skipped_due_to_cap_count: 0,
        reorder_applied: false,
        shadow_mode: shadow,
        row_evaluation_errors: 0,
        profile_revision_mismatch: placement.options.profile_revision_mismatch,
        display: placement.merged.display,
        placement_engine_version: "v2",
        v2_opportunities_with_candidates: 0,
        v2_opportunities_fallback_v1: 0,
        v2_candidates_evaluated: 0,
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

    const enriched: AccRow[] = [];
    const v1FallbackRows: Array<{ index: number; row: Record<string, unknown> }> = [];

    for (let i = 0; i < head.length; i++) {
        const row = head[i]!;
        const core = readRowCore(row);
        if (!core.id) {
            diagnostics.row_evaluation_errors++;
            enriched.push({
                ...row,
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    primary_group_fact_key: primaryGroupKey,
                    evaluated: false,
                    shadow_mode: shadow,
                    candidates: [],
                    family_rollup: {
                        bucket: placement.profile.fallback_bucket_key,
                        sort_tuple: [],
                        candidate_count: 0,
                    },
                } satisfies PlacementPriorityV2RowPreview,
            });
            continue;
        }

        const bundles = filterPlacementCandidateBundlesForQueueDisplay(
            params.candidatesByOpportunityId.get(core.id) ?? []
        );
        if (!bundles.length) {
            if (params.v1FallbackForEmpty !== false) {
                v1FallbackRows.push({ index: enriched.length, row });
                enriched.push({ ...row });
                diagnostics.v2_opportunities_fallback_v1++;
            } else {
                enriched.push({
                    ...row,
                    _placement_priority_v2: {
                        projection_mode: "family_row",
                        primary_group_fact_key: primaryGroupKey,
                        evaluated: false,
                        shadow_mode: shadow,
                        fallback_reason: "no_placement_candidates",
                        candidates: [],
                        family_rollup: {
                            bucket: placement.profile.fallback_bucket_key,
                            sort_tuple: [],
                            candidate_count: 0,
                        },
                    } satisfies PlacementPriorityV2RowPreview,
                });
            }
            continue;
        }

        diagnostics.v2_opportunities_with_candidates++;
        const candidatePreviews: PlacementPriorityV2CandidatePreview[] = [];
        const rollupInputs: Parameters<typeof computeFamilyPlacementRollup>[0] = [];

        for (const bundle of bundles) {
            const customerId = (bundle.candidate.customer_id ?? "").trim();
            const household = customerId
                ? params.householdFactsByCustomerId?.get(customerId) ?? null
                : null;

            const result = evaluatePlacementCandidate({
                candidate: bundle.candidate,
                opportunity: { id: core.id, created_at: core.created_at, metadata: core.metadata },
                cohort: {
                    work_unit_id: ctx.workUnitId,
                    queue_key: ctx.queueKey,
                    ...(ctx.statusKeysAllowed?.length ? { status_keys_allowed: ctx.statusKeysAllowed } : {}),
                },
                profile: placement.profile,
                now_ms: ctx.nowMs,
                link_mode: bundle.link_mode,
                active_overrides: bundle.active_overrides,
                evaluator_version: PLACEMENT_QUEUE_SERVICE_V2_EVALUATOR_VERSION,
                wait_since_fallback_created_at: params.waitSinceFallbackCreatedAt,
                household,
            });

            if (!result.ok) {
                diagnostics.row_evaluation_errors++;
                candidatePreviews.push({
                    placement_candidate_id: bundle.candidate.id,
                    child_display_name: bundle.child_display_name,
                    program_room_cohort_key: bundle.candidate.program_room_cohort_key,
                    program_room_group_label: bundle.candidate.program_room_group_label,
                    bucket: placement.profile.fallback_bucket_key,
                    sort_tuple: [],
                    link_mode: bundle.link_mode,
                    active_override_kinds: bundle.active_overrides.map((o) => o.override_kind),
                    diagnostics: {
                        evaluate_error: true,
                        code: result.code,
                        message: result.message,
                    },
                });
                continue;
            }

            diagnostics.v2_candidates_evaluated++;
            const snap = result.value.snapshot;
            const policySnap = result.value.policy_snapshot ?? snap;
            const forecast = resolvePlacementCandidateForecast({
                candidateMetadata: bundle.candidate.metadata ?? null,
                opportunityMetadata: core.metadata,
            });
            const forecastPreview = buildPlacementForecastPreview(forecast);
            const factSourcesDebug =
                process.env.ALLOY_PLACEMENT_FACT_SOURCES_DEBUG === "1" ||
                process.env.NODE_ENV === "test"
                    ? extractHouseholdFactSources(
                          buildPlacementCandidateFacts({
                              candidate: bundle.candidate,
                              opportunity: { id: core.id, created_at: core.created_at, metadata: core.metadata },
                              link_mode: bundle.link_mode,
                              active_overrides: bundle.active_overrides,
                              wait_since_fallback_created_at: params.waitSinceFallbackCreatedAt,
                              household,
                          })
                      )
                    : undefined;
            candidatePreviews.push({
                placement_candidate_id: bundle.candidate.id,
                child_display_name: bundle.child_display_name,
                wait_since: bundle.candidate.wait_since,
                is_synthetic_fallback: bundle.candidate.is_synthetic_fallback,
                program_room_cohort_key: bundle.candidate.program_room_cohort_key,
                program_room_group_label: snap.program_room_group_label ?? bundle.candidate.program_room_group_label,
                bucket: snap.bucket_key,
                policy_bucket: policySnap.bucket_key,
                score: snap.bucket_priority_order,
                sort_tuple: snap.sort_tuple,
                link_mode: bundle.link_mode,
                active_override_kinds: bundle.active_overrides.map((o) => o.override_kind),
                active_overrides: bundle.active_overrides.map((o) => ({
                    id: o.id,
                    override_kind: o.override_kind,
                    reason: o.reason,
                })),
                ...(() => {
                    const ord = result.value.override_applied.find((a) => a.pin_ordinal != null)?.pin_ordinal;
                    return ord != null ? { manual_pin_ordinal: ord } : {};
                })(),
                ...(forecastPreview.forecast_hints.length
                    ? {
                          forecast_hints: forecastPreview.forecast_hints,
                          forecast_facts_present: forecastPreview.forecast_facts_present,
                      }
                    : {}),
                ...(result.value.warnings.length
                    ? {
                          diagnostics: {
                              warnings: result.value.warnings.map((w) => ({
                                  code: w.code,
                                  message: w.message,
                              })),
                          },
                      }
                    : {}),
                ...(factSourcesDebug ? { fact_sources: factSourcesDebug } : {}),
                ...(bundle.load_diagnostics ? { load_diagnostics: bundle.load_diagnostics } : {}),
            });

            rollupInputs.push({
                candidateId: bundle.candidate.id,
                bucket_key: snap.bucket_key,
                sortTuple: snap.sort_tuple,
                link_mode: bundle.link_mode,
                link_group_id: bundle.link_group?.id ?? null,
                link_group_member_count: bundle.link_group?.member_count ?? 0,
            });
        }

        const rollup = computeFamilyPlacementRollup(rollupInputs);
        const familyRollup = rollup
            ? {
                  bucket: rollup.bucket,
                  sort_tuple: rollup.sort_tuple,
                  candidate_count: rollup.candidate_count,
                  ...(rollup.blocked_by_strict_link ? { blocked_by_strict_link: true } : {}),
                  ...(rollup.strict_link_cross_opportunity_incomplete
                      ? { strict_link_cross_opportunity_incomplete: true }
                      : {}),
              }
            : {
                  bucket: placement.profile.fallback_bucket_key,
                  sort_tuple: [] as Array<string | number | null>,
                  candidate_count: 0,
              };

        diagnostics.evaluated_count++;
        enriched.push({
            ...row,
            _placement_priority_v2: {
                projection_mode: "family_row",
                primary_group_fact_key: primaryGroupKey,
                evaluated: true,
                shadow_mode: shadow,
                candidates: candidatePreviews,
                family_rollup: familyRollup,
            } satisfies PlacementPriorityV2RowPreview,
            __placement_v2_sort_tuple: familyRollup.sort_tuple,
        });
    }

    if (v1FallbackRows.length) {
        const v1Profile =
            getPlacementProfileFromRegistry("childcare_enrollment_waitlist_v1") ?? params.placement.profile;
        const v1Placement: Extract<ResolvedPlacementQueueConfig, { status: "enabled" }> = {
            ...params.placement,
            engine_version: "v1",
            profile: v1Profile,
        };
        const fallbackOnly = v1FallbackRows.map((x) => x.row);
        const v1Out = applyPlacementToOpportunityQueueRows({
            rows: fallbackOnly,
            placement: v1Placement,
            ctx,
            waitSinceFallbackCreatedAt: params.waitSinceFallbackCreatedAt,
        });
        for (let j = 0; j < v1FallbackRows.length; j++) {
            const targetIdx = v1FallbackRows[j]!.index;
            const merged = v1Out.rows[j]!;
            enriched[targetIdx] = {
                ...merged,
                _placement_priority_v2: {
                    projection_mode: "family_row",
                    primary_group_fact_key: primaryGroupKey,
                    evaluated: true,
                    shadow_mode: shadow,
                    fallback_to_v1: true,
                    fallback_reason: "no_placement_candidates",
                    candidates: [],
                    family_rollup: {
                        bucket:
                            (merged._placement_priority as { bucket_key?: string } | undefined)?.bucket_key ??
                            placement.profile.fallback_bucket_key,
                        sort_tuple:
                            (merged._placement_priority as { sort_tuple?: Array<string | number | null> } | undefined)
                                ?.sort_tuple ?? [],
                        candidate_count: 0,
                    },
                } satisfies PlacementPriorityV2RowPreview,
                __placement_v2_sort_tuple:
                    (merged._placement_priority as { sort_tuple?: Array<string | number | null> } | undefined)
                        ?.sort_tuple ?? [],
            };
            diagnostics.evaluated_count++;
        }
    }

    let orderedHead = enriched;
    if (!shadow) {
        const beforeIds = enriched.map((r) => String(r.id ?? ""));
        orderedHead = [...enriched].sort((rA, rB) => {
            const ta = rA.__placement_v2_sort_tuple;
            const tb = rB.__placement_v2_sort_tuple;
            const hasA = Array.isArray(ta) && ta.length > 0;
            const hasB = Array.isArray(tb) && tb.length > 0;
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
        diagnostics.reorder_applied = head.length > 1 && beforeIds.some((id, i) => id !== afterIds[i]);
    }

    const stripped = orderedHead.map(stripInternal);
    return { rows: [...stripped, ...tail], diagnostics };
}
