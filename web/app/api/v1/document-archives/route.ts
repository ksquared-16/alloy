/**
 * POST /api/v1/document-archives — archiveDocument (D9.3). Archives a visible standard document (`documents.write`, Q5): it leaves every list and requirement, and nothing is deleted. Needs the pending `document_archive` migration; until then 503 `archive_unavailable`.
 * Requires `Idempotency-Key`.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";
import { archiveDocument } from "@/lib/documents/external/externalDocumentLifecycle";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-archives",
    operationId: "archiveDocument",
    subject: "The archive",
    perform: async (body, ctx) => archiveDocument(ctx.supabase, writeContextFor(ctx), body, readIdempotencyKey(ctx.headers)),
});
