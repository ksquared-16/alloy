/**
 * Shared admin mint path for packet public links (used by packet-links POST and opportunity enrollment launch).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { dbInsertFormPublicLink } from "@/lib/admin/forms/formsAdminDb";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { generateSecureFormLinkPlaintext, buildPublicFormEmbedPath } from "@/lib/admin/forms/formPublicLinkToken";
import { mergePublicLinkMetadataForCreate } from "@/lib/forms/intake/defaultPublicLinkMetadata";
import { assertEntityInOrg } from "@/lib/admin/assertEntityInOrg";
import { defaultOpportunityLaunchPrefillFieldMap } from "@/lib/forms/prefill/defaultOpportunityLaunchPrefillFieldMap";
import { parsePrefillFieldMapBody } from "@/lib/forms/prefill/prefillFieldMap";
import { resolveOpportunityEnrollmentSelection } from "@/lib/forms/packets/opportunityPacketLaunchValidation";
import { emitOpportunityEnrollmentPacketCreatedSafe } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";

export async function assertPacketStepsPublishableCore(
    supabase: SupabaseClient,
    orgId: string,
    steps: { form_definition_id: string; pinned_form_definition_version_id: string | null; sequence_index: number }[]
): Promise<{ ok: false; message: string } | { ok: true }> {
    const formIds = [...new Set(steps.map((s) => s.form_definition_id))];
    const { data: verRows, error } = await supabase
        .from("form_definition_versions")
        .select("id, form_definition_id, status")
        .eq("org_id", orgId)
        .in("form_definition_id", formIds);
    if (error) return { ok: false, message: error.message };
    const rows = (verRows ?? []) as { id: string; form_definition_id: string; status: string }[];
    for (const step of steps) {
        const pin = step.pinned_form_definition_version_id;
        if (pin) {
            const v = rows.find((r) => r.id === pin);
            if (!v || v.status !== "published") {
                return {
                    ok: false,
                    message: `Packet step ${step.sequence_index + 1} pinned form version is missing or not published`,
                };
            }
        } else {
            const hasPub = rows.some((r) => r.form_definition_id === step.form_definition_id && r.status === "published");
            if (!hasPub) {
                return {
                    ok: false,
                    message: `Packet step ${step.sequence_index + 1} has no published form version — publish each step's form or pin a published version`,
                };
            }
        }
    }
    return { ok: true };
}

export type MintPacketPublicLinkResult =
    | {
          ok: true;
          data: Record<string, unknown> & {
              plaintext_token: string;
              embed_path: string;
              embed_url: string | null;
              packet_definition_id: string;
              first_step_sequence_index: number;
          };
      }
    | { ok: false; status: number; message: string };

export async function mintPacketPublicLinkForAdmin(params: {
    supabase: SupabaseClient;
    orgId: string;
    embedBaseUrl: string | null;
    body: Record<string, unknown>;
}): Promise<MintPacketPublicLinkResult> {
    const { supabase, orgId, embedBaseUrl, body } = params;

    const packetDefinitionIdRaw = body.packet_definition_id;
    if (typeof packetDefinitionIdRaw !== "string") {
        return { ok: false, status: 400, message: "packet_definition_id is required" };
    }
    const packetDefinitionId = parseUuidParam(packetDefinitionIdRaw, "packet_definition_id");
    if (packetDefinitionId instanceof NextResponse) {
        return { ok: false, status: 400, message: "Invalid packet_definition_id" };
    }

    const { data: pktDef, error: pktErr } = await supabase
        .from("form_packet_definitions")
        .select("id")
        .eq("id", packetDefinitionId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (pktErr) return { ok: false, status: 500, message: pktErr.message };
    if (!pktDef) return { ok: false, status: 404, message: "packet_definition_id not found in this organization" };

    const { data: steps, error: stErr } = await supabase
        .from("form_packet_items")
        .select("form_definition_id, pinned_form_definition_version_id, sequence_index")
        .eq("packet_definition_id", packetDefinitionId)
        .eq("org_id", orgId)
        .order("sequence_index", { ascending: true });
    if (stErr) return { ok: false, status: 500, message: stErr.message };
    if (!steps?.length) return { ok: false, status: 400, message: "Packet definition has no steps" };

    const stepErr = await assertPacketStepsPublishableCore(supabase, orgId, steps as never);
    if (!stepErr.ok) return { ok: false, status: 400, message: stepErr.message };

    const first = steps[0] as {
        form_definition_id: string;
        pinned_form_definition_version_id: string | null;
        sequence_index: number;
    };

    const { data: formRow, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, key")
        .eq("id", first.form_definition_id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (formErr) return { ok: false, status: 500, message: formErr.message };
    if (!formRow) return { ok: false, status: 404, message: "First packet step form not found" };

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
            if (p instanceof NextResponse) return { ok: false, status: 400, message: "Invalid pinned_form_definition_version_id" };
            pinnedId = p;
        }
    }

    let expires_at: string | null | undefined = undefined;
    if ("expires_at" in body) {
        const raw = body.expires_at;
        if (raw === null) expires_at = null;
        else if (typeof raw === "string" && raw.trim()) {
            const t = Date.parse(raw);
            if (Number.isNaN(t)) return { ok: false, status: 400, message: "expires_at must be a valid ISO 8601 datetime" };
            expires_at = new Date(t).toISOString();
        } else {
            return { ok: false, status: 400, message: "expires_at must be null or an ISO 8601 datetime string" };
        }
    }

    let allowed_embed_origins: string[] | null | undefined = undefined;
    if ("allowed_embed_origins" in body) {
        const raw = body.allowed_embed_origins;
        if (raw === null) allowed_embed_origins = null;
        else if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
            allowed_embed_origins = raw.map((s: string) => s.trim()).filter(Boolean);
        } else {
            return { ok: false, status: 400, message: "allowed_embed_origins must be null or an array of strings" };
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
    if (metadata.packet_step_version_policy === undefined) {
        metadata.packet_step_version_policy = "follow_latest";
    }

    const launchRaw = body.launch_from_entity;
    if (launchRaw !== undefined && launchRaw !== null) {
        if (typeof launchRaw !== "object" || Array.isArray(launchRaw)) {
            return { ok: false, status: 400, message: "launch_from_entity must be an object" };
        }
        const lf = launchRaw as Record<string, unknown>;
        const entityType = typeof lf.entity_type === "string" ? lf.entity_type.trim() : "";
        const entityIdRaw = typeof lf.entity_id === "string" ? lf.entity_id.trim() : "";
        const allowed = new Set(["person", "customer", "customer_member", "opportunity"]);
        if (!allowed.has(entityType)) {
            return {
                ok: false,
                status: 400,
                message: "launch_from_entity.entity_type must be person, customer, customer_member, or opportunity",
            };
        }
        const entityId = parseUuidParam(entityIdRaw, "launch_from_entity.entity_id");
        if (entityId instanceof NextResponse) return { ok: false, status: 400, message: "Invalid launch_from_entity.entity_id" };

        const ok = await assertEntityInOrg(supabase, orgId, entityType, entityId);
        if (!ok) {
            return { ok: false, status: 400, message: "launch_from_entity record not found in this organization" };
        }

        metadata.source_entity_type = entityType;
        metadata.source_entity_id = entityId;
        metadata.prefill_enabled = lf.prefill_enabled !== false;
        metadata.lead_capture = false;
        metadata.intake = false;
        if (entityType === "opportunity") {
            metadata.launch_surface = "crm_opportunity";
        }
    }

    let enrollmentResolved: {
        selected_customer_member_id: string | null;
        recipient_person_id: string | null;
        delivery_intent: "copy_link" | "email_later";
    } | null = null;

    if (metadata.source_entity_type === "opportunity" && typeof metadata.source_entity_id === "string") {
        const selRaw = body.enrollment_selection;
        const sel =
            selRaw && typeof selRaw === "object" && !Array.isArray(selRaw) ? (selRaw as Record<string, unknown>) : {};
        const optionalUuidField = (v: unknown): string | null | undefined => {
            if (v === "" || v === undefined || v === null) return null;
            return typeof v === "string" ? v : undefined;
        };
        const resolved = await resolveOpportunityEnrollmentSelection(supabase, orgId, metadata.source_entity_id, {
            customer_member_id: optionalUuidField(sel.customer_member_id),
            recipient_person_id: optionalUuidField(sel.recipient_person_id),
            delivery_intent: typeof sel.delivery_intent === "string" ? sel.delivery_intent : null,
        });
        if (!resolved.ok) return { ok: false, status: 400, message: resolved.message };
        enrollmentResolved = resolved.value;
        if (resolved.value.selected_customer_member_id) {
            metadata.selected_customer_member_id = resolved.value.selected_customer_member_id;
        }
        if (resolved.value.recipient_person_id) {
            metadata.recipient_person_id = resolved.value.recipient_person_id;
        }
        metadata.delivery_intent = resolved.value.delivery_intent;
    }

    const prefillParsed = parsePrefillFieldMapBody(
        "prefill_field_map" in body ? body.prefill_field_map : undefined
    );
    if (!prefillParsed.ok) return { ok: false, status: 400, message: prefillParsed.message };
    const oppDefaults =
        metadata.source_entity_type === "opportunity" ? defaultOpportunityLaunchPrefillFieldMap() : {};
    const childPrefill =
        enrollmentResolved?.selected_customer_member_id ?
            {
                child_first_name: "customer_member.first_name",
                child_last_name: "customer_member.last_name",
                child_date_of_birth: "customer_member.dob",
            }
        :   {};
    const mergedPrefill = { ...oppDefaults, ...childPrefill, ...(prefillParsed.map ?? {}) };
    if (Object.keys(mergedPrefill).length > 0) {
        metadata.prefill_field_map = mergedPrefill;
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
            org_id: orgId,
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
            const linkRow = row as { id: string };
            if (metadata.source_entity_type === "opportunity" && typeof metadata.source_entity_id === "string") {
                const pe = await emitOpportunityEnrollmentPacketCreatedSafe({
                    orgId: orgId,
                    opportunityId: metadata.source_entity_id,
                    publicLinkId: linkRow.id,
                    packetDefinitionId,
                    linkMetadata: metadata as Record<string, unknown>,
                });
                if (pe.error) {
                    console.error("[mintPacket] opportunity_enrollment_packet_created projection failed:", pe.error.message);
                }
            }
            const embed_path = buildPublicFormEmbedPath(plaintextToken);
            return {
                ok: true,
                data: {
                    ...(row as Record<string, unknown>),
                    plaintext_token: plaintextToken,
                    embed_path,
                    embed_url: embedBaseUrl ? `${embedBaseUrl}${embed_path}` : null,
                    packet_definition_id: packetDefinitionId,
                    first_step_sequence_index: first.sequence_index,
                },
            };
        }

        lastErr = error ?? { message: "unknown" };
        if (lastErr.code === "23505") continue;
        break;
    }

    if (lastErr?.code === "23505") {
        return { ok: false, status: 503, message: "Could not allocate a unique link token; retry" };
    }
    return { ok: false, status: 400, message: lastErr?.message ?? "Insert failed" };
}
