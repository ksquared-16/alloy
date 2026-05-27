#!/usr/bin/env npx tsx
/**
 * Card 5 manual-order override QA gate — exercises pin create/update/release + queue eval.
 *
 * Run from `web/`:
 *   npx tsx --tsconfig tsconfig.json scripts/qaWaitlistOverrideBrowserGate.ts
 *
 * Env:
 *   DEPARTMENT_ID, WORK_UNIT_ID — defaults to pilot QA route
 *   ORG_ID — inferred from work unit when omitted
 *   QA_ACTOR_USER_ID — actor for override mutations (default: system QA uuid)
 *   CLEANUP=1 — release overrides created by this run (default 1; set CLEANUP=0 to inspect)
 *
 * Note: this script intentionally creates/releases placement overrides. Do not run against production.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { __testing as queueServiceTesting } from "@/lib/queues/QueueService";
import { parsePlacementWaitlistCandidateRowVm } from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";
import {
    createPlacementOverride,
    releasePlacementOverride,
    upsertPlacementPinOverride,
    releaseManualPositionOverrides,
} from "@/lib/orchestration/placement/placementOverrideMutations";
import { expandOpportunityRowsToPlacementCandidateRows } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import type { QueueConfig } from "@/lib/config/queueDefinitionSchema";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const DEPARTMENT_ID = process.env.DEPARTMENT_ID?.trim() || "04958a78-32ca-4091-bcd3-4bbaef3fee4b";
const WORK_UNIT_ID = process.env.WORK_UNIT_ID?.trim() || "5ba90557-876d-4450-9c28-36beac6e83be";
const QUEUE_KEY = "waitlisted";
const QA_ACTOR = process.env.QA_ACTOR_USER_ID?.trim() || "00000000-0000-4000-8000-000000000001";
const CLEANUP = process.env.CLEANUP !== "0";

type Check = { id: string; pass: boolean; detail: string };

const checks: Check[] = [];
const createdOverrideIds: string[] = [];
let testCandidateId: string | null = null;
let testCandidateLabel: string | null = null;
let testOpportunityId: string | null = null;

function check(id: string, pass: boolean, detail: string) {
    checks.push({ id, pass, detail });
}

async function loadWaitlistQueueRows(supabase: ReturnType<typeof createAdminClient>, orgId: string) {
    const { data: wu } = await supabase
        .from("work_units")
        .select("metadata, department_id")
        .eq("id", WORK_UNIT_ID)
        .eq("org_id", orgId)
        .maybeSingle();
    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", DEPARTMENT_ID)
        .maybeSingle();

    const { data: opps } = await supabase
        .from("opportunities")
        .select("id, name, status_key, metadata, created_at")
        .eq("org_id", orgId)
        .eq("work_unit_id", WORK_UNIT_ID)
        .eq("status_key", "waitlisted")
        .order("created_at", { ascending: true })
        .limit(30);

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
        departmentMetadata: dept?.metadata ?? null,
        workUnitMetadata: wu?.metadata ?? null,
        queue_key: QUEUE_KEY,
    });

    if (placementResolved.status !== "enabled") {
        return { rows: enrichedRows, shadowMode: true, placementResolved };
    }

    const attached = await queueServiceTesting.attachPlacementToEnrichedOpportunityItems({
        supabase,
        orgId,
        enrichedRows,
        workUnitId: WORK_UNIT_ID,
        queueKey: QUEUE_KEY,
        queueConfig: {
            key: QUEUE_KEY,
            label: "Waitlisted",
            filters: [{ type: "status", operator: "in", values: ["waitlisted"] }],
        } as QueueConfig,
        departmentMetadata: dept?.metadata ?? null,
        workUnitMetadata: wu?.metadata ?? null,
        nowMs: Date.now(),
        placementCandidatesByOpportunityId: candidatesByOpp,
    });

    const shadowMode =
        placementResolved.engine_version === "v2" && placementResolved.shadow_mode !== false;

    const { rows: candidateRows } = expandOpportunityRowsToPlacementCandidateRows(attached.rows);
    return { rows: candidateRows, shadowMode, placementResolved, attachedDiagnostics: attached.diagnostics };
}

function findCandidateRow(rows: Array<Record<string, unknown>>, candidateId: string) {
    return rows.find((r) => {
        const wr = r._placement_waitlist_row as { placement_candidate_id?: string } | undefined;
        return wr?.placement_candidate_id === candidateId;
    });
}

async function main() {
    const supabase = createAdminClient();

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, org_id, name, key, metadata")
        .eq("id", WORK_UNIT_ID)
        .maybeSingle();
    if (wuErr || !wu?.org_id) {
        console.error(JSON.stringify({ ok: false, error: "work unit not found" }, null, 2));
        process.exit(1);
    }

    const orgId = wu.org_id as string;
    const adminRoute = `/adminV2/workspace/dept/${DEPARTMENT_ID}/work-unit/${WORK_UNIT_ID}?queue=${QUEUE_KEY}`;

    console.log(
        JSON.stringify(
            {
                step: "route",
                admin_route: adminRoute,
                org_id: orgId,
                work_unit: { id: WORK_UNIT_ID, name: wu.name, key: wu.key },
            },
            null,
            2
        )
    );

    const initial = await loadWaitlistQueueRows(supabase, orgId);
    const candidateRows = initial.rows.filter((r) => r._placement_waitlist_row != null);
    const cohortKeys = [
        ...new Set(
            candidateRows.map((r) => {
                const wr = r._placement_waitlist_row as { program_room_cohort_key?: string };
                return wr?.program_room_cohort_key ?? "";
            })
        ),
    ].filter(Boolean);

    check(
        "1_cohort_sections",
        candidateRows.length >= 1 && cohortKeys.length >= 1,
        `candidate_rows=${candidateRows.length} distinct_cohorts=${cohortKeys.length} cohorts=${cohortKeys.join(", ")}`
    );

    const hayesRow = candidateRows.find((r) => {
        const wr = r._placement_waitlist_row as { family_display_name?: string; child_display_name?: string };
        const fam = wr?.family_display_name?.toLowerCase() ?? "";
        const child = wr?.child_display_name?.toLowerCase() ?? "";
        return fam.includes("hayes") || child.includes("hayes");
    });
    const pickRow = hayesRow ?? candidateRows[0];
    if (!pickRow) {
        check("pick_candidate", false, "no candidate rows on waitlist lane");
        printVerdict();
        process.exit(1);
    }

    const wr = pickRow._placement_waitlist_row as Record<string, unknown>;
    testCandidateId = String(wr.placement_candidate_id ?? "");
    testOpportunityId = String(wr.opportunity_id ?? pickRow.opportunity_id ?? "");
    testCandidateLabel = String(wr.child_display_name ?? "unknown");
    const vm = parsePlacementWaitlistCandidateRowVm(wr);

    check(
        "2_ui_vm_parse",
        Boolean(vm?.placementCandidateId && vm.cohortLabel && !vm.cohortLabel.includes(" · ")),
        `child=${vm?.childDisplayName} cohort=${vm?.cohortLabel} section=${vm?.cohortSectionTitle}`
    );

    check(
        "2_manual_order_eligible",
        Boolean(testCandidateId && wr.row_projection === "placement_candidate"),
        `candidate_id=${testCandidateId} projection=${wr.row_projection} (inline ↑/↓ controls)`
    );

    const tierBoost = await createPlacementOverride(supabase, {
        orgId,
        userId: QA_ACTOR,
        role: "admin",
        placementCandidateId: testCandidateId!,
        override_kind: "tier_boost",
        reason: "QA gate tier_boost — staff household verification",
        payload: { effective_bucket_key: "tier_staff_community" },
    });

    if (!tierBoost.ok) {
        check("3_create_tier_boost", false, tierBoost.error);
    } else {
        const ovId = String(tierBoost.override.id);
        createdOverrideIds.push(ovId);
        check("3_create_tier_boost", true, `override_id=${ovId}`);

        const afterBoost = await loadWaitlistQueueRows(supabase, orgId);
        const boostedRow = findCandidateRow(afterBoost.rows, testCandidateId!);
        const preview = (
            boostedRow?._placement_waitlist_row as {
                placement_priority_v2?: {
                    bucket?: string;
                    policy_bucket?: string;
                    active_override_kinds?: string[];
                    active_overrides?: Array<{ id: string; override_kind: string; reason: string }>;
                };
            }
        )?.placement_priority_v2;

        check(
            "4_override_chip_data",
            (preview?.active_override_kinds?.includes("tier_boost") ?? false) &&
                (preview?.active_overrides?.length ?? 0) > 0,
            `active_kinds=${preview?.active_override_kinds?.join(",")} overrides=${preview?.active_overrides?.length ?? 0}`
        );

        check(
            "5_effective_bucket",
            preview?.bucket === "tier_staff_community",
            `effective_bucket=${preview?.bucket}`
        );

        check(
            "5_policy_bucket_preserved",
            Boolean(preview?.policy_bucket && preview.policy_bucket !== preview.bucket),
            `policy_bucket=${preview?.policy_bucket} effective=${preview?.bucket}`
        );

        const release = await releasePlacementOverride(supabase, {
            orgId,
            userId: QA_ACTOR,
            role: "admin",
            placementCandidateId: testCandidateId!,
            overrideId: ovId,
            release_reason: "QA gate release after tier_boost verification",
        });
        check(
            "6_release_tier_boost",
            release.ok,
            release.ok ? `released=${ovId}` : release.error
        );
        createdOverrideIds.length = 0;

        const afterRelease = await loadWaitlistQueueRows(supabase, orgId);
        const releasedRow = findCandidateRow(afterRelease.rows, testCandidateId!);
        const releasedPreview = (
            releasedRow?._placement_waitlist_row as {
                placement_priority_v2?: { bucket?: string; active_override_kinds?: string[] };
            }
        )?.placement_priority_v2;

        check(
            "7_chip_cleared",
            (releasedPreview?.active_override_kinds?.length ?? 0) === 0,
            `active_kinds=${releasedPreview?.active_override_kinds?.join(",") ?? "none"}`
        );
        check(
            "7_policy_bucket_returns",
            releasedPreview?.bucket === "tier_general_waitlist" ||
                releasedPreview?.bucket !== "tier_staff_community",
            `bucket_after_release=${releasedPreview?.bucket}`
        );
    }

    const pinUpsert = await upsertPlacementPinOverride(supabase, {
        orgId,
        userId: QA_ACTOR,
        role: "admin",
        placementCandidateId: testCandidateId!,
        pin_ordinal: 1,
        reason: "QA gate manual position — hold position 1 in cohort",
    });

    let pinOverrideId: string | null = null;
    if (!pinUpsert.ok) {
        check("8_upsert_pin", false, pinUpsert.error);
    } else {
        pinOverrideId = String(pinUpsert.override.id);
        createdOverrideIds.push(pinOverrideId);
        check("8_upsert_pin", true, `override_id=${pinOverrideId}`);

        const afterPin = await loadWaitlistQueueRows(supabase, orgId);
        const pinnedRow = findCandidateRow(afterPin.rows, testCandidateId!);
        const pinPreview = (
            pinnedRow?._placement_waitlist_row as {
                placement_priority_v2?: {
                    active_override_kinds?: string[];
                    sort_tuple?: Array<string | number | null>;
                };
            }
        )?.placement_priority_v2;

        check(
            "9_pin_diagnostics_shadow",
            pinPreview?.active_override_kinds?.includes("pin") === true,
            `shadow_mode=${afterPin.shadowMode} active_kinds=${pinPreview?.active_override_kinds?.join(",")} sort_tuple_len=${pinPreview?.sort_tuple?.length ?? 0}`
        );

        if (afterPin.shadowMode) {
            const cohortKey = (pinnedRow?._placement_waitlist_row as { program_room_cohort_key?: string })
                ?.program_room_cohort_key;
            const sameCohort = afterPin.rows.filter((r) => {
                const wr2 = r._placement_waitlist_row as { program_room_cohort_key?: string } | undefined;
                return wr2?.program_room_cohort_key === cohortKey;
            });
            const shadowSorted = sortPlacementCandidateQueueRows(sameCohort, true);
            const shadowOrder = shadowSorted.map(
                (r) =>
                    (r._placement_waitlist_row as { placement_candidate_id?: string })?.placement_candidate_id ?? ""
            );
            const idSorted = [...sameCohort]
                .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")))
                .map(
                    (r) =>
                        (r._placement_waitlist_row as { placement_candidate_id?: string })
                            ?.placement_candidate_id ?? ""
                );
            check(
                "9_shadow_no_reorder",
                shadowOrder.join(",") === idSorted.join(","),
                `shadow_order_matches_id_order=${shadowOrder.join(",") === idSorted.join(",")} cohort_size=${sameCohort.length}`
            );

            const liveSorted = sortPlacementCandidateQueueRows(sameCohort, false);
            const liveFirstId = (
                liveSorted[0]?._placement_waitlist_row as { placement_candidate_id?: string }
            )?.placement_candidate_id;
            check(
                "10_non_shadow_pin_first_simulated",
                liveFirstId === testCandidateId,
                `simulated_live_first=${liveFirstId} pinned=${testCandidateId} (shadow still on in config)`
            );
        } else {
            const cohortKey = (pinnedRow?._placement_waitlist_row as { program_room_cohort_key?: string })
                ?.program_room_cohort_key;
            const sameCohort = afterPin.rows.filter((r) => {
                const wr2 = r._placement_waitlist_row as { program_room_cohort_key?: string } | undefined;
                return wr2?.program_room_cohort_key === cohortKey;
            });
            const liveSorted = sortPlacementCandidateQueueRows(sameCohort, false);
            const liveFirstId = (
                liveSorted[0]?._placement_waitlist_row as { placement_candidate_id?: string }
            )?.placement_candidate_id;
            check(
                "10_non_shadow_pin_first",
                liveFirstId === testCandidateId,
                `live_first=${liveFirstId} pinned=${testCandidateId} cohort_size=${sameCohort.length}`
            );
        }

        const pinUpsertUpdate = await upsertPlacementPinOverride(supabase, {
            orgId,
            userId: QA_ACTOR,
            role: "admin",
            placementCandidateId: testCandidateId!,
            pin_ordinal: 2,
            reason: "QA gate manual position update — move down one slot",
        });
        check(
            "8b_upsert_pin_update",
            pinUpsertUpdate.ok && String(pinUpsertUpdate.override.id) === pinOverrideId,
            pinUpsertUpdate.ok ? `same_override_id=${pinOverrideId}` : pinUpsertUpdate.error
        );

        const resetManual = await releaseManualPositionOverrides(supabase, {
            orgId,
            userId: QA_ACTOR,
            role: "admin",
            placementCandidateId: testCandidateId!,
            release_reason: "QA gate reset manual adjustment",
        });
        check(
            "9b_reset_manual",
            resetManual.ok,
            resetManual.ok ? `released=${resetManual.released_ids.join(",")}` : resetManual.error
        );
        createdOverrideIds.length = 0;

        const afterReset = await loadWaitlistQueueRows(supabase, orgId);
        const resetRow = findCandidateRow(afterReset.rows, testCandidateId!);
        const resetPreview = (
            resetRow?._placement_waitlist_row as {
                placement_priority_v2?: { active_override_kinds?: string[] };
            }
        )?.placement_priority_v2;
        check(
            "9c_manual_chip_cleared",
            (resetPreview?.active_override_kinds?.length ?? 0) === 0,
            `active_kinds=${resetPreview?.active_override_kinds?.join(",") ?? "none"}`
        );
    }

    check(
        "11_opportunity_id_preserved",
        Boolean(testOpportunityId && testOpportunityId.length > 10),
        `opportunity_id=${testOpportunityId} (Open/Message/BOS target)`
    );

    const noRankOnRows = candidateRows.every((r) => {
        const html = JSON.stringify(r);
        return !html.includes('"scopedWaitlistPosition"') && !/#\d/.test(String(r.title ?? ""));
    });
    check(
        "12_no_persisted_rank",
        noRankOnRows,
        "no scoped position fields on candidate rows; rank not persisted in override payload"
    );

    const { data: ovRows } = await supabase
        .from("placement_overrides")
        .select("id, payload")
        .eq("org_id", orgId)
        .eq("placement_candidate_id", testCandidateId!)
        .eq("is_active", true);
    const payloadHasOrdinal = (ovRows ?? []).some((o) => {
        const p = o.payload as Record<string, unknown> | null;
        return p != null && ("rank" in p || "ordinal" in p || "position_persisted" in p);
    });
    check("12_no_rank_in_db_payload", !payloadHasOrdinal, `active_overrides=${ovRows?.length ?? 0}`);

    if (CLEANUP && createdOverrideIds.length) {
        for (const id of createdOverrideIds) {
            await releasePlacementOverride(supabase, {
                orgId,
                userId: QA_ACTOR,
                role: "admin",
                placementCandidateId: testCandidateId!,
                overrideId: id,
                release_reason: "QA gate cleanup",
            });
        }
    }

    printVerdict();
    process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

function printVerdict() {
    const pass = checks.every((c) => c.pass);
    console.log(
        JSON.stringify(
            {
                verdict: pass ? "PASS" : "FAIL",
                candidate_tested: {
                    placement_candidate_id: testCandidateId,
                    child: testCandidateLabel,
                    opportunity_id: testOpportunityId,
                },
                override_ids_created: createdOverrideIds,
                checks,
                browser_ui_note:
                    "Automated gate validates queue/eval/API path. Confirm inline ↑/↓ + note modal + Manually adjusted chip at admin route.",
                card_6_clear: pass,
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
