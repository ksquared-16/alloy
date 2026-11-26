/**
 * D1c-1 — one-time structural-screening SURVEY of existing stored documents. REPORT-ONLY.
 *
 * What it does: for every `documents` row of one organization (or `--all`), it downloads the stored object, runs the same
 * `screenDocumentBytes` the upload paths use, and prints a machine-readable report: counts per verdict and reason, and
 * the ids (never names, paths, titles or contents) of documents that the current engine would quarantine or refuse.
 *
 * What it NEVER does: change a status, write metadata, move, copy or delete anything. Acting on its findings (for
 * example quarantining historical documents) needs separate Director authorization, and would go through a governed,
 * audited path, not this script.
 *
 * Bounded: `--limit` (default 500) documents per run, one object in memory at a time, and the engine's own per-file
 * limits (time, streams, inflated bytes).
 *
 * Run by the trusted host only (it needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/documentScreeningSurvey.ts --org <org_id> [--limit 500]
 */
import { createClient } from "@supabase/supabase-js";

import { isStoragePathWithinOrg } from "../lib/documents/storagePathAuthority";
import type { DocumentContentKind } from "../lib/documents/documentContentSignature";
import { screenDocumentBytes, SCREENING_ENGINE } from "../lib/documents/structuralScreening";

const KIND_BY_MIME: Record<string, DocumentContentKind> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpeg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "text/plain": "txt",
    "text/csv": "csv",
    "text/html": "html",
};

function arg(name: string): string | null {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    const org = arg("--org");
    const all = process.argv.includes("--all");
    if (!org && !all) throw new Error("name an organization (--org <uuid>) or pass --all");
    const limit = Math.max(1, Math.min(5000, Number(arg("--limit") ?? 500)));

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    let q = supabase.from("documents").select("id, org_id, bucket, storage_path, mime_type, status").order("created_at", { ascending: true }).limit(limit);
    if (org) q = q.eq("org_id", org);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const counts: Record<string, number> = {};
    const flagged: Array<{ document_id: string; verdict: string; reason: string }> = [];
    const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
    for (const row of (data ?? []) as Array<{ id: string; org_id: string; bucket: string | null; storage_path: string | null; mime_type: string | null; status: string | null }>) {
        const kind = KIND_BY_MIME[String(row.mime_type ?? "").toLowerCase()];
        if (!kind) { bump("skipped:unknown_type"); continue; }
        if (!row.bucket || !row.storage_path || !isStoragePathWithinOrg(row.storage_path, row.org_id)) { bump("skipped:no_or_foreign_path"); continue; }
        const { data: blob, error: dlErr } = await supabase.storage.from(row.bucket).download(row.storage_path);
        if (dlErr || !blob) { bump("skipped:object_missing"); continue; }
        const r = screenDocumentBytes(new Uint8Array(await blob.arrayBuffer()), kind);
        const reason = r.verdict === "clean" ? "" : r.reason;
        bump(`${r.verdict}${reason ? `:${reason}` : ""}`);
        if (r.verdict !== "clean") flagged.push({ document_id: row.id, verdict: r.verdict, reason });
    }
    console.log(JSON.stringify({ engine: SCREENING_ENGINE, report_only: true, organization: org ?? "all", examined: (data ?? []).length, counts, flagged }, null, 2));
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
