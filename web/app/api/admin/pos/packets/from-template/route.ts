import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    createParentPacketFromTemplate,
    makeParentPacketTemplateDeps,
} from "@/lib/pos/packet/createParentPacketFromTemplate";
import { parseLaunchFromEntityBody } from "@/lib/pos/packet/launchFromEntity";

export const dynamic = "force-dynamic";

/** Mirror of packet-links route: derive the public embed origin from forwarded headers. */
function deriveEmbedBaseUrl(request: NextRequest): string | null {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (!host?.trim()) return null;
    const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
    return `${proto}://${host.trim()}`;
}

/**
 * POST /api/admin/pos/packets/from-template — Sprint 1 Packet Runtime Foundation.
 *
 * Turn a generated Alloy form template into a one-step parent packet with a shareable
 * public link, reusing the existing forms-packet runtime. Ensures the template has a
 * published version (publishes the latest draft if needed), creates a packet definition +
 * one item, and mints a packet public link. No PDF generation, no submission, no matching.
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    if (typeof body.form_definition_id !== "string") {
        return jsonError("form_definition_id is required", 400);
    }
    const formDefinitionId = parseUuidParam(body.form_definition_id, "form_definition_id");
    if (formDefinitionId instanceof NextResponse) return formDefinitionId;

    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
    const autopublish = typeof body.autopublish === "boolean" ? body.autopublish : undefined;

    const launchParsed = parseLaunchFromEntityBody(body.launch_from_entity);
    if (!launchParsed.ok) return jsonError(launchParsed.error, 400);
    const launchFromEntity = launchParsed.value ?? undefined;

    const supabase = createAdminClient();

    try {
        const result = await createParentPacketFromTemplate(makeParentPacketTemplateDeps(supabase), {
            orgId: ctx.orgId,
            formDefinitionId,
            publishedByUserId: ctx.userId,
            embedBaseUrl: deriveEmbedBaseUrl(request),
            ...(name ? { name } : {}),
            ...(autopublish !== undefined ? { autopublish } : {}),
            ...(launchFromEntity ? { launchFromEntity } : {}),
        });

        if (!result.ok) {
            const status =
                result.code === "not_found" ? 404 : result.code === "no_publishable_version" ? 422 : result.code === "publish_failed" ? 422 : 400;
            return jsonError(result.message, status);
        }

        const embedUrl = result.publicLink.embedUrl;
        return jsonData(
            {
                packet_definition_id: result.packetDefinitionId,
                form_definition_id: result.formDefinitionId,
                published_version_id: result.publishedVersionId,
                already_published: result.alreadyPublished,
                public_link: {
                    token: result.publicLink.token,
                    embed_path: result.publicLink.embedPath,
                    embed_url: embedUrl,
                    url: embedUrl ?? result.publicLink.embedPath,
                    first_step_sequence_index: result.publicLink.firstStepSequenceIndex,
                },
            },
            { status: 201 }
        );
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create parent packet" },
            { status: 500 }
        );
    }
}
