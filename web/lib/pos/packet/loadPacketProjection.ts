/**
 * Phase 7 — DB adapter that assembles a packet's responsibility projection from real rows and hands
 * it to the pure projection seam (packetResponsibilityProjection.ts). Used by the operator preview /
 * read model and the participant runtime endpoint. No resolver logic lives here — only loading.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LaunchEntityType } from "./launchFromEntity";
import { loadPacketRoster } from "./posPacketRoster";
import { parseRequirementResponsibilityRules } from "./requirementResponsibility";
import { projectPacketResponsibilities, type PacketFormInput, type PacketProjection } from "./packetResponsibilityProjection";
import type { EnumerableFormSchema } from "./requirementResponsibility";

/** Defensively coerce a stored schema_json into the structural subset enumeration needs. */
export function coerceSchema(schemaJson: unknown): EnumerableFormSchema | null {
    if (!schemaJson || typeof schemaJson !== "object") return null;
    const s = schemaJson as Record<string, unknown>;
    const sections = Array.isArray(s.sections) ? s.sections : [];
    const fields = Array.isArray(s.fields) ? s.fields : [];
    return {
        title: typeof s.title === "string" ? s.title : undefined,
        sections: sections
            .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
            .map((x) => ({
                id: typeof x.id === "string" ? x.id : "",
                title: typeof x.title === "string" ? x.title : undefined,
                field_ids: Array.isArray(x.field_ids) ? x.field_ids.filter((f): f is string => typeof f === "string") : [],
            }))
            .filter((x) => x.id),
        fields: fields
            .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
            .map((x) => ({
                id: typeof x.id === "string" ? x.id : "",
                label: typeof x.label === "string" ? x.label : "",
                required: x.required === true,
                type: typeof x.type === "string" ? x.type : "text",
                signature: x.signature && typeof x.signature === "object" ? (x.signature as { mode?: string }) : undefined,
            }))
            .filter((x) => x.id),
    };
}

export interface LoadPacketProjectionResult {
    ok: boolean;
    error?: string;
    packet_name?: string;
    /** form ids that have no published version (excluded from projection). */
    missing_published_forms?: string[];
    projection?: PacketProjection;
}

/**
 * Load a packet's rules (from metadata) + composed forms' published schemas + roster (from an anchor),
 * and return the projected responsibility model. When no anchor is given, projects against an empty
 * roster (structure-only preview).
 */
export async function loadPacketProjection(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        packetDefinitionId: string;
        anchor?: { entity_type: LaunchEntityType; entity_id: string } | null;
        financialGuardianPersonId?: string | null;
        primaryGuardianPersonId?: string | null;
    }
): Promise<LoadPacketProjectionResult> {
    const { orgId, packetDefinitionId } = args;

    const { data: def, error: defErr } = await supabase
        .from("form_packet_definitions")
        .select("id, name, metadata")
        .eq("org_id", orgId)
        .eq("id", packetDefinitionId)
        .maybeSingle();
    if (defErr) return { ok: false, error: defErr.message };
    if (!def) return { ok: false, error: "Packet not found" };
    const metadata = (def as { metadata?: Record<string, unknown> }).metadata ?? {};
    const rules = parseRequirementResponsibilityRules(metadata);

    const { data: itemRows, error: itemsErr } = await supabase
        .from("form_packet_items")
        .select("form_definition_id, sequence_index")
        .eq("org_id", orgId)
        .eq("packet_definition_id", packetDefinitionId)
        .order("sequence_index", { ascending: true });
    if (itemsErr) return { ok: false, error: itemsErr.message };
    const formIds = ((itemRows ?? []) as Array<{ form_definition_id: string }>).map((r) => r.form_definition_id);

    // Highest published version per form → its schema_json.
    const forms: PacketFormInput[] = [];
    const missing: string[] = [];
    if (formIds.length > 0) {
        const { data: verRows, error: verErr } = await supabase
            .from("form_definition_versions")
            .select("form_definition_id, version_number, status, schema_json")
            .eq("org_id", orgId)
            .in("form_definition_id", formIds)
            .eq("status", "published")
            .order("version_number", { ascending: false });
        if (verErr) return { ok: false, error: verErr.message };
        const bestByForm = new Map<string, unknown>();
        for (const row of (verRows ?? []) as Array<{ form_definition_id: string; schema_json: unknown }>) {
            if (!bestByForm.has(row.form_definition_id)) bestByForm.set(row.form_definition_id, row.schema_json);
        }
        for (const fid of formIds) {
            const schemaJson = bestByForm.get(fid);
            const schema = coerceSchema(schemaJson);
            if (!schema) {
                missing.push(fid);
                continue;
            }
            forms.push({ form_definition_id: fid, schema });
        }
    }

    const loaded = args.anchor ? await loadPacketRoster(supabase, orgId, args.anchor.entity_type, args.anchor.entity_id) : null;
    const resolvedRoster = {
        children: loaded?.children ?? [],
        recipients: loaded?.recipients ?? [],
        financial_guardian_person_id: args.financialGuardianPersonId ?? null,
        primary_guardian_person_id: args.primaryGuardianPersonId ?? null,
    };

    const projection = projectPacketResponsibilities({ forms, rules, roster: resolvedRoster });
    return {
        ok: true,
        packet_name: (def as { name?: string }).name,
        missing_published_forms: missing,
        projection,
    };
}
