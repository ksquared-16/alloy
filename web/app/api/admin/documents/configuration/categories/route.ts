import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import { requireDocumentConfigurationRead, requireDocumentConfigurationWrite } from "@/lib/documents/configuration/documentConfigurationAuthority";
import { createCategory, listCategories } from "@/lib/documents/configuration/documentConfigurationService";
import { KEY_RE, slugKey } from "@/lib/documents/configuration/documentTypePolicy";

/**
 * D3 — Document Studio categories (org vocabulary, live on save).
 *
 * GET   the organization's categories, active and archived. `documents.read` or `processing.documents.manage`.
 * POST  { label, key?, description?, parent_id?, sort_order? } creates one. `processing.documents.manage`. The key is
 *       derived from the label when omitted and never changes afterwards. `document_category_changed` is recorded before
 *       the row exists; no record, no category.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const access = await getAdminAccessContextCached();
    const denied = requireDocumentConfigurationRead(access.ok ? access : { roleKeys: [], permissionKeys: ctx.permissionKeys ?? [] });
    if (denied) return denied;
    const listed = await listCategories(createAdminClient(), ctx.orgId);
    if (!listed.ok) return NextResponse.json({ ok: false, error: "Categories could not be read.", code: listed.code }, { status: listed.status });
    return NextResponse.json({ ok: true, categories: listed.value });
}

export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    const denied = requireDocumentConfigurationWrite(ctx);
    if (denied) return denied;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label || label.length > 120) return NextResponse.json({ error: "A category needs a name (up to 120 characters).", code: "LABEL_REQUIRED" }, { status: 400 });
    const key = typeof body.key === "string" && body.key.trim() ? body.key.trim() : slugKey(label);
    if (!KEY_RE.test(key)) return NextResponse.json({ error: "A key is 2–63 lowercase letters, digits or underscores, starting with a letter.", code: "KEY_INVALID" }, { status: 400 });
    const parentId = typeof body.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null;
    const sortOrder = Number.isInteger(body.sort_order) ? (body.sort_order as number) : 0;
    const description = typeof body.description === "string" ? body.description.trim() || null : null;

    const id = randomUUID();
    const audit = await recordDocumentAudit({
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        event: "document_category_changed",
        subject: { type: "document_categories", id },
        route: "admin/documents/configuration/categories",
        detail: { action: "create", key, label, parent_id: parentId },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const created = await createCategory(createAdminClient(), { id, orgId: ctx.orgId, key, label, description, parentId, sortOrder, actorUserId: ctx.userId });
    if (!created.ok) return NextResponse.json({ ok: false, error: "The category could not be created.", code: created.code }, { status: created.status });
    return NextResponse.json({ ok: true, category: created.value });
}
