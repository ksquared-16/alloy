import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { mintExistingRecordFormLinkForAdmin } from "@/lib/forms/existingRecord/mintExistingRecordFormLinkForAdmin";
import { resolvePublicAppOrigin } from "@/lib/publicAppUrl";

/**
 * The origin these public/embed links are built on.
 *
 * It is read from the ONE canonical public-origin authority and NOT from the request.
 * These links are copied into emails, texts and third-party pages, so their origin has to
 * be a property of the environment rather than of whichever host the operator's browser
 * happened to reach — and a `Host` / `X-Forwarded-Host` header is caller-supplied, so
 * deriving from it let a spoofed header choose where a recipient's link points.
 */
function deriveEmbedBaseUrl(): string | null {
    const decision = resolvePublicAppOrigin();
    return decision.ok ? decision.origin : null;
}

/** POST /api/admin/opportunities/[id]/form-send — mint existing-record form link for an opportunity. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { id: rawId } = await context.params;
    const opportunityId = parseUuidParam(rawId, "id");
    if (opportunityId instanceof NextResponse) return opportunityId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const formDefinitionIdRaw = typeof body.form_definition_id === "string" ? body.form_definition_id.trim() : "";
    const formDefinitionId = parseUuidParam(formDefinitionIdRaw, "form_definition_id");
    if (formDefinitionId instanceof NextResponse) return formDefinitionId;

    const label =
        typeof body.label === "string"
            ? body.label.trim()
            : typeof body.name === "string"
              ? body.name.trim()
              : null;

    const supabase = createAdminClient();
    const mint = await mintExistingRecordFormLinkForAdmin({
        supabase,
        orgId: ctx.orgId,
        formDefinitionId,
        launch: {
            entityType: "opportunity",
            entityId: opportunityId,
            label,
        },
        embedBaseUrl: deriveEmbedBaseUrl(),
    });

    if (!mint.ok) return jsonError(mint.message, mint.status);

    return jsonData(
        {
            public_link_id: mint.data.public_link_id,
            embed_path: mint.data.embed_path,
            embed_url: mint.data.embed_url,
            plaintext_token: mint.data.plaintext_token,
            metadata: mint.data.metadata,
        },
        { status: 201 }
    );
}
