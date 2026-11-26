/**
 * GET /api/v1/documents/{id}/history — listDocumentHistory (D9.3). What happened to one visible standard document and when (`documents.read`): committed changes and system events, projected from the staff history without detail lines, paths or names.
 * A document the installation cannot read answers an empty page, exactly like one with no entries.
 */
import type { NextRequest } from "next/server";

import { externalCollectionRoute, UUID_RE } from "@/lib/platform/external/collectionRoute";
import { externalDocumentHistorySource } from "@/lib/documents/external/externalDocumentLifecycle";
import { collectionUnderDocument, toPublicDocumentHistoryEntry } from "@/lib/platform/external/resources/documentResources";

export const dynamic = "force-dynamic";

const collection = externalCollectionRoute({
    route: "/api/v1/documents/{id}/history",
    operationId: "listDocumentHistory",
    subject: "document history",
    source: externalDocumentHistorySource,
    params: (params) => {
        const id = params.get("document_id") ?? "";
        return { ok: true, values: { p_document_id: UUID_RE.test(id) ? id : null } };
    },
    toPublic: toPublicDocumentHistoryEntry,
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    return collectionUnderDocument(request, id, collection);
}
