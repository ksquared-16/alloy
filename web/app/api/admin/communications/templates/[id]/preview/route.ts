import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { buildTemplatePreview } from "@/lib/communications/v2/templateService";

/**
 * Communications V2 — template preview (Phase 1 / B2).
 * Renders the current version's subject/body against a sample context using the
 * B0 token engine. Returns rendered text + token segments + missing/unknown
 * tokens. NO send, NO queue, NO provider behavior.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** POST /api/admin/communications/templates/[id]/preview — render-only token preview. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid template id" }, { status: 400 });

    // Optional sample context for token resolution; defaults to {} (all tokens "missing").
    let context: Record<string, unknown> = {};
    try {
        const raw = await request.json();
        if (raw && typeof raw === "object" && raw.context && typeof raw.context === "object") {
            context = raw.context as Record<string, unknown>;
        }
    } catch {
        // empty/invalid body is fine — preview with no sample context.
    }

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: template, error } = await supabase
        .from("communication_templates")
        .select("id, current_version_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const currentVersionId = (template as Record<string, unknown>).current_version_id;
    if (typeof currentVersionId !== "string" || currentVersionId.length === 0) {
        return NextResponse.json({ error: "Template has no current version to preview" }, { status: 409 });
    }

    const { data: version, error: vErr } = await supabase
        .from("communication_template_versions")
        .select("id, version_number, subject, body")
        .eq("org_id", orgId)
        .eq("id", currentVersionId)
        .maybeSingle();
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    if (!version) return NextResponse.json({ error: "Current version not found" }, { status: 404 });

    const rec = version as Record<string, unknown>;
    const preview = buildTemplatePreview(
        {
            subject: rec.subject != null ? String(rec.subject) : null,
            body: rec.body != null ? String(rec.body) : "",
        },
        context
    );

    return NextResponse.json({
        template_id: id,
        version_number: rec.version_number ?? null,
        subject: preview.subject
            ? {
                  rendered: preview.subject.plainText,
                  segments: preview.subject.segments,
                  missing_tokens: preview.subject.missingPaths,
                  unknown_tokens: preview.subject.unknownPaths,
              }
            : null,
        body: {
            rendered: preview.body.plainText,
            segments: preview.body.segments,
            missing_tokens: preview.body.missingPaths,
            unknown_tokens: preview.body.unknownPaths,
        },
    });
}
