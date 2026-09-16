import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

/**
 * Serve the two partner artifacts to the QA walkthrough, by name.
 *
 * The operator is asked to judge these documents, so they have to be one click
 * away. `name` selects from a closed map rather than naming a path: a QA helper
 * that accepted a path would be a file reader with a friendly label on it.
 */
export const dynamic = "force-dynamic";

const DOCS: Record<string, string> = {
    readiness: "docs/api/developer-platform/partners/classroom-coach-integration-readiness.md",
    discovery: "docs/api/developer-platform/partners/classroom-coach-technical-discovery-request.md",
    specification: "docs/api/developer-platform/external/alloy-developer-platform-specification.md",
};

export async function GET(request: NextRequest) {
    if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });

    const rel = DOCS[request.nextUrl.searchParams.get("name") ?? ""];
    if (!rel) return NextResponse.json({ error: "unknown_document" }, { status: 400 });

    try {
        // The repository root is the parent of the Next.js app directory.
        const text = await readFile(join(process.cwd(), "..", rel), "utf8");
        return new NextResponse(text, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
        });
    } catch {
        return NextResponse.json({ error: "document_unavailable", path: rel }, { status: 404 });
    }
}
