/**
 * GET /api/public/forms/[token]/enrollment-document
 *
 * The participant's original enrollment document, filled with everything resolved so far.
 *
 * Same access doctrine as every sibling route: the token resolves the anchored session, and nothing
 * else in the request selects anything — no document id, no version, no field. The session's pin
 * chooses the version, the version's mapping chooses the document, and the sha pin refuses drifted
 * bytes. The response is the CURRENT render: values change (an edit, a late conversational answer),
 * the next GET shows them, which is why it is never cacheable.
 */

import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { startParticipantTiming } from "@/lib/perf/participantServerTiming";
import { renderParticipantEnrollmentDocument } from "@/lib/enrollment/participantRuntime/renderParticipantEnrollmentDocument";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    const timing = startParticipantTiming();
    const tokenStart = timing.now();
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return publicErr("Server misconfiguration", 500);

    const { token: rawToken } = await params;
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(rawToken ?? ""));
    timing.mark("token", tokenStart);
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }

    const renderStart = timing.now();
    const rendered = await renderParticipantEnrollmentDocument(supabase, {
        orgId: access.value.orgId,
        sessionId: access.value.sessionId,
        nowIso: new Date().toISOString(),
    });
    if (!rendered.ok) {
        return publicErr(
            rendered.code === "no_document" ? "No original document for this artifact." : "Document unavailable.",
            rendered.code === "no_document" ? 404 : 409,
            { code: rendered.code.toUpperCase() },
        );
    }

    timing.mark("render", renderStart);
    return new NextResponse(Buffer.from(rendered.bytes), {
        status: 200,
        headers: {
            "content-type": "application/pdf",
            "content-disposition": "inline",
            // The render reflects live session state — a cached copy would show a corrected value's past.
            "cache-control": "no-store",
            "server-timing": timing.header(),
        },
    });
}
