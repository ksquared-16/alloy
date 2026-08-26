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
import { buildPacketComposerItems, type ComposerAnchor } from "@/lib/pos/packet/packetComposerPlan";
import { buildFamilyPacketInstancePlan } from "@/lib/pos/packet/familyPacketPlan";
import { resolveAnchorContext } from "@/lib/pos/packet/posPacketRoster";
import { parseRequirementResponsibilityRules, REQUIREMENT_RESPONSIBILITIES_KEY } from "@/lib/pos/packet/requirementResponsibility";
import { isLaunchEntityType, type LaunchEntityType } from "@/lib/pos/packet/launchFromEntity";
import { randomUUID } from "crypto";
import { resolvePublicAppOrigin } from "@/lib/publicAppUrl";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The origin these packet links are built on.
 *
 * Read from the ONE canonical public-origin authority, never from the request: these links
 * are delivered to recipients, so a caller-supplied `Host` / `X-Forwarded-Host` header must
 * not be able to decide where they point.
 */
function deriveEmbedBaseUrl(): string | null {
    const decision = resolvePublicAppOrigin();
    return decision.ok ? decision.origin : null;
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

    // Requirement-responsibility rules (operator-configured), validated + kept only for the selected
    // forms. Stored on the packet definition metadata; the projection seam reads them back.
    const selectedFormIdSet = new Set(itemsPlan.items.map((i) => i.form_definition_id));
    const responsibilityRules = parseRequirementResponsibilityRules({
        [REQUIREMENT_RESPONSIBILITIES_KEY]: Array.isArray(body.requirement_responsibilities) ? body.requirement_responsibilities : [],
    }).filter((r) => selectedFormIdSet.has(r.ref.form_definition_id));

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
                // pos_connected marks this packet so completing it opens a Processing Case (the
                // packet→Processing on-ramp gates on isPosConnectedSurface). Composer packets must
                // reach Processing; without this marker the journey dead-ends at completion.
                metadata: {
                    created_via: "pos_packet_compose",
                    form_count: itemsPlan.items.length,
                    pos_connected: true,
                    [REQUIREMENT_RESPONSIBILITIES_KEY]: responsibilityRules,
                },
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

    // 4) Family Packet: ONE instance, one link per recipient — all sharing the same session.
    const packetInstanceId = randomUUID();
    const fam = buildFamilyPacketInstancePlan({
        anchor,
        children: childIds.map((id) => ({ customer_member_id: id })),
        recipients: recipientIds.map((id) => ({ person_id: id })),
        form_ids: itemsPlan.items.map((i) => i.form_definition_id),
        instance_key: packetInstanceId,
    });

    // Household-level launch anchor (child prefill happens per child in the parent shell; a
    // single selected child still prefills at link level to preserve prior behavior).
    const singleChild = childIds.length === 1 ? childIds[0] : null;
    const householdLaunch = (): { entity_type: LaunchEntityType; entity_id: string; prefill_enabled: true } => {
        if (anchor.entity_type === "opportunity") return { entity_type: "opportunity", entity_id: anchor.entity_id, prefill_enabled: true };
        if (anchor.opportunity_id) return { entity_type: "opportunity", entity_id: anchor.opportunity_id, prefill_enabled: true };
        if (singleChild) return { entity_type: "customer_member", entity_id: singleChild, prefill_enabled: true };
        if (anchor.entity_type === "customer") return { entity_type: "customer", entity_id: anchor.entity_id, prefill_enabled: true };
        if (anchor.customer_id) return { entity_type: "customer", entity_id: anchor.customer_id, prefill_enabled: true };
        return { entity_type: anchor.entity_type, entity_id: anchor.entity_id, prefill_enabled: true };
    };

    // One mint per recipient; when no recipients selected, a single anchor-only link.
    const accesses = fam.recipient_access.length > 0
        ? fam.recipient_access.map((a) => ({ recipient_person_id: a.recipient_person_id as string | null }))
        : [{ recipient_person_id: null }];

    const embedBaseUrl = deriveEmbedBaseUrl();
    const shares: ShareResult[] = [];

    for (const access of accesses) {
        const enrollment: { customer_member_id?: string; recipient_person_id?: string } = {};
        if (singleChild) enrollment.customer_member_id = singleChild;
        if (access.recipient_person_id) enrollment.recipient_person_id = access.recipient_person_id;

        const mintBody: Record<string, unknown> = {
            packet_definition_id: packetDefinitionId,
            launch_from_entity: householdLaunch(),
            label: baseName,
            metadata: {
                created_via: "pos_packet_compose",
                packet_instance_id: packetInstanceId,
                recipient_person_id: access.recipient_person_id,
                selected_customer_member_ids: childIds,
                // read-model display: single child shown directly; multi-child shown at instance level
                composer_child_id: singleChild,
                composer_recipient_id: access.recipient_person_id,
            },
            ...(Object.keys(enrollment).length > 0 ? { enrollment_selection: enrollment } : {}),
        };

        const pair_key = `${packetInstanceId}::${access.recipient_person_id ?? "-"}`;
        const res = await mintPacketPublicLinkForAdmin({ supabase, orgId: ctx.orgId, embedBaseUrl, body: mintBody });
        if (res.ok) {
            const url = (res.data.embed_url as string | null) ?? (res.data.embed_path as string);
            shares.push({ pair_key, customer_member_id: singleChild, recipient_person_id: access.recipient_person_id, url, token_prefix: typeof res.data.token_prefix === "string" ? res.data.token_prefix : null });
        } else {
            shares.push({ pair_key, customer_member_id: singleChild, recipient_person_id: access.recipient_person_id, url: null, token_prefix: null, error: res.message });
        }
    }

    return jsonData(
        {
            packet_definition_id: packetDefinitionId,
            name: baseName,
            packet_instance_id: packetInstanceId,
            form_count: itemsPlan.items.length,
            children: childIds,
            warnings: fam.warnings,
            shares,
        },
        { status: 201 }
    );
}
