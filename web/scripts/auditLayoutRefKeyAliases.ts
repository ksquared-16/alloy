/**
 * Audit stored layout JSON for deprecated refKeys (Phase 6 dry-run).
 *
 * Usage: cd web && npx tsx scripts/auditLayoutRefKeyAliases.ts
 */

import { createClient } from "@supabase/supabase-js";
import { LAYOUT_REFKEY_ALIASES } from "@/lib/layout/layoutRefKeyAliases";
import { migrateLayoutConfigRefKeys } from "@/lib/layout/migrateStoredLayoutRefKeys";

function env(name: string): string {
    const v = process.env[name]?.trim();
    if (!v) throw new Error(`Missing ${name}`);
    return v;
}

const DEPRECATED_PREFIXES = ["child_inquiry."];

function countDeprecatedRefKeys(config: unknown): string[] {
    const hits: string[] = [];
    const json = JSON.stringify(config ?? {});
    for (const key of Object.keys(LAYOUT_REFKEY_ALIASES)) {
        if (json.includes(`"${key}"`)) hits.push(key);
    }
    for (const prefix of DEPRECATED_PREFIXES) {
        const re = new RegExp(`"${prefix.replace(".", "\\.")}[^"]+"`, "g");
        const m = json.match(re);
        if (m) hits.push(...m.map((s) => s.replace(/"/g, "")));
    }
    return [...new Set(hits)];
}

async function main() {
    const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
    });
    const orgId = process.env.AUDIT_ORG_ID?.trim();

    let q = supabase.from("record_drawer_layouts").select("id, org_id, entity_type, layout_key, config_json");
    if (orgId) q = q.eq("org_id", orgId);

    const { data, error } = await q.limit(500);
    if (error) throw new Error(error.message);

    let layoutsWithDeprecated = 0;
    let wouldRewrite = 0;

    for (const row of data ?? []) {
        const config = (row as { config_json?: unknown }).config_json;
        const deprecated = countDeprecatedRefKeys(config);
        if (deprecated.length === 0) continue;
        layoutsWithDeprecated += 1;
        const migration = migrateLayoutConfigRefKeys(
            typeof config === "object" && config != null ? structuredClone(config) : config
        );
        if (migration.changed) wouldRewrite += 1;
        console.log(
            `[${(row as { entity_type?: string }).entity_type}/${(row as { layout_key?: string }).layout_key}] deprecated: ${deprecated.join(", ")}`
        );
        if (migration.refKeysRewritten.length) {
            console.log(`  would rewrite: ${migration.refKeysRewritten.join("; ")}`);
        }
    }

    console.log(`\nScanned ${data?.length ?? 0} layouts; ${layoutsWithDeprecated} with deprecated refKeys; ${wouldRewrite} migratable.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
