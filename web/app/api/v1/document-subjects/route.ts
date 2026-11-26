/**
 * POST /api/v1/document-subjects — linkDocumentSubject (D9.2). Adds a SECONDARY (context) link from a document this
 * installation can read to a child, household or parent/guardian it can see. The owner never changes.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { changeDocumentSubjectLink, readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-subjects",
    operationId: "linkDocumentSubject",
    subject: "The link",
    perform: async (body, ctx) => changeDocumentSubjectLink(ctx.supabase, writeContextFor(ctx), body, "link", readIdempotencyKey(ctx.headers)),
});
