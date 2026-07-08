import type { SupabaseClient } from "@supabase/supabase-js";

export type DeleteFormDefinitionResult =
    | { ok: true; deleted: { form_id: string } }
    | { ok: false; status: 404 | 409; message: string };

/**
 * Hard-delete a draft-only form definition. Safe when:
 * - no published version exists
 * - no submissions reference the form
 * - form is not used in a packet
 */
export async function deleteFormDefinitionForAdmin(
    supabase: SupabaseClient,
    orgId: string,
    formDefinitionId: string
): Promise<DeleteFormDefinitionResult> {
    const { data: form, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, name, metadata")
        .eq("org_id", orgId)
        .eq("id", formDefinitionId)
        .maybeSingle();
    if (formErr) throw new Error(formErr.message);
    if (!form) return { ok: false, status: 404, message: "Form not found" };

    const { count: pubCount, error: pubErr } = await supabase
        .from("form_definition_versions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId)
        .eq("status", "published");
    if (pubErr) throw new Error(pubErr.message);
    if ((pubCount ?? 0) > 0) {
        return {
            ok: false,
            status: 409,
            message: "Published forms must be archived, not deleted. Use Archive instead.",
        };
    }

    const { count: subCount, error: subErr } = await supabase
        .from("form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId);
    if (subErr) throw new Error(subErr.message);
    if ((subCount ?? 0) > 0) {
        return {
            ok: false,
            status: 409,
            message: "This form has submissions — archive it instead of deleting.",
        };
    }

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
            message: "This form is used in a packet definition. Remove it from all packets before deleting.",
        };
    }

    const { error: delLinksErr } = await supabase
        .from("form_public_links")
        .delete()
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId);
    if (delLinksErr) throw new Error(delLinksErr.message);

    const { error: delVersionsErr } = await supabase
        .from("form_definition_versions")
        .delete()
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId);
    if (delVersionsErr) throw new Error(delVersionsErr.message);

    const { error: delFormErr } = await supabase
        .from("form_definitions")
        .delete()
        .eq("org_id", orgId)
        .eq("id", formDefinitionId);
    if (delFormErr) throw new Error(delFormErr.message);

    return { ok: true, deleted: { form_id: formDefinitionId } };
}
