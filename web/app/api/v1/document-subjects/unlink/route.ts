/**
 * POST /api/v1/document-subjects/unlink — unlinkDocumentSubject (D9.2). Removes a SECONDARY (context) link. The owner
 * link is never removed (409 primary_subject_immutable). Nothing is deleted.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { changeDocumentSubjectLink, readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-subjects/unlink",
    operationId: "unlinkDocumentSubject",
    subject: "The link",
    perform: async (body, ctx) => changeDocumentSubjectLink(ctx.supabase, writeContextFor(ctx), body, "unlink", readIdempotencyKey(ctx.headers)),
});
