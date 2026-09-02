/**
 * GET /api/public/forms/[token]/enrollment-artifact
 *
 * What the parent is looking at, as ONE contract across both renderers.
 *
 * ## Why the surface could not ask this before
 *
 * The participant surface read signature placements straight off the version's `pdf_mapping_json`.
 * A composed document has no mapping — its signature block is reserved by the layout, not by
 * geometry the source never had — so on the generated Tuition and Handbook agreements the surface
 * saw no placement and fell back to the Forms signature control: a text box, beside the document,
 * instead of the signature line ON it. The renderer already reported its placements for BOTH
 * engines; nothing asked.
 *
 * `ParticipantArtifact` is that question's answer and it existed already, with no caller. This is
 * the caller.
 *
 * Access doctrine is the sibling routes': the token resolves the anchored session and the request
 * selects nothing.
 */

import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { resolveParticipantEnrollmentFromToken } from "@/lib/public/forms/resolveParticipantEnrollmentFromToken";
import {
    renderParticipantEnrollmentDocument,
    resolveActiveArtifact,
} from "@/lib/enrollment/participantRuntime/renderParticipantEnrollmentDocument";
import {
    generatedDocumentArtifact,
    sourceFidelityArtifact,
} from "@/lib/enrollment/participantRuntime/participantArtifactContract";
import { validateFormSchema } from "@/lib/forms/schema";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return publicErr("Server misconfiguration", 500);

    const { token: rawToken } = await params;
    const token = plaintextToken(rawToken ?? "");
    const supabase = createServiceRoleClient();

    const access = await resolveParticipantEnrollmentFromToken(supabase, token);
    if (!access.ok) {
        return publicErr(access.error.message, access.error.code === "INVALID_LINK" ? 404 : 409, {
            code: access.error.code,
        });
    }

    const artifact = await resolveActiveArtifact(supabase, {
        orgId: access.value.orgId,
        sessionId: access.value.sessionId,
    });
    if (!artifact.ok) return publicErr("No artifact is open for this journey.", 409, { code: "NO_ARTIFACT" });

    /*
     * The render decides, because the render is what the parent sees.
     *
     * Deriving placements from the mapping instead would be right for one engine and silently empty
     * for the other — which is the defect this route exists to close.
     */
    const rendered = await renderParticipantEnrollmentDocument(supabase, {
        orgId: access.value.orgId,
        sessionId: access.value.sessionId,
        nowIso: new Date().toISOString(),
    });
    if (!rendered.ok) {
        return publicErr("Document unavailable.", rendered.code === "no_document" ? 404 : 409, {
            code: rendered.code.toUpperCase(),
        });
    }

    let title = "";
    try {
        title = validateFormSchema(artifact.envelope.schemaJson).title ?? "";
    } catch {
        title = "";
    }

    const pageSourceUrl = `/api/public/forms/${encodeURIComponent(token)}/enrollment-document`;
    const common = {
        sessionItemId: access.value.sessionId,
        formDefinitionId: artifact.formDefinitionId,
        formDefinitionVersionId: artifact.versionId ?? "",
        title,
        pageCount: rendered.pageCount,
        pageSourceUrl,
        sourceTitle: artifact.sourceTitle,
    };

    const model =
        rendered.renderer === "source_fidelity" && rendered.mapping
            ? sourceFidelityArtifact({ ...common, mapping: rendered.mapping })
            : generatedDocumentArtifact({
                  ...common,
                  signatures: rendered.signaturePlacements,
                  sourceDocumentId: artifact.sourceDocumentId,
                  sourceSha256: artifact.sourceSha256,
                  composerVersion: rendered.renderIdentity,
              });

    /*
     * The values this rendering was produced from, for the review list beside the document.
     *
     * The list used to compile from the draft form payload — an earlier, thinner view of the same
     * artifact — so a party destination read blank next to a document that showed the person. Both
     * surfaces now describe one resolved artifact. No party knowledge crosses: these are field ids
     * and values, exactly as the renderer received them.
     */
    return NextResponse.json(
        { ok: true, data: { ...model, resolvedValues: rendered.resolvedValues } },
        { headers: { "cache-control": "no-store" } },
    );
}

// `publicOk` is the sibling shape; this route mirrors it explicitly to attach cache headers.
void publicOk;
