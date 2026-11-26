#!/usr/bin/env npx tsx
/** Repair PCR platform seeds for all orgs (or --org=<uuid>). */

import { createClient } from "@supabase/supabase-js";
import { provisionPersonChildRelationshipPlatformConfig } from "../lib/fields/personChildRelationship/provisionPersonChildRelationshipPlatformConfig";

async function main() {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
        process.exit(1);
    }
    const supabase = createClient(url, key);
    const orgArg = process.argv.find((a) => a.startsWith("--org="));
    const orgFilter = orgArg?.slice("--org=".length);

    let q = supabase.from("orgs").select("id, name");
    if (orgFilter) q = q.eq("id", orgFilter);
    const { data: orgs, error } = await q;
    if (error) throw error;

    for (const org of orgs ?? []) {
        const result = await provisionPersonChildRelationshipPlatformConfig(supabase, String(org.id));
        console.log(JSON.stringify({ org_id: org.id, name: org.name, ...result }));
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
