import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { loadPacketProjection } from "@/lib/pos/packet/loadPacketProjection";
import { isLaunchEntityType } from "@/lib/pos/packet/launchFromEntity";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/pos/packets/[packetDefinitionId]/projection?entity_type=&entity_id=
 *   &financial_guardian_person_id=&primary_guardian_person_id=
 *
 * The operator responsibility PREVIEW + read-model projection: how the configured packet projects
 * across a household (children × guardians). Blocking validation is included so the UI can refuse
 * launch. Derives from the single projection seam — never re-implements the resolver.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ packetDefinitionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { packetDefinitionId } = await params;
    if (!UUID_RE.test(packetDefinitionId)) return jsonError("Invalid packet id", 400);

    const url = new URL(request.url);
    const entityType = url.searchParams.get("entity_type");
    const entityId = url.searchParams.get("entity_id");
    let anchor: { entity_type: import("@/lib/pos/packet/launchFromEntity").LaunchEntityType; entity_id: string } | null = null;
    if (entityType || entityId) {
        if (!entityType || !isLaunchEntityType(entityType) || !entityId || !UUID_RE.test(entityId)) {
            return jsonError("entity_type/entity_id invalid", 400);
        }
        anchor = { entity_type: entityType, entity_id: entityId };
    }

    const supabase = createAdminClient();
    const result = await loadPacketProjection(supabase, {
        orgId: ctx.orgId,
        packetDefinitionId,
        anchor,
        financialGuardianPersonId: url.searchParams.get("financial_guardian_person_id"),
        primaryGuardianPersonId: url.searchParams.get("primary_guardian_person_id"),
    });
    if (!result.ok) return jsonError(result.error ?? "Failed to project packet", 400);

    return jsonData({
        packet_definition_id: packetDefinitionId,
        packet_name: result.packet_name ?? null,
        missing_published_forms: result.missing_published_forms ?? [],
        launch_blocked: result.projection?.launch_blocked ?? false,
        requirements: result.projection?.requirements ?? [],
        instances: result.projection?.instances ?? [],
        validation: result.projection?.validation ?? [],
    });
}
