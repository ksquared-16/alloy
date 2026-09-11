/**
 * The governed public OpenAPI document, served as-is.
 *
 * One specification. This reads the same file the drift guard enforces against
 * the running routes, so the reference an operator or partner reads cannot
 * disagree with what the API does.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { requireIntegrationsAccess } from "../_guard";

export async function GET() {
    const gate = await requireIntegrationsAccess("viewInstallation");
    if (!gate.ok) return gate.response;

    try {
        const spec = readFileSync(
            path.join(path.resolve(process.cwd(), ".."), "docs/api/openapi/alloy-public-api.v1.json"),
            "utf8",
        );
        return new NextResponse(spec, { headers: { "content-type": "application/json" } });
    } catch {
        return NextResponse.json({ error: "The API reference is not available in this build." }, { status: 404 });
    }
}
