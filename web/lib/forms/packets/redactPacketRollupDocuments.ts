/**
 * EN-FI-01 — a packet review names a generated or uploaded document only to a reader who may read it.
 *
 * The rollup is built from service-role reads; its `steps[].artifact.documents[].name` and `documents_index[].title`
 * carry document titles (a medical form's completed PDF is medical by linkage). Ids, counts, kinds and the form's own
 * name stay: they say which step produced a file, not what the file is about. Opening a file is decided again by the
 * signed-url route.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { disclosableDocumentIds, UNDISCLOSED_DOCUMENT_LABEL, type DocumentDisclosureActor } from "@/lib/documents/documentMetadataDisclosure";
import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";

export function redactPacketRollupDocuments(rollup: PacketReviewRollupV1, disclosable: ReadonlySet<string>): PacketReviewRollupV1 {
    return {
        ...rollup,
        steps: rollup.steps.map((s) => ({
            ...s,
            artifact: {
                ...s.artifact,
                documents: s.artifact.documents.map((d) => (disclosable.has(d.id) ? d : { ...d, name: UNDISCLOSED_DOCUMENT_LABEL })),
            },
        })),
        documents_index: rollup.documents_index.map((e) =>
            e.document_id && !disclosable.has(e.document_id) ? { ...e, title: UNDISCLOSED_DOCUMENT_LABEL } : e,
        ),
    };
}

export async function redactPacketRollupForReader(
    supabase: SupabaseClient,
    orgId: string,
    actor: DocumentDisclosureActor | null,
    rollup: PacketReviewRollupV1,
): Promise<PacketReviewRollupV1> {
    const ids = [
        ...rollup.steps.flatMap((s) => s.artifact.documents.map((d) => d.id)),
        ...rollup.documents_index.map((e) => e.document_id).filter((id): id is string => Boolean(id)),
    ];
    if (ids.length === 0) return rollup;
    return redactPacketRollupDocuments(rollup, await disclosableDocumentIds(supabase, orgId, actor, ids));
}
