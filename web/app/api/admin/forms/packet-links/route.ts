import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { dbInsertFormPublicLink } from "@/lib/admin/forms/formsAdminDb";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { generateSecureFormLinkPlaintext, buildPublicFormEmbedPath } from "@/lib/admin/forms/formPublicLinkToken";
import { mergePublicLinkMetadataForCreate } from "@/lib/forms/intake/defaultPublicLinkMetadata";
import { assertEntityInOrg } from "@/lib/admin/assertEntityInOrg";
import { parsePrefillFieldMapBody } from "@/lib/forms/prefill/prefillFieldMap";

function deriveEmbedBaseUrl(request: NextRequest): string | null {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host?.trim()) return null;
    const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
    return `${proto}://${host.trim()}`;
}

/** POST /api/admin/forms/packet-links — mint a single-recipient packet public link (first step anchors form_public_links row). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const packetDefinitionIdRaw = body.packet_definition_id;
    if (typeof packetDefinitionIdRaw !== "string") {
        return jsonError("packet_definition_id is required", 400);
    }
    const packetDefinitionId = parseUuidParam(packetDefinitionIdRaw, "packet_definition_id");
    if (packetDefinitionId instanceof NextResponse) return packetDefinitionId;

    const supabase = createAdminClient();

    const { data: pktDef, error: pktErr } = await supabase
        .from("form_packet_definitions")
        .select("id")
        .eq("id", packetDefinitionId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (pktErr) return NextResponse.json({ error: pktErr.message }, { status: 500 });
    if (!pktDef) return jsonError("packet_definition_id not found in this organization", 404);

    const { data: steps, error: stErr } = await supabase
        .from("form_packet_items")
        .select("form_definition_id, pinned_form_definition_version_id, sequence_index")
        .eq("packet_definition_id", packetDefinitionId)
        .eq("org_id", ctx.orgId)
        .order("sequence_index", { ascending: true });
    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });
    if (!steps?.length) return jsonError("Packet definition has no steps", 400);

    const first = steps[0] as {
        form_definition_id: string;
        pinned_form_definition_version_id: string | null;
        sequence_index: number;
    };

    const { data: formRow, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, key")
        .eq("id", first.form_definition_id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (formErr) return NextResponse.json({ error: formErr.message }, { status: 500 });
    if (!formRow) return jsonError("First packet step form not found", 404);

    const formKey = (formRow as { key: string }).key;

    let pinnedId: string | null | undefined = undefined;
    if (first.pinned_form_definition_version_id) {
        pinnedId = first.pinned_form_definition_version_id;
    }
    if ("pinned_form_definition_version_id" in body) {
        const v = body.pinned_form_definition_version_id;
        if (v === null || v === undefined || v === "") {
            pinnedId = null;
        } else if (typeof v === "string") {
            const p = parseUuidParam(v, "pinned_form_definition_version_id");
            if (p instanceof NextResponse) return p;
            pinnedId = p;
        }
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

    const metadata = await mergePublicLinkMetadataForCreate(supabase, formKey, clientMetadata);
    metadata.form_context_mode = "packet";
    metadata.packet_definition_id = packetDefinitionId;

    const launchRaw = body.launch_from_entity;
    if (launchRaw !== undefined && launchRaw !== null) {
        if (typeof launchRaw !== "object" || Array.isArray(launchRaw)) {
            return jsonError("launch_from_entity must be an object", 400);
        }
        const lf = launchRaw as Record<string, unknown>;
        const entityType = typeof lf.entity_type === "string" ? lf.entity_type.trim() : "";
        const entityIdRaw = typeof lf.entity_id === "string" ? lf.entity_id.trim() : "";
        const allowed = new Set(["person", "customer", "customer_member", "opportunity"]);
        if (!allowed.has(entityType)) {
            return jsonError("launch_from_entity.entity_type must be person, customer, customer_member, or opportunity", 400);
        }
        const entityId = parseUuidParam(entityIdRaw, "launch_from_entity.entity_id");
        if (entityId instanceof NextResponse) return entityId;

        const ok = await assertEntityInOrg(supabase, ctx.orgId, entityType, entityId);
        if (!ok) {
            return jsonError("launch_from_entity record not found in this organization", 400);
        }

        metadata.source_entity_type = entityType;
        metadata.source_entity_id = entityId;
        metadata.prefill_enabled = lf.prefill_enabled !== false;
        metadata.lead_capture = false;
        metadata.intake = false;
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
            form_definition_id: first.form_definition_id,
            token_hash,
            token_prefix,
            pinned_form_definition_version_id: pinnedId === undefined ? first.pinned_form_definition_version_id : pinnedId,
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
                    packet_definition_id: packetDefinitionId,
                    first_step_sequence_index: first.sequence_index,
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
