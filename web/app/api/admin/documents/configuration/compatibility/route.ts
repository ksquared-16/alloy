import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireDocumentConfigurationRead } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { compatibilityReport } from "@/lib/documents/configuration/documentConfigurationService";

/**
 * GET — D3: how the organization's stored `documents.doc_type` values map onto its document types. Counts only, never a
 * document. A value with no type is reported as unregistered; nothing is reclassified. `documents.read` or
 * `processing.documents.manage`.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    const denied = requireDocumentConfigurationRead(access.ok ? access : { roleKeys: [], permissionKeys: ctx.permissionKeys ?? [] });
    if (denied) return denied;
    const report = await compatibilityReport(createAdminClient(), ctx.orgId);
    if (!report.ok) return NextResponse.json({ ok: false, error: "The mapping could not be read.", code: report.code }, { status: report.status });
    return NextResponse.json({ ok: true, doc_types: report.value });
}
