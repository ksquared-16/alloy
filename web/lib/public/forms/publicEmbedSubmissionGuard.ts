import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicEmbedResolved } from "@/lib/public/forms/resolvePublicFormEmbedContext";

export async function verifySubmissionBelongsToPublicEmbed(
    supabase: SupabaseClient,
    ctx: PublicEmbedResolved,
    submissionId: string
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false; status: number; message: string }> {
    const { data: sub, error } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("id", submissionId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error || !sub) return { ok: false, status: 404, message: "Not found" };

    const row = sub as Record<string, unknown>;
    if (row.created_via_public_link_id !== ctx.linkId) {
        return { ok: false, status: 404, message: "Not found" };
    }
    if (row.form_definition_version_id !== ctx.formDefinitionVersionId) {
        return { ok: false, status: 409, message: "Version mismatch" };
    }

    if (ctx.packet) {
        const { data: si } = await supabase
            .from("form_packet_session_items")
            .select("id")
            .eq("form_submission_id", submissionId)
            .eq("packet_session_id", ctx.packet.packet_session_id)
            .maybeSingle();
        if (!si) return { ok: false, status: 404, message: "Not found" };
    }

    return { ok: true, row };
}
