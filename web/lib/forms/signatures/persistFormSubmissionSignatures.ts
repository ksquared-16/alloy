import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { collectSignaturesFromPayload } from "@/lib/forms/signatures/collectSignaturesFromPayload";

export async function persistFormSubmissionSignatures(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        formSubmissionId: string;
        schema: FormSchemaV1;
        payload: FormPayload;
        signerIpHash: string | null;
    }
): Promise<{ inserted: number } | { error: string }> {
    const collected = collectSignaturesFromPayload(input.schema, input.payload);
    if (collected.length === 0) {
        return { inserted: 0 };
    }

    const now = new Date().toISOString();
    const rows = collected.map((c) => {
        const sig = c.signature;
        const acknowledgedAt = typeof sig.acknowledged_at === "string" && sig.acknowledged_at.trim() ? sig.acknowledged_at : now;
        if (sig.kind === "typed") {
            return {
                org_id: input.orgId,
                form_submission_id: input.formSubmissionId,
                field_id: c.field_id,
                instance_key: c.instance_key,
                signature_kind: "typed" as const,
                typed_full_name: sig.typed_full_name?.trim() ?? null,
                drawn_asset_document_id: null,
                signer_acknowledged_at: acknowledgedAt,
                signer_ip_hash: input.signerIpHash,
                metadata: { source: "form_submit_v1" },
            };
        }
        return {
            org_id: input.orgId,
            form_submission_id: input.formSubmissionId,
            field_id: c.field_id,
            instance_key: c.instance_key,
            signature_kind: "drawn" as const,
            typed_full_name: null,
            drawn_asset_document_id: sig.drawn_document_id ?? null,
            signer_acknowledged_at: acknowledgedAt,
            signer_ip_hash: input.signerIpHash,
            metadata: { source: "form_submit_v1" },
        };
    });

    const { error } = await supabase.from("form_submission_signatures").upsert(rows, {
        onConflict: "form_submission_id,field_id,instance_key",
    });

    if (error) {
        console.error("[persistFormSubmissionSignatures]", error);
        return { error: error.message };
    }

    const drawnDocIds = collected.filter((c) => c.signature.kind === "drawn" && c.signature.drawn_document_id).map((c) => c.signature.drawn_document_id!);

    for (const docId of drawnDocIds) {
        const { data: existing } = await supabase
            .from("form_submission_documents")
            .select("id")
            .eq("form_submission_id", input.formSubmissionId)
            .eq("document_id", docId)
            .maybeSingle();
        if (existing) continue;

        const { error: jErr } = await supabase.from("form_submission_documents").insert({
            org_id: input.orgId,
            form_submission_id: input.formSubmissionId,
            document_id: docId,
            role: "signature_asset",
            sort_order: 0,
            metadata: { source: "form_submit_v1_drawn_asset" },
        });
        if (jErr) {
            console.warn("[persistFormSubmissionSignatures] junction", jErr.message);
        }
    }

    return { inserted: collected.length };
}
