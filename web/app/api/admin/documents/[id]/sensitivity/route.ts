import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    assertDocumentAccess,
    documentAccessHttp,
    documentActorForRequest,
    requireDocumentWrite,
} from "@/lib/documents/assertDocumentAccess";
import { DOCUMENT_AUDIT_UNAVAILABLE, recordDocumentAudit } from "@/lib/documents/documentAudit";
import {
    actorMayReadSensitivity,
    classForDeclaredSensitivity,
    DECLARED_DOCUMENT_SENSITIVITIES,
    type DeclaredDocumentSensitivity,
} from "@/lib/documents/documentSensitivity";

/**
 * POST { sensitivity, reason } — D2: RAISE a document's declared sensitivity class.
 *
 * Raise-only, as the database enforces: from `standard` to any class, or from any class to `restricted`. Lowering is not
 * offered in this slice. Needs `documents.write`, the full access decision on the document, and the actor's own clearance
 * for the class being declared — nobody classifies a document into a class they could not read themselves.
 * `document_sensitivity_raised` is recorded before the change.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden", code: "AUTH" }, { status: ctx.status });
    const writeDenied = requireDocumentWrite(ctx);
    if (writeDenied) return writeDenied;
    const access = await getAdminAccessContextCached();
    const { id } = await context.params;
    const supabase = createAdminClient();
    const actor = documentActorForRequest(ctx, access);

    const decision = await assertDocumentAccess({ supabase, actor, documentId: id, operation: "download" });
    if (decision.outcome !== "allowed") {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }

    const body = (await request.json().catch(() => ({}))) as { sensitivity?: unknown; reason?: unknown };
    const target = body.sensitivity;
    if (typeof target !== "string" || !(DECLARED_DOCUMENT_SENSITIVITIES as readonly string[]).includes(target) || target === "standard") {
        return NextResponse.json({ error: "Name a sensitivity class to raise the document to.", code: "BAD_SENSITIVITY" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10) return NextResponse.json({ error: "A written reason (at least 10 characters) is required.", code: "REASON_REQUIRED" }, { status: 400 });
    const cls = classForDeclaredSensitivity(target);
    if (cls && !actorMayReadSensitivity(actor, new Set([cls]))) {
        return NextResponse.json({ ok: false, error: "You are not cleared for that class.", code: "CLEARANCE_REQUIRED" }, { status: 403 });
    }

    const { data: row, error: readErr } = await supabase
        .from("documents")
        .select("sensitivity")
        .eq("org_id", decision.document.orgId)
        .eq("id", decision.document.id)
        .maybeSingle();
    if (readErr || !row) return NextResponse.json({ ok: false, error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
    const current = (row as { sensitivity: DeclaredDocumentSensitivity }).sensitivity;
    if (current === target) return NextResponse.json({ ok: true, document_id: decision.document.id, sensitivity: current, changed: false });
    if (!(current === "standard" || target === "restricted")) {
        return NextResponse.json({ ok: false, error: "A document's sensitivity may only be raised.", code: "SENSITIVITY_LOWERING" }, { status: 409 });
    }

    const audit = await recordDocumentAudit({
        orgId: decision.document.orgId,
        actorUserId: ctx.userId,
        event: "document_sensitivity_raised",
        subject: { type: "documents", id: decision.document.id },
        route: "admin/documents/sensitivity",
        detail: { from: current, to: target, reason },
    });
    if (!audit.ok) return NextResponse.json(DOCUMENT_AUDIT_UNAVAILABLE.body, { status: DOCUMENT_AUDIT_UNAVAILABLE.status });

    const { error } = await supabase
        .from("documents")
        .update({ sensitivity: target })
        .eq("org_id", decision.document.orgId)
        .eq("id", decision.document.id)
        .eq("sensitivity", current);
    if (error) {
        const lowering = /document_sensitivity_lowering/.test(error.message ?? "");
        return NextResponse.json(
            { ok: false, error: lowering ? "A document's sensitivity may only be raised." : "The class could not be changed.", code: lowering ? "SENSITIVITY_LOWERING" : "SENSITIVITY_CHANGE_FAILED" },
            { status: lowering ? 409 : 500 },
        );
    }
    return NextResponse.json({ ok: true, document_id: decision.document.id, sensitivity: target, changed: true });
}
