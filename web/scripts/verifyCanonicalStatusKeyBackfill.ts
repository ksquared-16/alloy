/**
 * Verify status_key backfill before legacy status column drops (Phase 6).
 *
 * Usage: cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts
 */

import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Missing ${name}`);
    return v;
}

type GapRow = { table: string; id: string; legacy_status: string | null };

async function main() {
    const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
    });

    const tables = [
        { table: "opportunities", legacyCol: "status" },
        { table: "persons", legacyCol: "status" },
        { table: "customers", legacyCol: "status" },
    ] as const;

    let totalGaps = 0;
    for (const { table, legacyCol } of tables) {
        const { data, error } = await supabase
            .from(table)
            .select(`id, status_key, ${legacyCol}`)
            .is("status_key", null)
            .not(legacyCol, "is", null)
            .limit(25);
        if (error) {
            console.error(`[${table}] query error:`, error.message);
            continue;
        }
        const gaps = (data ?? []) as GapRow[];
        totalGaps += gaps.length;
        console.log(`\n${table}: rows with legacy ${legacyCol} but null status_key (sample max 25): ${gaps.length}`);
        for (const row of gaps) {
            console.log(`  - ${row.id} legacy=${JSON.stringify((row as Record<string, unknown>)[legacyCol])}`);
        }
    }

    if (totalGaps > 0) {
        console.error("\nBackfill required before dropping legacy status columns.");
        process.exit(1);
    }
    console.log("\nOK — no sampled rows with legacy status and null status_key.");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
