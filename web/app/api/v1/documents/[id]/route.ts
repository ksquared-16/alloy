/**
 * GET /api/v1/documents/{id} — one standard-sensitivity document, if and only if it would appear in
 * `GET /api/v1/documents` for its own primary owner. Missing, foreign, out-of-boundary, withheld and unavailable are one
 * answer: 404. D9.1, `documents.read`.
 */
import type { NextRequest } from "next/server";

import { externalCollectionRoute, UUID_RE } from "@/lib/platform/external/collectionRoute";
import { externalDocumentsSource } from "@/lib/documents/external/externalDocumentAuthority";
import { singleResourceThroughCollection, toPublicDocument } from "@/lib/platform/external/resources/documentResources";

export const dynamic = "force-dynamic";

const byId = externalCollectionRoute({
    route: "/api/v1/documents/{id}",
    operationId: "getDocument",
    subject: "documents",
    source: externalDocumentsSource,
    params: (params) => {
        const id = params.get("document_id") ?? "";
        return { ok: true, values: { p_document_id: UUID_RE.test(id) ? id : null } };
    },
    toPublic: toPublicDocument,
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    return singleResourceThroughCollection(request, id, byId);
}
