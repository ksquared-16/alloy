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

    /*
     * A form in a LIVE packet must not be archived. A form whose only packets are retired may be.
     *
     * The guard is right and stays: archiving a step out from under a packet families are being
     * sent would break it. But it counted every packet item ever created, including those belonging
     * to deactivated certification packets — so a fixture Form could never be tidied away without
     * first dismantling the retired fixture packet that referenced it, which is exactly the
     * cascade-delete this codebase avoids everywhere else.
     *
     * So the question it asks is narrowed to the one it always meant: is any ACTIVE packet using
     * this form? Retired packets keep their items, their sessions and their history untouched.
     */
    const { data: activePackets, error: apErr } = await supabase
        .from("form_packet_definitions")
        .select("id")
        .eq("org_id", orgId)
        .eq("is_active", true);
    if (apErr) throw new Error(apErr.message);
    const activeIds = (activePackets ?? []).map((p) => (p as { id: string }).id);

    let packetRefCount = 0;
    if (activeIds.length > 0) {
        const { count, error: pktErr } = await supabase
            .from("form_packet_items")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("form_definition_id", formDefinitionId)
            .in("packet_definition_id", activeIds);
        if (pktErr) throw new Error(pktErr.message);
        packetRefCount = count ?? 0;
    }
    if (packetRefCount > 0) {
        return {
            ok: false,
            status: 409,
            message: "This form is used in an active packet definition. Remove it from all packets before archiving.",
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
