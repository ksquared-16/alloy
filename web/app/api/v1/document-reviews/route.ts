/**
 * POST /api/v1/document-reviews — submitDocumentReview (D9.3). Accepts or rejects the CURRENT version of a visible standard document, once (`documents.review`, Q3). Reopening or changing a decision is staff re-review authority and is refused 403 `REREVIEW_NOT_AUTHORIZED`; a rejection needs a reason.
 * Requires `Idempotency-Key`.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";
import { submitDocumentReview } from "@/lib/documents/external/externalDocumentLifecycle";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-reviews",
    operationId: "submitDocumentReview",
    subject: "The review",
    perform: async (body, ctx) => submitDocumentReview(ctx.supabase, writeContextFor(ctx), body, readIdempotencyKey(ctx.headers)),
});
