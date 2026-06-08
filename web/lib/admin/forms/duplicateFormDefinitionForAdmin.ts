import type { SupabaseClient } from "@supabase/supabase-js";
import {
    dbInsertFormDefinition,
    dbInsertVersion,
    dbListFormDefinitionKeys,
    dbMaxVersionNumber,
} from "@/lib/admin/forms/formsAdminDb";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";

export type DuplicateFormDefinitionResult =
    | {
          ok: true;
          form: {
              id: string;
              key: string;
              name: string;
              draft_version_id: string;
          };
      }
    | { ok: false; status: 404 | 409; message: string };

type VersionRow = {
    id: string;
    version_number: number;
    status: string;
    schema_json: unknown;
    pdf_mapping_json: unknown | null;
    metadata: Record<string, unknown>;
};

function cleanMetadataForDuplicate(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const meta = { ...(raw as Record<string, unknown>) };
    delete meta.archived_at;
    return meta;
}

function pickSourceVersion(versions: VersionRow[]): VersionRow | null {
    const drafts = versions.filter((v) => v.status === "draft").sort((a, b) => b.version_number - a.version_number);
    if (drafts[0]) return drafts[0];
    const published = versions.filter((v) => v.status === "published").sort((a, b) => b.version_number - a.version_number);
    return published[0] ?? null;
}

/** Duplicate a form definition — schema + metadata only; no submissions, links, or sessions. */
export async function duplicateFormDefinitionForAdmin(
    supabase: SupabaseClient,
    orgId: string,
    sourceFormId: string
): Promise<DuplicateFormDefinitionResult> {
    const { data: source, error: sourceErr } = await supabase
        .from("form_definitions")
        .select("id, key, name, description, kind, metadata")
        .eq("org_id", orgId)
        .eq("id", sourceFormId)
        .maybeSingle();
    if (sourceErr) throw new Error(sourceErr.message);
    if (!source) return { ok: false, status: 404, message: "Form not found" };

    const { data: versionRows, error: verErr } = await supabase
        .from("form_definition_versions")
        .select("id, version_number, status, schema_json, pdf_mapping_json, metadata")
        .eq("org_id", orgId)
        .eq("form_definition_id", sourceFormId)
        .order("version_number", { ascending: false });
    if (verErr) throw new Error(verErr.message);

    const sourceVersion = pickSourceVersion((versionRows ?? []) as VersionRow[]);
    if (!sourceVersion) {
        return { ok: false, status: 409, message: "This form has no version to copy. Add fields before duplicating." };
    }

    const sourceName = typeof source.name === "string" && source.name.trim() ? source.name.trim() : "Form";
    const copyName = `Copy of ${sourceName}`;
    const taken = await dbListFormDefinitionKeys(supabase, orgId);
    const baseKey = slugKeyFromDisplayName(copyName);
    const key = allocateUniqueKey(baseKey, taken);

    const { data: newForm, error: insertErr } = await dbInsertFormDefinition(supabase, {
        org_id: orgId,
        key,
        name: copyName,
        kind: typeof source.kind === "string" ? source.kind : "center",
        description: typeof source.description === "string" ? source.description : null,
        is_active: true,
        metadata: cleanMetadataForDuplicate(source.metadata),
    });
    if (insertErr || !newForm) {
        if (insertErr?.code === "23505") {
            return { ok: false, status: 409, message: "Could not allocate a unique form key; retry" };
        }
        throw new Error(insertErr?.message ?? "Insert failed");
    }

    const newFormId = (newForm as { id: string }).id;
    const versionNumber = (await dbMaxVersionNumber(supabase, newFormId)) + 1;

    const sourceMeta =
        sourceVersion.metadata && typeof sourceVersion.metadata === "object" && !Array.isArray(sourceVersion.metadata)
            ? (sourceVersion.metadata as Record<string, unknown>)
            : {};

    const { data: draftVersion, error: draftErr } = await dbInsertVersion(supabase, {
        form_definition_id: newFormId,
        org_id: orgId,
        version_number: versionNumber,
        status: "draft",
        schema_json: sourceVersion.schema_json ?? {},
        pdf_mapping_json: sourceVersion.pdf_mapping_json ?? null,
        metadata: { ...sourceMeta },
    });
    if (draftErr || !draftVersion) {
        throw new Error(draftErr?.message ?? "Could not create draft version");
    }

    return {
        ok: true,
        form: {
            id: newFormId,
            key,
            name: copyName,
            draft_version_id: (draftVersion as { id: string }).id,
        },
    };
}
