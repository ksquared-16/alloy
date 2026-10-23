import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { collectSignaturesFromPayload } from "@/lib/forms/signatures/collectSignaturesFromPayload";
import type { FormPayloadSignature } from "@/lib/forms/validateSubmission";

/**
 * How a signature reached Forms — the link it was signed through and the adult that link was sent
 * to, or an operator completing the form in admin. Context for the signer, never the signer.
 */
export type SignatureChannel =
    | {
          readonly kind: "public_link";
          readonly linkId: string;
          readonly packetSessionId: string | null;
          readonly recipientPersonId: string | null;
          readonly recipientName: string | null;
      }
    | { readonly kind: "operator"; readonly userId: string | null };

/**
 * WHO SIGNED, as recorded on `form_submission_signatures.metadata.signer`.
 *
 * The signer's name is only ever what the signer typed: the typed signature itself, or the printed
 * name beside a drawn mark. It is never filled in from the link's recipient — the person signing
 * may be another adult. Whether the typed name matches the recipient is RECORDED as an observation
 * (`printed_name_matches_recipient`), so a reader can tell "the recipient signed", "someone else
 * signed" and "we do not know" apart. A drawn mark with no printed name is `identity_basis:
 * "not_captured"` — explicit, and refused by anything that needs a signer (a medical consent).
 */
export type SignatureSignerRecord = {
    readonly method: "typed" | "drawn";
    readonly printed_name: string | null;
    readonly identity_basis: "typed_signature" | "printed_name_with_drawn_mark" | "not_captured";
    readonly acknowledged_at: string;
    readonly channel: SignatureChannel["kind"];
    readonly link_id: string | null;
    readonly packet_session_id: string | null;
    readonly recipient_person_id: string | null;
    readonly printed_name_matches_recipient: boolean | null;
    readonly operator_user_id: string | null;
};

const normName = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function describeSignatureSigner(sig: FormPayloadSignature, channel: SignatureChannel, acknowledgedAt: string): SignatureSignerRecord {
    const printed = (sig.kind === "typed" ? sig.typed_full_name : sig.signer_printed_name)?.trim() || null;
    const recipientName = channel.kind === "public_link" ? channel.recipientName : null;
    return {
        method: sig.kind,
        printed_name: printed,
        identity_basis: !printed ? "not_captured" : sig.kind === "typed" ? "typed_signature" : "printed_name_with_drawn_mark",
        acknowledged_at: acknowledgedAt,
        channel: channel.kind,
        link_id: channel.kind === "public_link" ? channel.linkId : null,
        packet_session_id: channel.kind === "public_link" ? channel.packetSessionId : null,
        recipient_person_id: channel.kind === "public_link" ? channel.recipientPersonId : null,
        printed_name_matches_recipient: printed && normName(recipientName) ? normName(printed) === normName(recipientName) : null,
        operator_user_id: channel.kind === "operator" ? channel.userId : null,
    };
}

export async function persistFormSubmissionSignatures(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        formSubmissionId: string;
        schema: FormSchemaV1;
        payload: FormPayload;
        signerIpHash: string | null;
        /** How the signature arrived. Absent only on legacy callers; recorded as an operator channel. */
        channel?: SignatureChannel | null;
    }
): Promise<{ inserted: number } | { error: string }> {
    const collected = collectSignaturesFromPayload(input.schema, input.payload);
    if (collected.length === 0) {
        return { inserted: 0 };
    }

    const now = new Date().toISOString();
    const channel: SignatureChannel = input.channel ?? { kind: "operator", userId: null };

    /*
     * D1b.6: a drawn signature's image must be THIS signer's own signature capture.
     *
     * The payload names `drawn_document_id`, and only its UUID shape was checked. It was then linked
     * to the submission as a `signature_asset` and its bytes embedded in the signed PDF. So a public
     * link could cite any document in the organization (another child's record, say) and have it
     * rendered into its own artifact. On a public link the document must be a `signature_asset` that
     * this same packet session captured. The operator channel is already bound to the submission's
     * organization by the database trigger (`validate_form_submission_signatures_drawn_doc`).
     */
    if (channel.kind === "public_link") {
        const cited = [
            ...new Set(
                collected
                    .filter((c) => c.signature.kind === "drawn" && c.signature.drawn_document_id)
                    .map((c) => c.signature.drawn_document_id!),
            ),
        ];
        if (cited.length > 0) {
            if (!channel.packetSessionId) return { error: "A drawn signature must be captured on this signing link." };
            const { data: own, error: ownErr } = await supabase
                .from("documents")
                .select("id, doc_type, metadata")
                .eq("org_id", input.orgId)
                .in("id", cited);
            if (ownErr) return { error: ownErr.message };
            const valid = new Set(
                ((own ?? []) as Array<{ id: string; doc_type: string | null; metadata: Record<string, unknown> | null }>)
                    .filter((d) => d.doc_type === "signature_asset" && d.metadata?.packet_session_id === channel.packetSessionId)
                    .map((d) => d.id),
            );
            if (cited.some((id) => !valid.has(id))) {
                return { error: "A drawn signature must be captured on this signing link." };
            }
        }
    }
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
                metadata: { source: "form_submit_v1", signer: describeSignatureSigner(sig, channel, acknowledgedAt) },
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
            metadata: { source: "form_submit_v1", signer: describeSignatureSigner(sig, channel, acknowledgedAt) },
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
