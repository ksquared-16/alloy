import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { PROCESSING_DOCUMENTS_MANAGE, requireProcessingCapability } from "@/lib/access/processingAuthority";
import { filterDocumentRowsInActorScope, requireDocumentRead } from "@/lib/documents/assertDocumentAccess";
import { filterDocumentRowsBySensitivity } from "@/lib/documents/documentSensitivity";
import { isDocumentUnavailable } from "@/lib/documents/documentAvailability";
import {
    buildPosDocumentsList,
    type PosDocumentCaseInfo,
    type PosDocumentCaseLink,
    type PosDocumentRow,
} from "@/lib/pos/posDocumentsList";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/admin/pos/documents — POS Documents tab list.
 *
 * Returns recent org documents joined to their Processing Case (classification +
 * lifecycle status) so the operator can see uploads and jump into Processing.
 * Read-only; org-scoped. No matching, no commit.
 *
 * ── AUTHORITY (Documents V1 / D1a) ──
 *
 * Before D1a this asked only for a session: any portal member could list every document in the
 * organization with its title, file name and type. It now requires `processing.documents.manage` —
 * the Processing source-document authority this tab's own rename/delete already require — AND the
 * documents read admission every document route shares, and it narrows rows to the actor's
 * department/site scope with the same predicate as the general list. Nothing in the product calls
 * this list today; Processing reads its queue through `/api/admin/processing/queue`.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const deniedProcessing = requireProcessingCapability(ctx, PROCESSING_DOCUMENTS_MANAGE);
    if (deniedProcessing) return deniedProcessing;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const deniedRead = requireDocumentRead(access);
    if (deniedRead) return deniedRead;

    const { searchParams } = new URL(request.url);
    let limit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    limit = Math.min(limit, MAX_LIMIT);

    const supabase = createAdminClient();

    try {
        const { data: docRows, error: docErr } = await supabase
            .from("documents")
            .select("id, title, original_filename, doc_type, created_at, entity_type, entity_id, status")
            .eq("org_id", ctx.orgId)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (docErr) throw new Error(docErr.message);
        const scoped = await filterDocumentRowsBySensitivity(
            supabase,
            ctx.orgId,
            access,
            await filterDocumentRowsInActorScope(
                supabase,
                ctx.orgId,
                scopeDimensionsFromAccess(access),
                ((docRows ?? []) as Array<PosDocumentRow & { entity_type: string | null; entity_id: string | null; status?: string | null }>).filter(
                    (r) => !isDocumentUnavailable(r.status),
                ),
            ),
        );
        const docs: PosDocumentRow[] = scoped.map((d) => ({
            id: d.id,
            title: d.title,
            original_filename: d.original_filename,
            doc_type: d.doc_type,
            created_at: d.created_at,
        }));

        const links: PosDocumentCaseLink[] = [];
        const cases: PosDocumentCaseInfo[] = [];

        if (docs.length > 0) {
            const docIds = docs.map((d) => d.id);
            const { data: srcRows, error: srcErr } = await supabase
                .from("processing_case_sources")
                .select("processing_case_id, source_id")
                .eq("org_id", ctx.orgId)
                .eq("source_kind", "document")
                .eq("role", "primary")
                .in("source_id", docIds);
            if (srcErr) throw new Error(srcErr.message);
            for (const r of (srcRows ?? []) as { processing_case_id: string; source_id: string }[]) {
                links.push({ document_id: r.source_id, processing_case_id: r.processing_case_id });
            }

            const caseIds = [...new Set(links.map((l) => l.processing_case_id))];
            if (caseIds.length > 0) {
                const { data: caseRows, error: caseErr } = await supabase
                    .from("processing_cases")
                    .select("id, status, case_type")
                    .eq("org_id", ctx.orgId)
                    .in("id", caseIds);
                if (caseErr) throw new Error(caseErr.message);
                for (const c of (caseRows ?? []) as { id: string; status: string; case_type: string | null }[]) {
                    cases.push({ id: c.id, status: c.status, classification_key: c.case_type });
                }
            }
        }

        return NextResponse.json({ documents: buildPosDocumentsList(docs, links, cases) });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load POS documents" },
            { status: 500 }
        );
    }
}
