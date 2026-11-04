/**
 * POST /api/v1/document-validity — setDocumentValidity (D9.3). Records the effective and expiration dates of the CURRENT version of a visible standard document (`documents.write`), through the staff validity function; the review is untouched.
 * Requires `Idempotency-Key`.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";
import { setDocumentValidity } from "@/lib/documents/external/externalDocumentLifecycle";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-validity",
    operationId: "setDocumentValidity",
    subject: "The validity dates",
    perform: async (body, ctx) => setDocumentValidity(ctx.supabase, writeContextFor(ctx), body, readIdempotencyKey(ctx.headers)),
});
