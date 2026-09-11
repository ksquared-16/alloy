/**
 * GET /api/public/forms/[token]/enrollment-step-document
 *
 * The document a family is being asked to READ before they agree to it.
 *
 * ## Why this route exists at all
 *
 * A "read & acknowledge" step is worthless without the thing being read. Alloy could already record
 * that a parent ticked a box; it had no way to put the Family Handbook in front of them first, which
 * would have made the acknowledgment a signature on a document the school never showed. That is not
 * a UI gap — a recorded agreement to unseen terms is not evidence of anything.
 *
 * ## Access doctrine, unchanged from its siblings
 *
 * The token resolves the anchored session and NOTHING in the request selects the document. The
 * session's own active step names its packet item, and the packet item's configuration names the
 * document — so a participant cannot read another org's file by guessing an id, and the operator
 * never had to paste one. (The neighbouring `enrollment-document` renders the family's own filled
 * paperwork; this one serves the school's unfilled policy artifact. Different things, same anchor.)
 *
 * Streams the stored bytes as-is. Nothing is filled, composed, or rewritten: the family must see the
 * document the school actually published, byte for byte.
 */

import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import { downloadDocumentBytesSafe } from "@/lib/pos/processingCase/structure/documentBytes";
import { readPacketStepConfig } from "@/lib/forms/packets/packetStepKind";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return publicErr("Server misconfiguration", 500);

    const { token: rawToken } = await params;
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, plaintextToken(rawToken ?? ""));
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }

    const { orgId, sessionId } = access.value;

    const { data: item } = await supabase
        .from("form_packet_session_items")
        .select("packet_item_id")
        .eq("org_id", orgId)
        .eq("packet_session_id", sessionId)
        .eq("status", "active")
        .maybeSingle();
    const packetItemId = (item as { packet_item_id?: string } | null)?.packet_item_id;
    if (!packetItemId) return publicErr("No active step.", 404, { code: "NO_ACTIVE_STEP" });

    const { data: packetItem } = await supabase
        .from("form_packet_items")
        .select("metadata")
        .eq("org_id", orgId)
        .eq("id", packetItemId)
        .maybeSingle();

    const config = readPacketStepConfig((packetItem as { metadata?: unknown } | null)?.metadata);
    if (config.kind !== "document_acknowledgment" || !config.acknowledgmentDocumentId) {
        return publicErr("This step has no document to read.", 404, { code: "NO_STEP_DOCUMENT" });
    }

    const file = await downloadDocumentBytesSafe(supabase, {
        orgId,
        documentId: config.acknowledgmentDocumentId,
    });
    if (!file) return publicErr("Document unavailable.", 409, { code: "DOCUMENT_UNAVAILABLE" });

    return new NextResponse(Buffer.from(file.bytes), {
        status: 200,
        headers: {
            "content-type": file.mimeType ?? "application/pdf",
            "content-disposition": "inline",
            // The document a family agreed to must not be served from a stale copy after the school
            // replaces it — the acknowledgment names the version they were actually shown.
            "cache-control": "no-store",
        },
    });
}
