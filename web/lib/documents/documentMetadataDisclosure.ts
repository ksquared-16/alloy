/**
 * EN-FI-01 — may this actor see a document's METADATA (title, file name, type) where a non-Documents surface
 * mentions it?
 *
 * The Documents routes decide reads with three gates: admission (`documents.read` / a document-read role), subject
 * scope (department / site), and sensitivity clearance (`health.view` for medical, …). Surfaces outside Documents —
 * the Processing queue and case, a form submission's linked documents, packet review, the Health card — read
 * `documents` rows with the service-role client to LABEL something, and before this helper some of them applied none of
 * the three, so a document named "Immunization_Record_<child>.pdf" was disclosed to any portal session in the org.
 *
 * One decision, the same three gates, for a batch of ids. A document the actor may not read is reported as hidden;
 * the caller replaces its label with a neutral one (or drops the row) — it never discloses what it hides. Fails closed:
 * a missing actor, a lookup error, or an id that is not this organization's document is hidden.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { actorMayReadDocuments, filterDocumentRowsInActorScope, type DocumentActor } from "@/lib/documents/assertDocumentAccess";
import { actorMayReadSensitivity, resolveDocumentSensitivity } from "@/lib/documents/documentSensitivity";

/** What a surface shows in place of a document it may not disclose. */
export const UNDISCLOSED_DOCUMENT_LABEL = "Document (restricted)";

export type DocumentDisclosureActor = {
    roleKeys?: readonly string[] | null;
    permissionKeys?: readonly string[] | null;
    scope: DocumentActor["scope"];
};

/** The subset of `documentIds` this actor may see the metadata of (admission ∧ scope ∧ sensitivity). */
export async function disclosableDocumentIds(
    supabase: SupabaseClient,
    orgId: string,
    actor: DocumentDisclosureActor | null,
    documentIds: readonly string[],
): Promise<Set<string>> {
    const ids = [...new Set(documentIds.filter((id) => typeof id === "string" && id.trim()))];
    if (!actor || ids.length === 0 || !actorMayReadDocuments(actor)) return new Set();
    try {
        const { data, error } = await supabase
            .from("documents")
            .select("id, doc_type, entity_type, entity_id")
            .eq("org_id", orgId)
            .in("id", ids);
        if (error) return new Set();
        const rows = (data ?? []) as Array<{ id: string; doc_type: string | null; entity_type: string | null; entity_id: string | null }>;
        const inScope = await filterDocumentRowsInActorScope(supabase, orgId, actor.scope, rows);
        if (inScope.length === 0) return new Set();
        const classes = await resolveDocumentSensitivity(supabase, orgId, inScope.map((r) => ({ id: r.id, doc_type: r.doc_type })));
        return new Set(inScope.filter((r) => actorMayReadSensitivity(actor, classes.get(r.id) ?? new Set())).map((r) => r.id));
    } catch {
        return new Set();
    }
}
