/**
 * Backfill customers.status_key from legacy customers.status (Phase 6 pre-drop).
 *
 * Usage:
 *   cd web && npx tsx scripts/backfillCanonicalCustomerStatusKey.ts --org-id=<uuid>
 *   CANONICAL_VERIFY_ORG_ID=<uuid> cd web && npx tsx scripts/backfillCanonicalCustomerStatusKey.ts --apply
 *
 * Dry-run by default. Requires BACKFILL_CUSTOMER_STATUS_CONFIRM=APPLY for writes.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
loadEnv({ path: resolve(process.cwd(), ".env"), quiet: true });

function parseOrgId(): string | null {
    const arg = process.argv.find((a) => a.startsWith("--org-id="));
    return (
        arg?.slice("--org-id=".length).trim() ||
        process.env.CANONICAL_VERIFY_ORG_ID?.trim() ||
        process.env.ALLOY_PUBLIC_ORG_ID?.trim() ||
        null
    );
}

async function main(): Promise<void> {
    const orgId = parseOrgId();
    if (!orgId) {
        console.error("Missing org scope. Set --org-id=, CANONICAL_VERIFY_ORG_ID, or ALLOY_PUBLIC_ORG_ID.");
        process.exit(1);
    }
    const apply = process.argv.includes("--apply");
    if (apply && process.env.BACKFILL_CUSTOMER_STATUS_CONFIRM !== "APPLY") {
        console.error("Refusing apply: set BACKFILL_CUSTOMER_STATUS_CONFIRM=APPLY");
        process.exit(1);
    }

    const supabase = createAdminClient();
    const { count, error: countErr } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .is("status_key", null)
        .not("status", "is", null);
    if (countErr) throw new Error(countErr.message);

    console.log(`Org ${orgId}: ${count ?? 0} customers with legacy status but null status_key`);
    if (!count) return;

    if (!apply) {
        console.log("Dry run. To apply:");
        console.log(
            `  BACKFILL_CUSTOMER_STATUS_CONFIRM=APPLY npx tsx scripts/backfillCanonicalCustomerStatusKey.ts --org-id=${orgId} --apply`
        );
        return;
    }

    const { data: rows, error: selErr } = await supabase
        .from("customers")
        .select("id, status")
        .eq("org_id", orgId)
        .is("status_key", null)
        .not("status", "is", null);
    if (selErr) throw new Error(selErr.message);

    let updated = 0;
    for (const row of rows ?? []) {
        const id = (row as { id?: string }).id;
        const status = (row as { status?: string | null }).status;
        if (!id || !status?.trim()) continue;
        const { error: updErr } = await supabase
            .from("customers")
            .update({ status_key: status.trim() })
            .eq("id", id)
            .eq("org_id", orgId);
        if (updErr) throw new Error(`[customers ${id}] ${updErr.message}`);
        updated += 1;
    }
    console.log(`Updated ${updated} customer rows.`);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});
