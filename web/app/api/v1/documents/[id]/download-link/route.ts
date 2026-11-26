/**
 * GET /api/v1/documents/{id}/download-link — a short-lived link to the current version of one visible
 * standard-sensitivity document. D9.1, `documents.read`.
 *
 * The internal contract, reused: the link lives `signedUrlExpirySeconds("download")` (ten minutes), each request issues a
 * new one, and `document_link_issued` — naming the application, installation and credential — is recorded BEFORE the
 * link is minted: no record, no link. The response never carries a storage path; there are no permanent URLs.
 */
import type { NextRequest } from "next/server";

import { externalCollectionRoute, UUID_RE } from "@/lib/platform/external/collectionRoute";
import { externalDocumentDownloadSource } from "@/lib/documents/external/externalDocumentAuthority";
import { singleResourceThroughCollection, toPublicDocumentDownloadLink } from "@/lib/platform/external/resources/documentResources";

export const dynamic = "force-dynamic";

const link = externalCollectionRoute({
    route: "/api/v1/documents/{id}/download-link",
    operationId: "getDocumentDownloadLink",
    subject: "document download links",
    source: externalDocumentDownloadSource,
    params: (params) => {
        const id = params.get("document_id") ?? "";
        return { ok: true, values: { p_document_id: UUID_RE.test(id) ? id : null } };
    },
    toPublic: toPublicDocumentDownloadLink,
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    return singleResourceThroughCollection(request, id, link);
}
