import type { SupabaseClient } from "@supabase/supabase-js";
import { createGeneratedPdfForSubmission } from "@/lib/forms/pdf/createGeneratedPdfForSubmission";

export type EnsurePacketApprovalPdfsResult = {
    submissionIds: string[];
    attempted: number;
    createdOrReused: number;
    skipped: number;
    errors: string[];
};

/**
 * After operator approval, ensure each submitted packet step has a generated PDF when the published
 * version defines `pdf_mapping_json`. Idempotent (reuses existing stub PDF by idempotency key).
 * Does not mutate CRM entities or form submission payloads.
 */
export async function ensureGeneratedPdfsForApprovedPacketSession(
    supabase: SupabaseClient,
    orgId: string,
    packetSessionId: string
): Promise<EnsurePacketApprovalPdfsResult> {
    const { data: items, error: iErr } = await supabase
        .from("form_packet_session_items")
        .select("form_submission_id, status")
        .eq("org_id", orgId)
        .eq("packet_session_id", packetSessionId)
        .not("form_submission_id", "is", null);

    if (iErr) {
        return { submissionIds: [], attempted: 0, createdOrReused: 0, skipped: 0, errors: [iErr.message] };
    }

    const submissionIds = [
        ...new Set(
            (items ?? [])
                .filter((r: { status?: string }) => String(r.status ?? "") === "submitted")
                .map((r: { form_submission_id: string }) => r.form_submission_id)
                .filter(Boolean)
        ),
    ];

    const errors: string[] = [];
    let createdOrReused = 0;
    let skipped = 0;

    for (const submissionId of submissionIds) {
        const result = await createGeneratedPdfForSubmission(supabase, {
            orgId,
            submissionId,
            forceRegenerate: false,
        });
        if (result.ok) {
            createdOrReused += 1;
            continue;
        }
        if (result.code === "BAD_MAPPING" || result.code === "MISSING_ENTITY") {
            skipped += 1;
            continue;
        }
        if (result.code === "NOT_SUBMITTED") {
            skipped += 1;
            continue;
        }
        errors.push(`${submissionId}: ${result.error}`);
    }

    return {
        submissionIds,
        attempted: submissionIds.length,
        createdOrReused,
        skipped,
        errors,
    };
}
