import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
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
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    let limit = Number(searchParams.get("limit") ?? DEFAULT_LIMIT);
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    limit = Math.min(limit, MAX_LIMIT);

    const supabase = createAdminClient();

    try {
        const { data: docRows, error: docErr } = await supabase
            .from("documents")
            .select("id, title, original_filename, doc_type, created_at")
            .eq("org_id", ctx.orgId)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (docErr) throw new Error(docErr.message);
        const docs = (docRows ?? []) as PosDocumentRow[];

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
