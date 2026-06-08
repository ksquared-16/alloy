#!/usr/bin/env npx tsx
/**
 * Dev/demo-only wipe of **all Forms module data** for one org.
 *
 * Clears form submissions, public links, packet sessions, packet definitions,
 * form definitions/versions, and documents linked to form submissions.
 *
 * Does **not** delete opportunities, customers, persons, workflow events, or other
 * platform rows created from form intake — only Forms-owned tables.
 *
 * Usage (from `web/`):
 *
 *   # Dry-run — counts only (default)
 *   npx tsx scripts/resetFormsDemoData.ts --org-id <ORG_UUID>
 *
 *   # Destructive delete (requires --confirm)
 *   npx tsx scripts/resetFormsDemoData.ts --org-id <ORG_UUID> --confirm
 *
 * Env:
 *   SUPABASE_SERVICE_ROLE_KEY (required)
 *   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *
 * Refuses when VERCEL_ENV=production.
 *
 * @see web/scripts/resetStagingDemoData.ts — broader staging demo reset pattern
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** FK-safe delete order for org-scoped Forms data. */
const DELETE_ORDER = [
    "form_packet_session_items",
    "form_packet_sessions",
    "form_submissions",
    "documents",
    "form_public_links",
    "form_packet_items",
    "form_packet_definitions",
    "form_definitions",
] as const;

type DeleteKey = (typeof DELETE_ORDER)[number];

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type PlanRow = {
    table: DeleteKey | "form_submission_documents" | "form_submission_signatures" | "form_definition_versions";
    count: number;
    note?: string;
};

function parseArgs(argv: string[]): { orgId: string | null; confirm: boolean } {
    let orgId: string | null = null;
    for (const arg of argv) {
        if (arg.startsWith("--org-id=")) {
            const v = arg.slice("--org-id=".length).trim();
            if (UUID_RE.test(v)) orgId = v;
        } else if (arg === "--org-id") {
            // allow `--org-id <uuid>` in next arg — handled below
        }
    }
    const orgIdx = argv.indexOf("--org-id");
    if (!orgId && orgIdx >= 0) {
        const v = argv[orgIdx + 1]?.trim();
        if (v && UUID_RE.test(v)) orgId = v;
    }
    return { orgId, confirm: argv.includes("--confirm") };
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function countOrgRows(supabase: SupabaseAdmin, table: string, orgId: string): Promise<number> {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if (error) throw new Error(`[${table} count] ${error.message}`);
    return count ?? 0;
}

async function selectOrgIds(supabase: SupabaseAdmin, table: string, orgId: string): Promise<string[]> {
    const ids: string[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
            .from(table)
            .select("id")
            .eq("org_id", orgId)
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
        if (error) throw new Error(`[${table} select] ${error.message}`);
        for (const row of data ?? []) {
            const id = (row as { id?: string }).id;
            if (id) ids.push(id);
        }
        if (!data?.length || data.length < pageSize) break;
    }
    return ids;
}

async function collectFormLinkedDocumentIds(supabase: SupabaseAdmin, orgId: string): Promise<string[]> {
    const submissionIds = await selectOrgIds(supabase, "form_submissions", orgId);
    const docIds = new Set<string>();
    for (const part of chunk(submissionIds, 200)) {
        const { data: joinRows, error: jErr } = await supabase
            .from("form_submission_documents")
            .select("document_id")
            .eq("org_id", orgId)
            .in("form_submission_id", part);
        if (jErr) throw new Error(`[form_submission_documents select] ${jErr.message}`);
        for (const r of joinRows ?? []) {
            const id = (r as { document_id?: string }).document_id;
            if (id) docIds.add(id);
        }
        const { data: sigRows, error: sErr } = await supabase
            .from("form_submission_signatures")
            .select("drawn_asset_document_id")
            .eq("org_id", orgId)
            .in("form_submission_id", part);
        if (sErr) throw new Error(`[form_submission_signatures select] ${sErr.message}`);
        for (const r of sigRows ?? []) {
            const id = (r as { drawn_asset_document_id?: string | null }).drawn_asset_document_id;
            if (id) docIds.add(id);
        }
    }
    return [...docIds];
}

async function deleteOrgRows(supabase: SupabaseAdmin, table: string, orgId: string): Promise<number> {
    const { data, error } = await supabase.from(table).delete().eq("org_id", orgId).select("id");
    if (error) throw new Error(`[${table} delete] ${error.message}`);
    return (data ?? []).length;
}

async function deleteDocumentsById(supabase: SupabaseAdmin, orgId: string, documentIds: string[]): Promise<number> {
    if (!documentIds.length) return 0;
    let deleted = 0;
    for (const part of chunk(documentIds, 200)) {
        const { data, error } = await supabase.from("documents").delete().eq("org_id", orgId).in("id", part).select("id");
        if (error) throw new Error(`[documents delete] ${error.message}`);
        deleted += (data ?? []).length;
    }
    return deleted;
}

async function buildPlan(supabase: SupabaseAdmin, orgId: string): Promise<{ rows: PlanRow[]; documentIds: string[] }> {
    const documentIds = await collectFormLinkedDocumentIds(supabase, orgId);
    const rows: PlanRow[] = [
        { table: "form_packet_session_items", count: await countOrgRows(supabase, "form_packet_session_items", orgId) },
        { table: "form_packet_sessions", count: await countOrgRows(supabase, "form_packet_sessions", orgId) },
        {
            table: "form_submission_documents",
            count: await countOrgRows(supabase, "form_submission_documents", orgId),
            note: "Cascades when form_submissions deleted",
        },
        {
            table: "form_submission_signatures",
            count: await countOrgRows(supabase, "form_submission_signatures", orgId),
            note: "Cascades when form_submissions deleted",
        },
        { table: "form_submissions", count: await countOrgRows(supabase, "form_submissions", orgId) },
        {
            table: "documents",
            count: documentIds.length,
            note: "Only documents linked to form submissions (generated PDFs, signature assets, uploads)",
        },
        { table: "form_public_links", count: await countOrgRows(supabase, "form_public_links", orgId) },
        { table: "form_packet_items", count: await countOrgRows(supabase, "form_packet_items", orgId) },
        { table: "form_packet_definitions", count: await countOrgRows(supabase, "form_packet_definitions", orgId) },
        {
            table: "form_definition_versions",
            count: await countOrgRows(supabase, "form_definition_versions", orgId),
            note: "Cascades when form_definitions deleted",
        },
        { table: "form_definitions", count: await countOrgRows(supabase, "form_definitions", orgId) },
    ];
    return { rows, documentIds };
}

async function assertOrgExists(supabase: SupabaseAdmin, orgId: string): Promise<void> {
    const { data, error } = await supabase.from("orgs").select("id, name").eq("id", orgId).maybeSingle();
    if (error) throw new Error(`[orgs lookup] ${error.message}`);
    if (!data) {
        console.error(`Org not found: ${orgId}`);
        process.exit(1);
    }
    const name = (data as { name?: string }).name;
    console.log(`Target org: ${name ?? "(unnamed)"} (${orgId})`);
}

function printPlan(rows: PlanRow[], mode: string): void {
    console.log(`\n=== resetFormsDemoData: ${mode} ===\n`);
    console.log("Tables cleared (FK-safe order):\n");
    for (const key of DELETE_ORDER) {
        const primary = rows.find((r) => r.table === key);
        if (primary) {
            console.log(`  ${primary.table}: ${primary.count}${primary.note ? ` (${primary.note})` : ""}`);
        }
        if (key === "form_submissions") {
            for (const aux of rows.filter((r) =>
                r.table === "form_submission_documents" || r.table === "form_submission_signatures"
            )) {
                console.log(`  ${aux.table}: ${aux.count}${aux.note ? ` (${aux.note})` : ""}`);
            }
        }
        if (key === "form_definitions") {
            const versions = rows.find((r) => r.table === "form_definition_versions");
            if (versions) {
                console.log(`  ${versions.table}: ${versions.count}${versions.note ? ` (${versions.note})` : ""}`);
            }
        }
    }
    console.log("\nPreserved: opportunities, customers, persons, workflow events, org config, non-form documents.");
}

async function executeDelete(supabase: SupabaseAdmin, orgId: string, documentIds: string[]): Promise<Record<DeleteKey, number>> {
    const deleted: Record<DeleteKey, number> = {
        form_packet_session_items: 0,
        form_packet_sessions: 0,
        form_submissions: 0,
        documents: 0,
        form_public_links: 0,
        form_packet_items: 0,
        form_packet_definitions: 0,
        form_definitions: 0,
    };

    deleted.form_packet_session_items = await deleteOrgRows(supabase, "form_packet_session_items", orgId);
    deleted.form_packet_sessions = await deleteOrgRows(supabase, "form_packet_sessions", orgId);
    deleted.form_submissions = await deleteOrgRows(supabase, "form_submissions", orgId);
    deleted.documents = await deleteDocumentsById(supabase, orgId, documentIds);
    deleted.form_public_links = await deleteOrgRows(supabase, "form_public_links", orgId);
    deleted.form_packet_items = await deleteOrgRows(supabase, "form_packet_items", orgId);
    deleted.form_packet_definitions = await deleteOrgRows(supabase, "form_packet_definitions", orgId);
    deleted.form_definitions = await deleteOrgRows(supabase, "form_definitions", orgId);

    return deleted;
}

async function main(): Promise<void> {
    const { orgId, confirm } = parseArgs(process.argv.slice(2));

    if (process.env.VERCEL_ENV === "production") {
        console.error("Refusing to run: VERCEL_ENV=production");
        process.exit(1);
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        console.error("Missing SUPABASE_SERVICE_ROLE_KEY");
        process.exit(1);
    }

    if (!orgId) {
        console.error("Missing or invalid --org-id <UUID>");
        console.error("\nUsage:");
        console.error("  npx tsx scripts/resetFormsDemoData.ts --org-id <ORG_UUID>");
        console.error("  npx tsx scripts/resetFormsDemoData.ts --org-id <ORG_UUID> --confirm");
        process.exit(1);
    }

    const supabase = createAdminClient();
    await assertOrgExists(supabase, orgId);

    const { rows, documentIds } = await buildPlan(supabase, orgId);
    printPlan(rows, confirm ? "EXECUTE (destructive)" : "DRY-RUN (counts only)");

    if (!confirm) {
        console.log("\nNo rows deleted. Re-run with --confirm to delete.\n");
        const allZero = rows.every((r) => r.count === 0);
        if (allZero) {
            console.log("Org already has zero Forms rows — ready for manual form creation.\n");
        }
        return;
    }

    console.log("\nDeleting…\n");
    const deleted = await executeDelete(supabase, orgId, documentIds);

    console.log("--- Deleted row counts ---\n");
    for (const key of DELETE_ORDER) {
        console.log(`  ${key}: ${deleted[key]}`);
    }
    console.log("\nExecute complete. Forms workspace is cleared for this org.\n");
    console.log("Next: create Use Case #1 manually in Admin → Forms.\n");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
