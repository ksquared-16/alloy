import type { SupabaseClient } from "@supabase/supabase-js";

export type ArchiveProcessingCaseResult =
    | { ok: true; archived: { case_id: string } }
    | { ok: false; status: 404 | 409; message: string };

/** Soft-archive a processing case — hides from active work without deleting source records. */
export async function archiveProcessingCaseForAdmin(
    supabase: SupabaseClient,
    orgId: string,
    caseId: string
): Promise<ArchiveProcessingCaseResult> {
    const { data: row, error: readErr } = await supabase
        .from("processing_cases")
        .select("id, status, metadata")
        .eq("org_id", orgId)
        .eq("id", caseId)
        .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) return { ok: false, status: 404, message: "Processing case not found" };

    const status = (row as { status: string }).status;
    if (status === "archived") {
        return { ok: true, archived: { case_id: caseId } };
    }

    const meta = ((row as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    const { error: updErr } = await supabase
        .from("processing_cases")
        .update({
            status: "archived",
            archived_at: new Date().toISOString(),
            status_changed_at: new Date().toISOString(),
            metadata: { ...meta, archived_by_operator: true, archived_at: new Date().toISOString() },
        })
        .eq("org_id", orgId)
        .eq("id", caseId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, archived: { case_id: caseId } };
}
