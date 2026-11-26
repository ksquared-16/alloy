/**
 * POST /api/v1/document-filings — fileDocument (D9.2). Files a document this installation uploaded to a visible
 * child, household or parent/guardian, through the staff filing rules and transaction (Q2). Standard sensitivity
 * only; a review is never pre-accepted. Requires `Idempotency-Key` (the filing key; a replay returns the committed result).
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { fileDocumentAsApplication, readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-filings",
    operationId: "fileDocument",
    subject: "The filing",
    perform: async (body, ctx) => fileDocumentAsApplication(ctx.supabase, writeContextFor(ctx), body, readIdempotencyKey(ctx.headers)),
});
