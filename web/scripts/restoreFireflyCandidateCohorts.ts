#!/usr/bin/env npx tsx
/**
 * DIRECTOR-OWNED RESTORATION — Firefly placement candidate cohort regression.
 *
 * ── WHAT HAPPENED ──
 *
 * An identity-key migration (cohort removed from the candidate key) moved every existing candidate
 * onto the new stable key in one pass. The move wrote the COHORT as well as the key, so a single Work
 * View read rewrote 15 candidates' `program_room_cohort_key` to the ensure-derived value — mostly
 * `unknown_program_room`, because ensure has no program key or OCM context. The waitlist re-sectioned
 * from 12/1/2/1/1 to 2/14/1. See `CONVERGENCE-MATRIX.md` §5h and law 39.
 *
 * ── WHY THE EXPECTED VALUES ARE AUTHORITATIVE, NOT INFERRED ──
 *
 * Each candidate carries `metadata.cohort_resolution.program_room_cohort_key`, written at creation by
 * `derivePlacementCandidateSeedRow`. No write path in this incident touched `metadata`: the move wrote
 * `seed_key` (+ the cohort fields it should not have), and `syncPlacementCandidateFromOcm` — which
 * does not run for these OCM-null rows — only ever SPREADS existing metadata and adds its own key.
 * The value is therefore an immutable creation-time record, not a heuristic.
 *
 * Independently corroborated two ways: it matches the cohort values observed and recorded before the
 * regression for every row where such a record exists, and the restored set reproduces the recorded
 * baseline section distribution (12/1/2/1/1) exactly.
 *
 * ── SAFETY ──
 *
 * Fail-closed preconditions per row; nothing is written unless EVERY row matches its expected damaged
 * state. Bounded to the 15 enumerated candidate ids. Touches only the cohort fields. Never deletes,
 * never changes identity, wait_since, overrides, status or linkage.
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> DRY_RUN=1 npx tsx scripts/restoreFireflyCandidateCohorts.ts   # verify preconditions
 *   ORG_ID=<uuid> APPLY=1  npx tsx scripts/restoreFireflyCandidateCohorts.ts    # execute once
 *
 * `RESTORE_LABEL=1` additionally restores `program_room_group_label`, which the same move also
 * overwrote. Without it a repaired row carries the right key and a stale label.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type RepairRow = {
    candidate_id: string;
    child: string;
    expected_damaged_cohort: string;
    expected_original_cohort: string;
    expected_original_label: string;
};

/** Evidence source for every row: `metadata.cohort_resolution` (creation-time, immutable). */
const REPAIR: readonly RepairRow[] = [
    { candidate_id: "698f850a-2441-48d5-bed3-0b0870afa848", child: "Wrigley Kurzman", expected_damaged_cohort: "infant", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "ba8cdcf5-73b2-43e6-8a86-aa28f1098c0e", child: "Lennon Kurzman", expected_damaged_cohort: "toddler", expected_original_cohort: "toddler_2_3_years", expected_original_label: "Toddler — 2–3 years" },
    { candidate_id: "bed8ce49-06a3-46ae-a90a-5579c5307aa7", child: "Test Process", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "pre_k_4_5_years", expected_original_label: "Pre-K — 4–5 years" },
    { candidate_id: "448c5dcb-f84b-4cea-ad45-31744bf5513a", child: "Test Process2", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "school_age_5_years", expected_original_label: "School Age — 5+ years" },
    { candidate_id: "9e230cf8-d444-4d0c-8f8b-54be3162a6ad", child: "Test Process3", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "504bf3f3-7eb5-4bac-bc4d-c7aca413eab9", child: "Test Process4", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "a8077c41-34ae-4695-9852-c0df0a3a65b0", child: "Test Process5", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "33af29af-4ca3-49ac-b6f7-5f75eeabe1f1", child: "Test Process6", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "85c0259d-d558-446a-b7f5-909f88b8c4f4", child: "Test Process7", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "e392cb90-29a7-4327-b91e-b063b06fa4b6", child: "Test Process8", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "cab180fc-0b21-4e92-a998-4e80cd58efb9", child: "Test Process9", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "55cf37fb-1fe4-441a-b9d1-5c3665f78a79", child: "Test Process10", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "17ce4d8e-3003-44a9-86a5-ba96ecda6d1c", child: "Test Process11", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "22357ef1-ac83-41e3-96b9-3d15625d3ace", child: "PassB Kid", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "infant_0_18_months", expected_original_label: "Infant — 0–18 months" },
    { candidate_id: "4b1b508c-3373-408e-87ff-c7920ee332f8", child: "Marisol Vega", expected_damaged_cohort: "unknown_program_room", expected_original_cohort: "school_age_5_years", expected_original_label: "School Age — 5+ years" },
];

/** Rows deliberately NOT repaired — their stored cohort already equals the creation-time evidence. */
const UNCHANGED_BY_DESIGN = [
    "0cad23a8-536b-414e-af1e-0f15ef1e3ca0", // Wrigley duplicate — infant
    "ee36c3b1-9aba-4923-95d1-31ca5603e34a", // PassA (projecting)  — infant
    "94984f6c-f269-4f86-8b1b-9a4607cac2c6", // PassA duplicate     — infant_0_18_months (holds pin 2)
    "27de6932-6910-4498-9f5f-5f3bc688fd5a", // Lennon duplicate    — toddler
    "dbfd573f-3a4d-41c1-b778-d20736821ff9", // Tomas Rivera        — unknown_program_room WAS its original value
];

async function main() {
    const orgId = (process.env.ORG_ID ?? "").trim();
    if (!orgId) {
        console.error("ORG_ID is required");
        process.exit(1);
    }
    const apply = process.env.APPLY === "1";
    const restoreLabel = process.env.RESTORE_LABEL === "1";
    const supabase = createAdminClient();

    const ids = REPAIR.map((r) => r.candidate_id);
    const { data, error } = await supabase
        .from("placement_candidates")
        .select("id, org_id, opportunity_id, customer_member_id, status, wait_since, seed_key, program_room_cohort_key, program_room_group_label, metadata")
        .eq("org_id", orgId)
        .in("id", ids);
    if (error) {
        console.error("read failed:", error.message);
        process.exit(1);
    }

    const byId = new Map((data ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
    const failures: string[] = [];

    for (const row of REPAIR) {
        const live = byId.get(row.candidate_id);
        if (!live) { failures.push(`${row.candidate_id} (${row.child}): NOT FOUND`); continue; }
        const cohort = String(live.program_room_cohort_key ?? "");
        if (cohort !== row.expected_damaged_cohort) {
            failures.push(`${row.candidate_id} (${row.child}): cohort is "${cohort}", expected damaged "${row.expected_damaged_cohort}" — refusing (concurrent change?)`);
        }
        const meta = (live.metadata ?? {}) as { cohort_resolution?: { program_room_cohort_key?: string } };
        const evidence = String(meta.cohort_resolution?.program_room_cohort_key ?? "");
        if (evidence !== row.expected_original_cohort) {
            failures.push(`${row.candidate_id} (${row.child}): evidence is "${evidence}", table says "${row.expected_original_cohort}" — refusing`);
        }
        if (String(live.status ?? "") !== "active") {
            failures.push(`${row.candidate_id} (${row.child}): status is "${String(live.status)}", expected active — refusing`);
        }
    }

    if (failures.length) {
        console.error(`\nFAIL CLOSED — ${failures.length} precondition(s) not met. NOTHING written.\n`);
        failures.forEach((f) => console.error("  " + f));
        process.exit(1);
    }
    console.log(`preconditions OK for all ${REPAIR.length} rows (unchanged by design: ${UNCHANGED_BY_DESIGN.length}).`);

    if (!apply) {
        console.log("\nDRY RUN — set APPLY=1 to execute. Planned changes:");
        for (const r of REPAIR) {
            console.log(`  ${r.candidate_id} ${r.child}: cohort ${r.expected_damaged_cohort} -> ${r.expected_original_cohort}${restoreLabel ? ` | label -> ${r.expected_original_label}` : ""}`);
        }
        return;
    }

    let applied = 0;
    for (const r of REPAIR) {
        const patch: Record<string, unknown> = { program_room_cohort_key: r.expected_original_cohort };
        if (restoreLabel) patch.program_room_group_label = r.expected_original_label;
        // Re-assert the damaged value in the WHERE clause: a row that changed since the precondition
        // pass is skipped rather than overwritten.
        const { error: upErr, count } = await supabase
            .from("placement_candidates")
            .update(patch, { count: "exact" })
            .eq("org_id", orgId)
            .eq("id", r.candidate_id)
            .eq("program_room_cohort_key", r.expected_damaged_cohort);
        if (upErr) { console.error(`  ${r.candidate_id}: ${upErr.message}`); continue; }
        if ((count ?? 0) === 0) { console.error(`  ${r.candidate_id}: no row matched the damaged value — skipped`); continue; }
        applied += 1;
    }
    console.log(`\napplied ${applied}/${REPAIR.length}`);
}

void main();
