#!/usr/bin/env npx tsx
/**
 * UI QA gate — verify Placement V2 backfill + queue payloads (read-only by default).
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> npx tsx --tsconfig tsconfig.json scripts/qaWaitlistPlacementV2Gate.ts
 *
 * Env (all optional unless noted):
 *   ORG_ID — pilot org (default: Hayes demo org)
 *   WORK_UNIT_KEY — default `enrollment_pipeline`
 *   APPLY_V2_CONFIG=1 — write V2 layer to work unit metadata (default: off)
 *   RUN_BACKFILL=1 — apply backfill after dry-run (default: off; requires ORG_ID)
 *
 * Safe default: dry-run backfill + queue probe only — no metadata or row mutations.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { runPlacementCandidateBackfill } from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";
import { PLACEMENT_PRIORITY_DEMO_LAYER_V2 } from "@/lib/orchestration/placement/placementPriorityDemoPatch";
import type { PlacementPriorityLayer } from "@/lib/orchestration/placement/placementConfigSchema";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { __testing as queueServiceTesting } from "@/lib/queues/QueueService";
import { parsePlacementWaitlistCandidateRowVm } from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const PILOT_ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const WORK_UNIT_KEY = process.env.WORK_UNIT_KEY?.trim() || "enrollment_pipeline";
const QUEUE_KEY = "waitlisted";

const V2_LAYER: PlacementPriorityLayer = {
    ...PLACEMENT_PRIORITY_DEMO_LAYER_V2,
};

function mergeV2Layer(metadata: unknown): { metadata: Record<string, unknown>; changed: boolean } {
    const base =
        metadata != null && typeof metadata === "object" && !Array.isArray(metadata)
            ? { ...(metadata as Record<string, unknown>) }
            : {};
    const prev = base.placement_priority_v1;
    const next = { ...V2_LAYER };
    const changed = JSON.stringify(prev ?? null) !== JSON.stringify(next);
    return { metadata: { ...base, placement_priority_v1: next }, changed };
}

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? PILOT_ORG).trim();
    const applyConfig = process.env.APPLY_V2_CONFIG === "1";
    const runBackfillApply = process.env.RUN_BACKFILL === "1";

    const supabase = createAdminClient();

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, key, department_id, metadata, name")
        .eq("org_id", orgId)
        .eq("key", WORK_UNIT_KEY)
        .maybeSingle();
    if (wuErr) throw new Error(wuErr.message);
    if (!wu?.id) {
        console.error(JSON.stringify({ ok: false, error: `work unit key=${WORK_UNIT_KEY} not found` }, null, 2));
        process.exit(1);
    }

    const workUnitId = wu.id as string;
    const departmentId = (wu as { department_id?: string }).department_id ?? null;
    const prevLayer = (wu as { metadata?: Record<string, unknown> }).metadata?.placement_priority_v1;

    console.log(
        JSON.stringify(
            {
                step: "pilot_identification",
                org_id: orgId,
                work_unit_id: workUnitId,
                work_unit_key: WORK_UNIT_KEY,
                work_unit_name: (wu as { name?: string }).name,
                department_id: departmentId,
                admin_route: departmentId
                    ? `/adminV2/workspace/dept/${departmentId}/work-unit/${workUnitId}?queue=${QUEUE_KEY}`
                    : `/adminV2/workspace/dept/<departmentId>/work-unit/${workUnitId}?queue=${QUEUE_KEY}`,
                queue_key: QUEUE_KEY,
                placement_priority_v1_before: prevLayer ?? null,
            },
            null,
            2
        )
    );

    if (applyConfig) {
        const { metadata: nextMeta, changed } = mergeV2Layer((wu as { metadata?: unknown }).metadata);
        if (changed) {
            const { error } = await supabase
                .from("work_units")
                .update({ metadata: nextMeta })
                .eq("id", workUnitId)
                .eq("org_id", orgId);
            if (error) throw new Error(error.message);
        }
        console.log(
            JSON.stringify(
                {
                    step: "enable_v2_config",
                    changed,
                    placement_priority_v1_applied: nextMeta.placement_priority_v1,
                },
                null,
                2
            )
        );
    } else {
        console.log(
            JSON.stringify(
                {
                    step: "enable_v2_config",
                    skipped: true,
                    hint: "Set APPLY_V2_CONFIG=1 to write V2 layer to work unit metadata",
                },
                null,
                2
            )
        );
    }

    const dryRun = await runPlacementCandidateBackfill(supabase, { orgId, dryRun: true });
    console.log(JSON.stringify({ step: "backfill_dry_run", counts: dryRun.counts, errors: dryRun.error_messages }, null, 2));

    if (runBackfillApply && dryRun.counts.skipped_existing < dryRun.counts.opportunities_scanned) {
        const applied = await runPlacementCandidateBackfill(supabase, { orgId, dryRun: false });
        console.log(JSON.stringify({ step: "backfill_apply", counts: applied.counts, errors: applied.error_messages }, null, 2));
    } else if (!runBackfillApply) {
        console.log(
            JSON.stringify(
                {
                    step: "backfill_apply",
                    skipped: true,
                    hint: "Set RUN_BACKFILL=1 to apply backfill after dry-run",
                },
                null,
                2
            )
        );
    }

    const { count: candCount } = await supabase
        .from("placement_candidates")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "active");
    console.log(JSON.stringify({ step: "active_candidates_in_db", count: candCount ?? 0 }, null, 2));

    const { data: wuAfter } = await supabase
        .from("work_units")
        .select("metadata")
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .single();
    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId ?? "")
        .maybeSingle();

    const { data: opps } = await supabase
        .from("opportunities")
        .select("id, name, status_key, metadata, created_at")
        .eq("org_id", orgId)
        .eq("work_unit_id", workUnitId)
        .eq("status_key", "waitlisted")
        .order("created_at", { ascending: true })
        .limit(15);

    const enrichedRows = (opps ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        created_at: o.created_at,
        metadata: o.metadata,
    }));

    const oppIds = enrichedRows.map((r) => String(r.id));
    const candidatesByOpp = await bulkLoadPlacementCandidatesByOpportunity({
        supabase,
        orgId,
        opportunityIds: oppIds,
    });

    const placementResolved = resolvePlacementQueueConfig({
        departmentMetadata: (dept as { metadata?: unknown } | null)?.metadata ?? null,
        workUnitMetadata: (wuAfter as { metadata?: unknown })?.metadata ?? null,
        queue_key: QUEUE_KEY,
    });

    let items: Array<Record<string, unknown>> = enrichedRows;
    let placementDiagnostics: unknown = null;

    if (placementResolved.status === "enabled") {
        const attached = await queueServiceTesting.attachPlacementToEnrichedOpportunityItems({
            supabase,
            orgId,
            enrichedRows,
            workUnitId,
            queueKey: QUEUE_KEY,
            queueConfig: {
                key: QUEUE_KEY,
                label: "Waitlisted",
                filters: [{ type: "status", operator: "in", values: ["waitlisted"] }],
            } as import("@/lib/config/queueDefinitionSchema").QueueConfig,
            departmentMetadata: (dept as { metadata?: unknown } | null)?.metadata ?? null,
            workUnitMetadata: (wuAfter as { metadata?: unknown })?.metadata ?? null,
            nowMs: Date.now(),
            placementCandidatesByOpportunityId: candidatesByOpp,
        });
        items = attached.rows;
        placementDiagnostics = attached.diagnostics;
    }
    const withCandidateRow = items.filter((r) => r._placement_waitlist_row != null);
    const withV1Only = items.filter((r) => r._placement_priority != null && r._placement_waitlist_row == null);
    const sampleCand = withCandidateRow[0]?._placement_waitlist_row;
    const parsed = sampleCand ? parsePlacementWaitlistCandidateRowVm(sampleCand) : null;

    const cohortKeys = new Set(
        withCandidateRow.map((r) => {
            const p = r._placement_waitlist_row as { program_room_cohort_key?: string };
            return p?.program_room_cohort_key ?? "";
        })
    );

    const uiChecks = {
        candidate_queue_rows: withCandidateRow.length,
        rows_with_v1_only: withV1Only.length,
        distinct_cohort_sections: cohortKeys.size,
        sample_child_name: parsed?.childDisplayName ?? null,
        sample_cohort: parsed?.cohortLabel ?? null,
        sample_family_context: parsed?.familyDisplayName ?? null,
        sample_sibling_label: parsed?.siblingLabel ?? null,
        sample_has_scoped_position: withCandidateRow.some((r) => {
            const v1 = r._placement_priority as { scoped_waitlist_position?: number } | undefined;
            return v1?.scoped_waitlist_position != null;
        }),
        placement_engine: placementResolved.status === "enabled" ? placementResolved.engine_version : "disabled",
        placement_projection_diagnostics: placementDiagnostics,
    };

    console.log(
        JSON.stringify(
            {
                step: "queue_service_probe",
                total_items: items.length,
                limit: 15,
                ui_checks: uiChecks,
                sample_row_id: withCandidateRow[0]?.id ?? items[0]?.id,
                sample_placement_waitlist_row: sampleCand ?? null,
            },
            null,
            2
        )
    );

    const pass =
        withCandidateRow.length > 0 &&
        parsed?.childDisplayName &&
        parsed?.cohortLabel &&
        !uiChecks.sample_has_scoped_position;

    console.log(
        JSON.stringify(
            {
                step: "qa_verdict",
                result: pass ? "PASS" : withCandidateRow.length === 0 ? "FAIL" : "PASS_WITH_ISSUES",
                notes: pass
                    ? "Candidate-row projection active. Multi-child families should appear in separate cohort sections."
                    : "See queue probe — V2 may be disabled or candidates missing.",
            },
            null,
            2
        )
    );
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
