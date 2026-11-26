#!/usr/bin/env npx tsx
/**
 * Assignment Platform QA density seed (idempotent, marked).
 *
 * Creates ~45–60 child members across sites with varied assignment patterns:
 * none / one / multi / proposed / upcoming / active / ended / overlaps.
 *
 * Safety:
 *   ASSIGNMENT_QA_ORG_ID=<uuid>   required
 *   ASSIGNMENT_QA_CONFIRM=1       required (no accidental hosted writes)
 *
 * Markers: metadata.assignment_qa_seed_v1 = "1", seed_key = assignment_qa_v1:*
 *
 * Does NOT wipe existing org data. Safe to re-run (skips existing seed_keys).
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG = (process.env.ASSIGNMENT_QA_ORG_ID || "").trim();
const CONFIRM = process.env.ASSIGNMENT_QA_CONFIRM === "1";
const TARGET = Math.max(40, Math.min(60, Number(process.env.ASSIGNMENT_QA_CHILD_COUNT || 48) || 48));
const MARKER = "assignment_qa_seed_v1";

async function main() {
    if (!ORG || !CONFIRM) {
        console.error(
            "Refusing to seed. Set ASSIGNMENT_QA_ORG_ID=<org uuid> and ASSIGNMENT_QA_CONFIRM=1"
        );
        process.exit(2);
    }
    const supabase = createAdminClient();
    const { data: org } = await supabase.from("orgs").select("id, name").eq("id", ORG).maybeSingle();
    if (!org) {
        console.error("Org not found:", ORG);
        process.exit(2);
    }
    console.log(`Target org: ${org.name} (${ORG}) count=${TARGET}`);

    const { data: sites } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", ORG)
        .eq("location_type", "site")
        .order("label");
    if (!sites?.length) {
        console.error("No sites on org");
        process.exit(2);
    }

    const { data: kinds } = await supabase
        .from("operational_assignment_types")
        .select("id, key, label")
        .eq("org_id", ORG)
        .eq("is_active", true)
        .order("sort_order");
    if (!kinds?.length) {
        console.error("No Assignment Kinds — configure Studio first");
        process.exit(2);
    }

    const byKey = Object.fromEntries((kinds as { id: string; key: string }[]).map((k) => [k.key, k.id]));
    const primaryId = byKey.primary_classroom || kinds[0]!.id;
    const beforeId = byKey.before_care || kinds[1]?.id || primaryId;
    const afterId = byKey.after_care || kinds[2]?.id || primaryId;
    const enrichId = byKey.enrichment || kinds[3]?.id || primaryId;

    let created = 0;
    let skipped = 0;
    for (let i = 0; i < TARGET; i++) {
        const site = sites[i % sites.length]!;
        const seedKey = `assignment_qa_v1:${ORG.slice(0, 8)}:${String(i).padStart(3, "0")}`;
        const { data: existing } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", ORG)
            .contains("metadata", { seed_key: seedKey })
            .maybeSingle();
        if (existing) {
            skipped++;
            continue;
        }

        const first = `QaChild${i}`;
        const last = `Assignment${i % 7}`;
        const { data: person, error: pErr } = await supabase
            .from("persons")
            .insert({
                org_id: ORG,
                first_name: first,
                last_name: last,
                date_of_birth: `202${i % 4}-0${(i % 9) + 1}-15`,
                metadata: { [MARKER]: "1", seed_key: seedKey },
            })
            .select("id")
            .single();
        if (pErr || !person) {
            console.warn("person fail", i, pErr?.message);
            continue;
        }

        const { data: member, error: mErr } = await supabase
            .from("customer_members")
            .insert({
                org_id: ORG,
                person_id: person.id,
                role: "child",
                metadata: { [MARKER]: "1", seed_key: seedKey, site_location_id: site.id },
            })
            .select("id")
            .single();
        if (mErr || !member) {
            console.warn("member fail", i, mErr?.message);
            continue;
        }

        // Pattern of density
        const mode = i % 8;
        const { data: patterns } = await supabase
            .from("schedule_patterns")
            .select("id")
            .eq("org_id", ORG)
            .eq("site_location_id", site.id)
            .eq("is_active", true)
            .limit(1);
        const patternId = patterns?.[0]?.id;
        if (!patternId) {
            created++;
            continue;
        }

        const { data: rooms } = await supabase
            .from("locations")
            .select("id")
            .eq("org_id", ORG)
            .eq("parent_location_id", site.id)
            .eq("location_type", "unit")
            .limit(8);
        const roomId = rooms?.[i % Math.max(rooms?.length || 1, 1)]?.id ?? null;

        const today = new Date();
        const ymd = (d: Date) => d.toISOString().slice(0, 10);
        const future = new Date(today);
        future.setDate(future.getDate() + 21);
        const past = new Date(today);
        past.setMonth(past.getMonth() - 2);
        const pastEnd = new Date(today);
        pastEnd.setDate(pastEnd.getDate() - 7);

        type Row = Record<string, unknown>;
        const rows: Row[] = [];
        if (mode === 0) {
            // no assignment
        } else if (mode === 1) {
            rows.push({
                typeId: primaryId,
                start: ymd(today),
                end: null,
                commitment: "proposed",
                primary: true,
            });
        } else if (mode === 2) {
            rows.push(
                { typeId: primaryId, start: ymd(today), end: null, commitment: "proposed", primary: true },
                { typeId: beforeId, start: ymd(today), end: null, commitment: "proposed", primary: false },
                { typeId: enrichId, start: ymd(today), end: null, commitment: "proposed", primary: false },
                { typeId: afterId, start: ymd(today), end: null, commitment: "proposed", primary: false }
            );
        } else if (mode === 3) {
            rows.push({
                typeId: primaryId,
                start: ymd(future),
                end: null,
                commitment: "proposed",
                primary: true,
            });
        } else if (mode === 4) {
            rows.push({
                typeId: primaryId,
                start: ymd(past),
                end: ymd(pastEnd),
                commitment: "proposed",
                primary: true,
                status: "ended",
            });
        } else {
            rows.push(
                { typeId: primaryId, start: ymd(today), end: null, commitment: "proposed", primary: true },
                { typeId: beforeId, start: ymd(today), end: null, commitment: "proposed", primary: false }
            );
        }

        for (const r of rows) {
            const status = (r.status as string) || "planned";
            await supabase.from("schedule_assignments").insert({
                org_id: ORG,
                subject_type: "child",
                customer_member_id: member.id,
                enrollment_agreement_id: null,
                site_location_id: site.id,
                schedule_pattern_id: patternId,
                room_location_id: roomId,
                operational_assignment_type_id: r.typeId,
                is_primary: r.primary === true,
                commitment_kind: "proposed",
                start_date: r.start,
                end_date: r.end,
                status,
                assignment_kind: "base",
                source_key: "assignment_qa_seed_v1",
                metadata: { [MARKER]: "1", seed_key: seedKey },
            });
        }
        created++;
        if (created % 10 === 0) console.log(`… created ${created}`);
    }
    console.log(`Done. created=${created} skipped=${skipped}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
