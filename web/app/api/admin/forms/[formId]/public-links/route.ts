import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    dbGetFormDefinition,
    dbGetVersion,
    dbInsertFormPublicLink,
    dbListPublicLinksForForm,
} from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { generateSecureFormLinkPlaintext, buildPublicFormEmbedPath } from "@/lib/admin/forms/formPublicLinkToken";
import { mergePublicLinkMetadataForCreate } from "@/lib/forms/intake/defaultPublicLinkMetadata";
import {
    parseExistingRecordLaunchBody,
} from "@/lib/forms/existingRecord/existingRecordFormLaunch";
import { mintExistingRecordFormLinkForAdmin } from "@/lib/forms/existingRecord/mintExistingRecordFormLinkForAdmin";
import { parsePrefillFieldMapBody } from "@/lib/forms/prefill/prefillFieldMap";

function deriveEmbedBaseUrl(request: NextRequest): string | null {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host?.trim()) return null;
    const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
    return `${proto}://${host.trim()}`;
}

async function validatePinnedVersion(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    formDefinitionId: string,
    versionId: string
): Promise<NextResponse | null> {
    const { data: ver, error } = await dbGetVersion(supabase, orgId, versionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ver) return jsonError("pinned_form_definition_version_id not found", 404);
    const row = ver as { form_definition_id: string };
    if (row.form_definition_id !== formDefinitionId) {
        return jsonError("pinned version does not belong to this form", 400);
    }
    return null;
}

/** GET /api/admin/forms/[formId]/public-links — list links (no token or hash). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { formId: rawFormId } = await params;
    const formId = parseUuidParam(rawFormId, "formId");
    if (formId instanceof NextResponse) return formId;

    const supabase = createAdminClient();
    const { data: form, error: formErr } = await dbGetFormDefinition(supabase, ctx.orgId, formId);
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
    if (!form) return jsonError("Not found", 404);

    const { data, error } = await dbListPublicLinksForForm(supabase, ctx.orgId, formId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return jsonData(data ?? []);
}

/** POST /api/admin/forms/[formId]/public-links — create link; returns plaintext token once. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { formId: rawFormId } = await params;
    const formId = parseUuidParam(rawFormId, "formId");
    if (formId instanceof NextResponse) return formId;

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const supabase = createAdminClient();
    const { data: form, error: formErr } = await dbGetFormDefinition(supabase, ctx.orgId, formId);
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
    if (!form) return jsonError("Not found", 404);

    let pinnedId: string | null | undefined = undefined;
    if ("pinned_form_definition_version_id" in body) {
        const v = body.pinned_form_definition_version_id;
        if (v === null || v === undefined || v === "") {
            pinnedId = null;
        } else if (typeof v === "string") {
            const p = parseUuidParam(v, "pinned_form_definition_version_id");
            if (p instanceof NextResponse) return p;
            pinnedId = p;
        } else {
            return jsonError("pinned_form_definition_version_id must be a UUID string or null", 400);
        }
    }

    if (pinnedId) {
        const bad = await validatePinnedVersion(supabase, ctx.orgId, formId, pinnedId);
        if (bad) return bad;
    }

    let expires_at: string | null | undefined = undefined;
    if ("expires_at" in body) {
        const raw = body.expires_at;
        if (raw === null) expires_at = null;
        else if (typeof raw === "string" && raw.trim()) {
            const t = Date.parse(raw);
            if (Number.isNaN(t)) return jsonError("expires_at must be a valid ISO 8601 datetime", 400);
            expires_at = new Date(t).toISOString();
        } else {
            return jsonError("expires_at must be null or an ISO 8601 datetime string", 400);
        }
    }

    let allowed_embed_origins: string[] | null | undefined = undefined;
    if ("allowed_embed_origins" in body) {
        const raw = body.allowed_embed_origins;
        if (raw === null) allowed_embed_origins = null;
        else if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
            allowed_embed_origins = raw.map((s: string) => s.trim()).filter(Boolean);
        } else {
            return jsonError("allowed_embed_origins must be null or an array of strings", 400);
        }
    }

    const clientMetadata: Record<string, unknown> =
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? { ...(body.metadata as Record<string, unknown>) }
            : {};
    delete clientMetadata.prefill_field_map;

    const formRow = form as { key: string; metadata?: Record<string, unknown> };
    const metadata = await mergePublicLinkMetadataForCreate(supabase, {
        orgId: ctx.orgId,
        formKey: formRow.key,
        formMetadata: formRow.metadata,
        clientMetadata,
    });

    const launchRaw = body.launch_from_entity;
    if (launchRaw !== undefined && launchRaw !== null) {
        const parsedLaunch = parseExistingRecordLaunchBody(launchRaw);
        if ("error" in parsedLaunch) return jsonError(parsedLaunch.error, 400);

        const entityId = parseUuidParam(parsedLaunch.entityId, "launch_from_entity.entity_id");
        if (entityId instanceof NextResponse) return entityId;

        const mint = await mintExistingRecordFormLinkForAdmin({
            supabase,
            orgId: ctx.orgId,
            formDefinitionId: formId,
            launch: { ...parsedLaunch, entityId },
            embedBaseUrl: deriveEmbedBaseUrl(request),
            clientMetadata,
            label:
                typeof body.label === "string"
                    ? body.label.trim()
                    : typeof body.name === "string"
                      ? body.name.trim()
                      : parsedLaunch.label,
        });
        if (!mint.ok) return jsonError(mint.message, mint.status);
        return jsonData(
            {
                id: mint.data.public_link_id,
                plaintext_token: mint.data.plaintext_token,
                embed_path: mint.data.embed_path,
                embed_url: mint.data.embed_url,
                metadata: mint.data.metadata,
                is_active: true,
            },
            { status: 201 }
        );
    }

    if ("prefill_field_map" in body) {
        const parsed = parsePrefillFieldMapBody(body.prefill_field_map);
        if (!parsed.ok) return jsonError(parsed.message, 400);
        if (parsed.map) metadata.prefill_field_map = parsed.map;
    }

    const label =
        typeof body.label === "string"
            ? body.label.trim()
            : typeof body.name === "string"
              ? body.name.trim()
              : "";
    if (label) metadata.label = label;

    const is_active = typeof body.is_active === "boolean" ? body.is_active : true;

    const maxAttempts = 5;
    let lastErr: { message?: string; code?: string } | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const plaintextToken = generateSecureFormLinkPlaintext();
        const token_hash = hashFormLinkToken(plaintextToken);
        const token_prefix = plaintextToken.length > 12 ? plaintextToken.slice(0, 12) : plaintextToken;

        const { data: row, error } = await dbInsertFormPublicLink(supabase, {
            org_id: ctx.orgId,
            form_definition_id: formId,
            token_hash,
            token_prefix,
            pinned_form_definition_version_id: pinnedId === undefined ? null : pinnedId,
            is_active,
            expires_at,
            allowed_embed_origins,
            metadata,
        });

        if (!error && row) {
            const embed_path = buildPublicFormEmbedPath(plaintextToken);
            const base = deriveEmbedBaseUrl(request);
            return jsonData(
                {
                    ...(row as Record<string, unknown>),
                    plaintext_token: plaintextToken,
                    embed_path,
                    embed_url: base ? `${base}${embed_path}` : null,
                },
                { status: 201 }
            );
        }

        lastErr = error ?? { message: "unknown" };
        if (lastErr.code === "23505") continue;
        break;
    }

    if (lastErr?.code === "23505") {
        return jsonError("Could not allocate a unique link token; retry", 503);
    }
    return NextResponse.json({ error: lastErr?.message ?? "Insert failed" }, { status: 400 });
}
