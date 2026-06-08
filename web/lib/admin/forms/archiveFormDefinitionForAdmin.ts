import type { SupabaseClient } from "@supabase/supabase-js";

export type ArchiveFormDefinitionResult =
    | {
          ok: true;
          archived: {
              form_id: string;
              public_links_deactivated: number;
          };
      }
    | { ok: false; status: 404 | 409; message: string };

/** Soft-archive a form: hide from active lists, deactivate share links, preserve submissions. */
export async function archiveFormDefinitionForAdmin(
    supabase: SupabaseClient,
    orgId: string,
    formDefinitionId: string
): Promise<ArchiveFormDefinitionResult> {
    const { data: form, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, name, is_active, metadata")
        .eq("org_id", orgId)
        .eq("id", formDefinitionId)
        .maybeSingle();
    if (formErr) throw new Error(formErr.message);
    if (!form) return { ok: false, status: 404, message: "Form not found" };

    const { count: packetRefCount, error: pktErr } = await supabase
        .from("form_packet_items")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId);
    if (pktErr) throw new Error(pktErr.message);
    if ((packetRefCount ?? 0) > 0) {
        return {
            ok: false,
            status: 409,
            message: "This form is used in a packet definition. Remove it from all packets before archiving.",
        };
    }

    const existingMeta =
        form.metadata && typeof form.metadata === "object" && !Array.isArray(form.metadata)
            ? (form.metadata as Record<string, unknown>)
            : {};

    const { error: formUpdateErr } = await supabase
        .from("form_definitions")
        .update({
            is_active: false,
            metadata: {
                ...existingMeta,
                archived_at: new Date().toISOString(),
            },
        })
        .eq("org_id", orgId)
        .eq("id", formDefinitionId);
    if (formUpdateErr) throw new Error(formUpdateErr.message);

    const { data: linkRows, error: linkErr } = await supabase
        .from("form_public_links")
        .update({ is_active: false })
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId)
        .select("id");
    if (linkErr) throw new Error(linkErr.message);

    return {
        ok: true,
        archived: {
            form_id: formDefinitionId,
            public_links_deactivated: (linkRows ?? []).length,
        },
    };
}
