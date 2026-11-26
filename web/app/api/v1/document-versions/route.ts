/**
 * POST /api/v1/document-versions — replaceDocumentVersion (D9.3). Files a completed upload received by this installation as the next version of a visible standard document (`documents.write`), through the one filing path in `new_version` mode; the type's replacement policy decides.
 * Requires `Idempotency-Key`.
 */
import { externalOperationRoute } from "@/lib/platform/external/operationRoute";
import { readIdempotencyKey, writeContextFor } from "@/lib/documents/external/externalDocumentWrites";
import { replaceDocumentVersion } from "@/lib/documents/external/externalDocumentLifecycle";

export const dynamic = "force-dynamic";

export const POST = externalOperationRoute({
    route: "/api/v1/document-versions",
    operationId: "replaceDocumentVersion",
    subject: "The replacement",
    perform: async (body, ctx) => replaceDocumentVersion(ctx.supabase, writeContextFor(ctx), body, readIdempotencyKey(ctx.headers)),
});
