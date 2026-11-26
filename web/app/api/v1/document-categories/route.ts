/**
 * GET /api/v1/document-categories — the organization's document "folders": its active Studio categories (hierarchical
 * through `parent_key`) with the published types filed in each. Filing in Alloy is logical — categories and types —
 * never storage folders. D9.1, `documents.read`.
 */
import { externalCollectionRoute } from "@/lib/platform/external/collectionRoute";
import { externalDocumentCategoriesSource } from "@/lib/documents/external/externalDocumentAuthority";
import { toPublicDocumentCategory } from "@/lib/platform/external/resources/documentResources";

export const dynamic = "force-dynamic";

export const GET = externalCollectionRoute({
    route: "/api/v1/document-categories",
    operationId: "listDocumentCategories",
    subject: "document categories",
    source: externalDocumentCategoriesSource,
    params: () => ({ ok: true, values: {} }),
    toPublic: toPublicDocumentCategory,
});
