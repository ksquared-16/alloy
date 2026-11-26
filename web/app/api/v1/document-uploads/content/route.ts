/**
 * POST /api/v1/document-uploads/content?upload_id=… — completeDocumentUpload (D9.2). The raw file bytes (at most
 * 4 MiB) pass through Alloy and are screened BEFORE storage (Q1). Creates one unfiled document that only this
 * installation can file. Retries converge on the same document; different bytes for the same upload are 409.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { API_DOCUMENT_UPLOAD_LIMIT_TEXT, API_DOCUMENT_UPLOAD_MAX_BYTES, completeDocumentUpload, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-uploads/content",
    operationId: "completeDocumentUpload",
    subject: "The upload",
    bodyKind: "bytes",
    maxBodyBytes: API_DOCUMENT_UPLOAD_MAX_BYTES,
    tooLargeMessage: `Files sent through the API must be at most ${API_DOCUMENT_UPLOAD_LIMIT_TEXT}.`,
    perform: async (body, ctx) =>
        completeDocumentUpload(ctx.supabase, writeContextFor(ctx), ctx.query.get("upload_id"), body.bytes as Uint8Array),
});
