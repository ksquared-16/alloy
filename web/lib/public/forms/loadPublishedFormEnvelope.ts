import type { SupabaseClient } from "@supabase/supabase-js";

export type PublishedFormEnvelope = {
    formDefinitionId: string;
    formDefinitionVersionId: string;
    schemaJson: unknown;
    pdfMappingJson: unknown | null;
    formKey: string;
    formName: string;
    formKind: string;
    /** Authored brand tokens, carried so the public surface has ONE theme source. */
    formMetadata: unknown;
};

/** Resolve published schema/version for a form definition (optionally pinned). */
export async function loadPublishedFormEnvelope(
    supabase: SupabaseClient,
    orgId: string,
    formDefinitionId: string,
    pinnedFormDefinitionVersionId: string | null
): Promise<PublishedFormEnvelope | null> {
    const { data: formDef, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, key, name, kind, metadata")
        .eq("id", formDefinitionId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (formErr || !formDef) return null;

    const fd = formDef as { id: string; key: string; name: string; kind: string; metadata?: unknown };

    let versionId: string | null = null;
    let schemaJson: unknown = null;
    let pdfMappingJson: unknown | null = null;

    if (pinnedFormDefinitionVersionId) {
        const { data: ver } = await supabase
            .from("form_definition_versions")
            .select("id, status, schema_json, pdf_mapping_json")
            .eq("id", pinnedFormDefinitionVersionId)
            .eq("form_definition_id", fd.id)
            .eq("org_id", orgId)
            .maybeSingle();
        const v = ver as { id: string; status: string; schema_json: unknown; pdf_mapping_json: unknown | null } | null;
        if (v && v.status === "published") {
            versionId = v.id;
            schemaJson = v.schema_json;
            pdfMappingJson = v.pdf_mapping_json ?? null;
        }
    }

    if (!versionId) {
        const { data: latest } = await supabase
            .from("form_definition_versions")
            .select("id, schema_json, pdf_mapping_json")
            .eq("form_definition_id", fd.id)
            .eq("org_id", orgId)
            .eq("status", "published")
            .order("version_number", { ascending: false })
            .limit(1)
            .maybeSingle();
        const lv = latest as { id: string; schema_json: unknown; pdf_mapping_json: unknown | null } | null;
        if (lv) {
            versionId = lv.id;
            schemaJson = lv.schema_json;
            pdfMappingJson = lv.pdf_mapping_json ?? null;
        }
    }

    if (!versionId || schemaJson == null) return null;

    return {
        formDefinitionId: fd.id,
        formDefinitionVersionId: versionId,
        schemaJson,
        pdfMappingJson,
        formKey: fd.key,
        formName: fd.name,
        formKind: fd.kind,
        formMetadata: fd.metadata ?? null,
    };
}
