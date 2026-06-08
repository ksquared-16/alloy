#!/usr/bin/env npx tsx
/**
 * Read-only trace: Hayes (or TRACE_NAME) waitlist rows through enrichment → placement → VM.
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/debugWaitlistHayesRenderTrace.ts
 *
 * Env:
 *   ORG_ID — default Hayes demo org
 *   TRACE_NAME — substring match on child/household name (default: hayes)
 *
 * No database writes.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { __testing as queueServiceTesting } from "@/lib/queues/QueueService";
import { parsePlacementWaitlistCandidateRowVm } from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";
import {
    buildWorkUnitQueueCrmCompactRowSlice,
    buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate,
} from "@/lib/ui-v2/crmQueueRowPreviewPresentation";
import { buildPlacementWaitlistWorkUnitGroupHeaders } from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";
import { readOpportunityIdFromQueueRow } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { type QueueUiRowPreviewField } from "@/lib/ui-v2/queueUiConfig";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG = process.env.ORG_ID?.trim() || "93667019-bd28-49b5-a688-acc9bb1e0a19";
const WORK_UNIT_KEY = "enrollment_pipeline";
const QUEUE_KEY = "waitlisted";
const NAME_MATCH = (process.env.TRACE_NAME ?? "hayes").trim().toLowerCase();

function wantAll(_f: QueueUiRowPreviewField) {
    return true;
}

function traceRow(row: Record<string, unknown>, index: number) {
    const wr = row._placement_waitlist_row as Record<string, unknown> | undefined;
    const vm = parsePlacementWaitlistCandidateRowVm(wr);
    const slice = vm
        ? buildWorkUnitQueueCrmCompactRowSliceForPlacementCandidate(row, wantAll, null, vm)
        : buildWorkUnitQueueCrmCompactRowSlice(row, wantAll, null);

    return {
        index,
        layer1_after_attach: {
            id: row.id,
            opportunity_id: readOpportunityIdFromQueueRow(row),
            row_projection: wr?.row_projection ?? null,
            placement_candidate_id: wr?.placement_candidate_id ?? null,
            child_display_name: wr?.child_display_name ?? null,
            program_room_cohort_key: wr?.program_room_cohort_key ?? null,
            program_room_group_label: wr?.program_room_group_label ?? null,
            _requested_program: row._requested_program ?? null,
            _crm_compact_children: row._crm_compact_children ?? null,
            _child_display_name: row._child_display_name ?? null,
            _placement_priority_v2: row._placement_priority_v2 ?? null,
            _placement_priority: row._placement_priority ?? null,
        },
        layer2_vm: vm,
        layer3_crm_fact_groups: slice.crmFactGroups.map((g) => ({
            kind: g.kind,
            columnGrid: g.columnGrid,
        })),
        layer4_render: {
            primaryIdentity: (row._customer_name as string | undefined)?.trim() || vm?.familyDisplayName || null,
            childName: vm?.childDisplayName ?? null,
            programContext: vm?.cohortLabel ?? slice.programDeduped,
            sectionKey: vm?.cohortKey ?? null,
            sectionLabel: vm?.cohortSectionTitle ?? null,
        },
    };
}

async function main() {
    const supabase = createAdminClient();
    const { data: wu } = await supabase
        .from("work_units")
        .select("id, metadata, department_id")
        .eq("org_id", ORG)
        .eq("key", WORK_UNIT_KEY)
        .maybeSingle();
    if (!wu?.id) throw new Error("work unit not found");

    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", (wu as { department_id: string }).department_id)
        .maybeSingle();

    const { data: opps } = await supabase
        .from("opportunities")
        .select("id, name, status_key, metadata, created_at, customer_id")
        .eq("org_id", ORG)
        .eq("work_unit_id", wu.id)
        .eq("status_key", "waitlisted");

    const hayesOpp = (opps ?? []).find((o) => String(o.name ?? "").toLowerCase().includes(NAME_MATCH));
    if (!hayesOpp) {
        console.log(JSON.stringify({ verdict: "NO_HAYES_OPPORTUNITY", waitlisted_count: opps?.length ?? 0 }, null, 2));
        return;
    }

    const { data: candidates } = await supabase
        .from("placement_candidates")
        .select("id, child_display_name:customer_members(display_name), program_room_cohort_key, program_room_group_label, opportunity_customer_member_id")
        .eq("org_id", ORG)
        .eq("opportunity_id", hayesOpp.id)
        .eq("status", "active");

    const { data: members } = await supabase
        .from("customer_members")
        .select("display_name, metadata, desired_program_type")
        .eq("customer_id", (hayesOpp as { customer_id?: string }).customer_id ?? "");

    const programParts = (members ?? [])
        .map((m) => {
            const md = m.metadata as Record<string, unknown> | null;
            return (
                (typeof md?.program_label === "string" ? md.program_label : null) ??
                (typeof md?.demo_program_label === "string" ? md.demo_program_label : null) ??
                m.desired_program_type
            );
        })
        .filter(Boolean);
    const combinedProgram = programParts.join(" · ");

    const enrichedRow: Record<string, unknown> = {
        id: hayesOpp.id,
        name: hayesOpp.name,
        created_at: hayesOpp.created_at,
        metadata: hayesOpp.metadata,
        _customer_name: hayesOpp.name,
        _requested_program: combinedProgram || "Preschool — 3–4 years · Pre-K — 4–5 years · Young Toddler — 18–24 months",
        _child_display_name: (members ?? []).map((m) => m.display_name).filter(Boolean).join(" · "),
        _crm_compact_children: (members ?? []).map((m) => ({
            primary: m.display_name,
            secondary: combinedProgram,
        })),
    };

    const candidatesByOpp = await bulkLoadPlacementCandidatesByOpportunity({
        supabase,
        orgId: ORG,
        opportunityIds: [String(hayesOpp.id)],
    });

    const attached = await queueServiceTesting.attachPlacementToEnrichedOpportunityItems({
        supabase,
        orgId: ORG,
        enrichedRows: [enrichedRow],
        workUnitId: wu.id as string,
        queueKey: QUEUE_KEY,
        queueConfig: {
            key: QUEUE_KEY,
            label: "Waitlisted",
            filters: [{ type: "status", operator: "in", values: ["waitlisted"] }],
        } as import("@/lib/config/queueDefinitionSchema").QueueConfig,
        departmentMetadata: (dept as { metadata?: unknown } | null)?.metadata ?? null,
        workUnitMetadata: (wu as { metadata?: unknown }).metadata ?? null,
        nowMs: Date.now(),
        placementCandidatesByOpportunityId: candidatesByOpp,
    });

    const traces = attached.rows.map((r, i) => traceRow(r, i));
    const headers = buildPlacementWaitlistWorkUnitGroupHeaders(
        traces
            .map((t) => t.layer2_vm)
            .filter(Boolean)
            .map((v) => ({ groupKey: v!.cohortKey, groupLabel: v!.cohortSectionTitle }))
    );

    const combinedRe = /Preschool.*Pre-K.*Young Toddler|·.*·/;
    const leaks = traces.filter(
        (t) =>
            combinedRe.test(String(t.layer4_render.programContext ?? "")) ||
            combinedRe.test(String(t.layer4_render.sectionLabel ?? "")) ||
            combinedRe.test(String(t.layer1_after_attach._requested_program ?? "")) ||
            combinedRe.test(String(t.layer1_after_attach.program_room_group_label ?? ""))
    );

    console.log(
        JSON.stringify(
            {
                hayes_opportunity_id: hayesOpp.id,
                db_candidates: candidates,
                enriched_input_combined_program: enrichedRow._requested_program,
                fan_out_row_count: attached.rows.length,
                placement_diagnostics: attached.diagnostics,
                work_unit_group_headers: headers,
                leaks_count: leaks.length,
                traces,
                verdict: attached.rows.length >= 2 && leaks.length === 0 ? "PASS" : "FAIL",
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
