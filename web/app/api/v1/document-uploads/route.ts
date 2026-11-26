/**
 * POST /api/v1/document-uploads — createDocumentUpload (D9.2). Declares a file; writes nothing. Answers an opaque,
 * signed `upload_id` valid for one hour, bound to this installation and to the declared format, size and SHA-256.
 * Requires `Idempotency-Key`. See lib/documents/external/externalDocumentWrites.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { createDocumentUpload, readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-uploads",
    operationId: "createDocumentUpload",
    subject: "The upload",
    perform: async (body, ctx) => createDocumentUpload(body, writeContextFor(ctx), readIdempotencyKey(ctx.headers)),
});
