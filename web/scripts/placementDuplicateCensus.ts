#!/usr/bin/env npx tsx
/**
 * READ-ONLY duplicate placement candidate census (Priority 4).
 *
 * Writes nothing. Exists because the reconciliation contract forbids an implicit survivor: a decision
 * can only be made from the full picture — seed keys, cohort truth, wait_since, overrides and the
 * downstream rows that point at each candidate.
 *
 * `seed_key` is deliberately NOT exposed through the admin read model, so this reads it through the
 * governed service path rather than widening a product surface for diagnostics.
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> npx tsx scripts/placementDuplicateCensus.ts
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type Cand = {
    id: string;
    opportunity_id: string;
    customer_member_id: string | null;
    person_id: string | null;
    opportunity_customer_member_id: string | null;
    seed_key: string | null;
    program_room_cohort_key: string | null;
    program_room_group_label: string | null;
    wait_since: string | null;
    status: string;
    is_synthetic_fallback: boolean;
    created_at: string | null;
    metadata: Record<string, unknown> | null;
};

async function main() {
    const orgId = (process.env.ORG_ID ?? "").trim();
    if (!orgId) { console.error("ORG_ID required"); process.exit(1); }
    const supabase = createAdminClient();

    const { data: candRows, error } = await supabase
        .from("placement_candidates")
        .select("id, opportunity_id, customer_member_id, person_id, opportunity_customer_member_id, seed_key, program_room_cohort_key, program_room_group_label, wait_since, status, is_synthetic_fallback, created_at, metadata")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
    if (error) { console.error("read failed:", error.message); process.exit(1); }
    const candidates = (candRows ?? []) as unknown as Cand[];

    const ids = candidates.map((c) => c.id);
    const [ovRes, lgRes, cmRes] = await Promise.all([
        supabase.from("placement_overrides")
            .select("id, placement_candidate_id, override_kind, payload, is_active, program_room_cohort_key, created_at, released_at")
            .eq("org_id", orgId).in("placement_candidate_id", ids),
        supabase.from("placement_link_group_members")
            .select("id, placement_link_group_id, placement_candidate_id").eq("org_id", orgId).in("placement_candidate_id", ids),
        supabase.from("customer_members").select("id, display_name, first_name, last_name")
            .eq("org_id", orgId).in("id", candidates.map((c) => c.customer_member_id).filter(Boolean) as string[]),
    ]);

    const ovByCand = new Map<string, Array<Record<string, unknown>>>();
    for (const o of (ovRes.data ?? []) as Array<Record<string, unknown>>) {
        const k = String(o.placement_candidate_id);
        ovByCand.set(k, [...(ovByCand.get(k) ?? []), o]);
    }
    const lgByCand = new Map<string, number>();
    for (const l of (lgRes.data ?? []) as Array<Record<string, unknown>>) {
        const k = String(l.placement_candidate_id);
        lgByCand.set(k, (lgByCand.get(k) ?? 0) + 1);
    }
    const nameByMember = new Map<string, string>();
    for (const m of (cmRes.data ?? []) as Array<Record<string, unknown>>) {
        nameByMember.set(String(m.id), String(m.display_name ?? `${m.first_name ?? ""} ${m.last_name ?? ""}`).trim());
    }

    // Semantic subject = (opportunity, customer_member) for a real candidate.
    const bySubject = new Map<string, Cand[]>();
    for (const c of candidates) {
        if (c.is_synthetic_fallback || !c.customer_member_id) continue;
        const key = `${c.opportunity_id}:${c.customer_member_id}`;
        bySubject.set(key, [...(bySubject.get(key) ?? []), c]);
    }

    const dupes = [...bySubject.entries()].filter(([, v]) => v.filter((c) => c.status === "active").length > 1);
    console.log(`org ${orgId}`);
    console.log(`candidates: ${candidates.length} | real subjects: ${bySubject.size} | duplicate ACTIVE subject sets: ${dupes.length}\n`);

    for (const [subject, list] of dupes) {
        const memberId = subject.split(":")[1]!;
        console.log(`── subject ${memberId.slice(0, 8)} (${nameByMember.get(memberId) ?? "?"}) · opportunity ${subject.split(":")[0]!.slice(0, 8)}`);
        for (const c of list) {
            const ovs = ovByCand.get(c.id) ?? [];
            const active = ovs.filter((o) => o.is_active === true);
            const cr = (c.metadata?.cohort_resolution ?? null) as { program_room_cohort_key?: string } | null;
            console.log(`   ${c.id}`);
            console.log(`     status=${c.status} created=${(c.created_at ?? "").slice(0, 19)} wait_since=${(c.wait_since ?? "").slice(0, 19)}`);
            console.log(`     seed_key=${c.seed_key}`);
            console.log(`     cohort=${c.program_room_cohort_key} label="${c.program_room_group_label}" evidence=${cr?.program_room_cohort_key ?? "-"}`);
            console.log(`     overrides: total=${ovs.length} active=${active.length}${active.length ? " -> " + active.map((o) => `${o.override_kind}${JSON.stringify(o.payload)}@cohort=${o.program_room_cohort_key}`).join(",") : ""}`);
            console.log(`     link_group_members=${lgByCand.get(c.id) ?? 0}  ocm=${c.opportunity_customer_member_id ?? "NULL"}  person=${c.person_id ? c.person_id.slice(0, 8) : "NULL"}`);
            console.log(`     source=${String((c.metadata as { source?: unknown } | null)?.source ?? "-")} pi=${String((c.metadata as { process_instance_id?: unknown } | null)?.process_instance_id ?? "-").slice(0, 8)}`);
        }
        console.log("");
    }
}

void main();
