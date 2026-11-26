/**
 * GET /api/v1/documents/{id}/reviews — listDocumentReviews (D9.3). Every review decision and validity record of one visible standard document, oldest first (`documents.read`). Who acted is `staff` or `application`; reasons are not published.
 * A document the installation cannot read answers an empty page, exactly like one with no entries.
 */
import type { NextRequest } from "next/server";

import { externalCollectionRoute, UUID_RE } from "@/lib/platform/external/collectionRoute";
import { externalDocumentReviewsSource } from "@/lib/documents/external/externalDocumentLifecycle";
import { collectionUnderDocument, toPublicDocumentReview } from "@/lib/platform/external/resources/documentResources";

export const dynamic = "force-dynamic";

const collection = externalCollectionRoute({
    route: "/api/v1/documents/{id}/reviews",
    operationId: "listDocumentReviews",
    subject: "document reviews",
    source: externalDocumentReviewsSource,
    params: (params) => {
        const id = params.get("document_id") ?? "";
        return { ok: true, values: { p_document_id: UUID_RE.test(id) ? id : null } };
    },
    toPublic: toPublicDocumentReview,
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    return collectionUnderDocument(request, id, collection);
}
