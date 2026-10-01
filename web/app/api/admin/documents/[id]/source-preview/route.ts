import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertDocumentAccess, documentAccessHttp } from "@/lib/documents/assertDocumentAccess";
import { sourcePreviewContentType } from "@/lib/pos/sourcePreviewContentType";

/**
 * GET: a stored TEXT source, rendered safely for the review pane.
 *
 * ## Why this exists
 *
 * The import picker accepts HTML, and `hostedFormStructure` reads a hosted form better than any PDF
 * heuristic — a captured form declares its labels, control types, requiredness and choices outright.
 * The review pane, though, only ever knew how to show a PDF: it signed the stored bytes and handed
 * them to pdf.js, which answered "Unexpected server response (400) while retrieving PDF …
 * Admissions_Packet.html". Alloy accepted the file, so Alloy owes the operator a readable view of it.
 *
 * The original upload is untouched. This streams the SAME stored bytes with the headers that make
 * them safe to display, and the caller frames it in a sandboxed iframe — so nothing is converted,
 * nothing is rewritten, and provenance stays the file the operator chose.
 *
 * ## The uploaded document is untrusted evidence, not an application
 *
 * `Content-Security-Policy: sandbox` puts the response in a unique origin with scripts, forms and
 * plugins refused by the browser, independently of how the caller embeds it. `nosniff` stops a
 * mislabelled file being re-interpreted as something executable, and only text formats are served at
 * all — anything else is refused rather than proxied, so this cannot become a general byte pipe.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    const access = await getAdminAccessContextCached();
    const { id } = await context.params;

    const supabase = createAdminClient();

    // Same authority as every other read of these bytes. Never a session-only check: a viewer must not
    // be able to read another child's records through a different route.
    const decision = await assertDocumentAccess({
        supabase,
        actor: {
            ok: ctx.ok,
            failureStatus: ctx.ok ? undefined : ctx.status,
            userId: ctx.ok ? ctx.userId : undefined,
            orgId: ctx.ok ? ctx.orgId : undefined,
            role: ctx.ok ? ctx.role : undefined,
            roleKeys: access.ok ? access.roleKeys : [],
            permissionKeys: access.ok ? access.permissionKeys : [],
        },
        documentId: id,
        operation: "download",
    });
    if (decision.outcome !== "allowed") {
        const http = documentAccessHttp(decision);
        return NextResponse.json(http.body, { status: http.status });
    }

    const { bucket, storagePath } = decision.document;
    /*
     * The stored PATH decides, not a client-supplied name and not a declared mime: `AuthorizedDocument`
     * carries bucket and path only, which is the narrowest thing that can be trusted here.
     */
    const contentType = sourcePreviewContentType(storagePath, null);
    if (!contentType) {
        // A PDF or an image has its own viewer; refusing here keeps this route to one job.
        return NextResponse.json({ ok: false, error: "This source type is not previewed as text." }, { status: 415 });
    }

    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (error || !data) {
        return NextResponse.json({ ok: false, error: "The stored source could not be read." }, { status: 502 });
    }

    return new NextResponse(await data.arrayBuffer(), {
        status: 200,
        headers: {
            "content-type": contentType,
            /*
             * `sandbox` with no tokens: unique origin, no scripts, no forms, no plugins, no top-level
             * navigation. Enforced by the browser on the RESPONSE, so it holds even if some future
             * caller forgets the iframe attribute.
             */
            "content-security-policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
            "x-content-type-options": "nosniff",
            "content-disposition": "inline",
            "cache-control": "private, no-store",
            "referrer-policy": "no-referrer",
        },
    });
}
