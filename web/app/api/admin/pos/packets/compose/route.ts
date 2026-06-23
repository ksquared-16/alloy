import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import {
    dbGetFormDefinition,
    dbListVersionsForForm,
    dbPublishVersion,
    dbListPacketDefinitionKeys,
} from "@/lib/admin/forms/formsAdminDb";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";
import { mintPacketPublicLinkForAdmin } from "@/lib/forms/packets/mintPacketPublicLinkForAdmin";
import { buildPacketComposerItems, buildPacketLaunchPlan, type ComposerAnchor } from "@/lib/pos/packet/packetComposerPlan";
import { resolveAnchorContext } from "@/lib/pos/packet/posPacketRoster";
import { isLaunchEntityType } from "@/lib/pos/packet/launchFromEntity";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deriveEmbedBaseUrl(request: NextRequest): string | null {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host?.trim()) return null;
    const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
    return `${proto}://${host.trim()}`;
}

/** Ensure a form has a published version; publish its latest draft if none. */
async function ensurePublished(
    supabase: SupabaseClient,
    orgId: string,
    formId: string,
    userId: string
): Promise<{ ok: true; name: string | null } | { ok: false; message: string }> {
    const form = await dbGetFormDefinition(supabase, orgId, formId);
    if (form.error) return { ok: false, message: form.error.message };
    if (!form.data) return { ok: false, message: `Form template ${formId} not found` };
    const name = (form.data as { name?: string | null }).name ?? null;

    const versions = await dbListVersionsForForm(supabase, orgId, formId);
    if (versions.error) return { ok: false, message: versions.error.message };
    const rows = (versions.data ?? []) as Array<{ id: string; version_number: number; status: string }>;
    if (rows.some((v) => v.status === "published")) return { ok: true, name };

    const drafts = rows.filter((v) => v.status === "draft").sort((a, b) => b.version_number - a.version_number);
    if (drafts.length === 0) return { ok: false, message: `"${name ?? formId}" has no draft or published version to publish` };
    const pub = await dbPublishVersion(supabase, orgId, drafts[0].id, userId);
    if (pub.error || !pub.data) return { ok: false, message: pub.error?.message ?? "Publish failed" };
    return { ok: true, name };
}

interface ShareResult {
    pair_key: string;
    customer_member_id: string | null;
    recipient_person_id: string | null;
    url: string | null;
    token_prefix: string | null;
    error?: string;
}

/**
 * POST /api/admin/pos/packets/compose — Packet Composer.
 *
 * Create ONE packet definition with N ordered forms, then mint ONE unique share link per
 * child-recipient pair (never a generic link for multiple people). Reuses the existing
 * forms-packet runtime and mint path. No new tables; no PDF/email/review.
 *
 * Body: { name?, form_definition_ids: string[], anchor?: { entity_type, entity_id },
 *         child_ids?: string[], recipient_ids?: string[] }
 */
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

    const formIds = Array.isArray(body.form_definition_ids) ? body.form_definition_ids.filter((x): x is string => typeof x === "string") : [];
    const itemsPlan = buildPacketComposerItems(formIds);
    if (!itemsPlan.ok) return jsonError(itemsPlan.error ?? "Select at least one form template.", 400);
    for (const it of itemsPlan.items) {
        if (!UUID_RE.test(it.form_definition_id)) return jsonError(`Invalid form_definition_id: ${it.form_definition_id}`, 400);
    }

    const childIds = Array.isArray(body.child_ids) ? body.child_ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
    const recipientIds = Array.isArray(body.recipient_ids) ? body.recipient_ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];

    const supabase = createAdminClient();

    // Resolve anchor context (household + opportunity) when provided.
    let anchor: ComposerAnchor;
    const anchorRaw = body.anchor;
    if (anchorRaw && typeof anchorRaw === "object" && !Array.isArray(anchorRaw)) {
        const a = anchorRaw as Record<string, unknown>;
        const t = typeof a.entity_type === "string" ? a.entity_type : "";
        const id = typeof a.entity_id === "string" ? a.entity_id : "";
        if (!isLaunchEntityType(t) || !UUID_RE.test(id)) return jsonError("anchor.entity_type/entity_id invalid", 400);
        const resolved = await resolveAnchorContext(supabase, ctx.orgId, t, id);
        anchor = { entity_type: t, entity_id: id, opportunity_id: resolved.opportunity_id, customer_id: resolved.customer_id };
    } else {
        if (childIds.length > 0 || recipientIds.length > 0) return jsonError("anchor is required when selecting children/recipients", 400);
        anchor = { entity_type: "customer", entity_id: "", opportunity_id: null, customer_id: null };
    }

    // 1) Ensure every selected form is publishable.
    let firstFormName: string | null = null;
    for (let i = 0; i < itemsPlan.items.length; i++) {
        const pub = await ensurePublished(supabase, ctx.orgId, itemsPlan.items[i].form_definition_id, ctx.userId);
        if (!pub.ok) return jsonError(pub.message, 422);
        if (i === 0) firstFormName = pub.name;
    }

    // 2) Create the packet definition.
    const baseName = typeof body.name === "string" && body.name.trim() ? body.name.trim() : `${firstFormName ?? "Parent"} Packet`;
    const description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
    let packetDefinitionId: string;
    try {
        const taken = await dbListPacketDefinitionKeys(supabase, ctx.orgId);
        const key = allocateUniqueKey(slugKeyFromDisplayName(baseName), taken);
        const { data, error } = await supabase
            .from("form_packet_definitions")
            .insert({
                org_id: ctx.orgId,
                key,
                name: baseName,
                description,
                is_active: true,
                metadata: { created_via: "pos_packet_compose", form_count: itemsPlan.items.length },
            })
            .select("id")
            .single();
        if (error) throw new Error(error.message);
        packetDefinitionId = (data as { id: string }).id;
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to create packet definition" }, { status: 400 });
    }

    // 3) Insert ordered items.
    try {
        const rows = itemsPlan.items.map((it) => ({
            org_id: ctx.orgId,
            packet_definition_id: packetDefinitionId,
            sequence_index: it.sequence_index,
            form_definition_id: it.form_definition_id,
            pinned_form_definition_version_id: null,
            metadata: it.step_label ? { step_label: it.step_label } : {},
        }));
        const { error } = await supabase.from("form_packet_items").insert(rows);
        if (error) throw new Error(error.message);
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to add packet steps" }, { status: 400 });
    }

    // 4) Fan out one unique link per child-recipient pair.
    const plan = buildPacketLaunchPlan(anchor, childIds, recipientIds);
    const embedBaseUrl = deriveEmbedBaseUrl(request);
    const shares: ShareResult[] = [];

    for (const spec of plan.specs) {
        const mintBody: Record<string, unknown> = {
            packet_definition_id: packetDefinitionId,
            launch_from_entity: spec.launch_from_entity,
            label: baseName,
            metadata: {
                created_via: "pos_packet_compose",
                composer_child_id: spec.customer_member_id,
                composer_recipient_id: spec.recipient_person_id,
            },
        };
        if (spec.enrollment_selection) mintBody.enrollment_selection = spec.enrollment_selection;

        const res = await mintPacketPublicLinkForAdmin({ supabase, orgId: ctx.orgId, embedBaseUrl, body: mintBody });
        if (res.ok) {
            const url = (res.data.embed_url as string | null) ?? (res.data.embed_path as string);
            shares.push({
                pair_key: spec.pair_key,
                customer_member_id: spec.customer_member_id,
                recipient_person_id: spec.recipient_person_id,
                url,
                token_prefix: typeof res.data.token_prefix === "string" ? res.data.token_prefix : null,
            });
        } else {
            shares.push({ pair_key: spec.pair_key, customer_member_id: spec.customer_member_id, recipient_person_id: spec.recipient_person_id, url: null, token_prefix: null, error: res.message });
        }
    }

    return jsonData(
        {
            packet_definition_id: packetDefinitionId,
            name: baseName,
            form_count: itemsPlan.items.length,
            warnings: plan.warnings,
            shares,
        },
        { status: 201 }
    );
}
