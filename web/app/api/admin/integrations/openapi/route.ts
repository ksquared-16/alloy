/**
 * The governed public OpenAPI document, served as-is.
 *
 * One specification. This serves the same bytes the drift guard enforces against the running
 * routes, so the reference an operator or partner reads cannot disagree with what the API does.
 *
 * It is served from the embedded artifact rather than read from the repository at request time.
 * The old `readFileSync(process.cwd() + "/../docs/api/openapi/…")` resolved outside
 * `outputFileTracingRoot` by a path the file tracer cannot see, so the file was absent from a
 * deployed serverless runtime and this route answered 404 — which is what an operator saw when
 * they opened API Reference.
 */
import { NextResponse } from "next/server";

import { GOVERNED_OPENAPI_DOCUMENT } from "@/lib/developerDocs/governedDocuments.generated";

import { requireIntegrationsAccess } from "../_guard";

export async function GET() {
    const gate = await requireIntegrationsAccess("viewInstallation");
    if (!gate.ok) return gate.response;

    return new NextResponse(GOVERNED_OPENAPI_DOCUMENT, {
        headers: { "content-type": "application/json" },
    });
}
