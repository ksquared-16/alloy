import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { loadPacketPreview } from "@/lib/pos/packet/loadPacketPreview";
import { isLaunchEntityType } from "@/lib/pos/packet/launchFromEntity";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/pos/packets/preview
 *   { form_definition_ids: string[], requirement_responsibilities: Rule[], anchor?: {entity_type,entity_id} }
 *
 * Live pre-compose preview: projects the operator's in-progress responsibility configuration across a
 * representative household (or a real anchor) via the shared projection seam. Updates as config changes.
 */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return jsonError("Invalid JSON", 400);
    }

    const formIds = Array.isArray(body.form_definition_ids) ? body.form_definition_ids.filter((x): x is string => typeof x === "string" && UUID_RE.test(x)) : [];
    if (formIds.length === 0) return jsonError("form_definition_ids is required", 400);
    const rules = Array.isArray(body.requirement_responsibilities) ? body.requirement_responsibilities : [];

    let anchor: { entity_type: import("@/lib/pos/packet/launchFromEntity").LaunchEntityType; entity_id: string } | null = null;
    const a = body.anchor;
    if (a && typeof a === "object" && !Array.isArray(a)) {
        const t = (a as Record<string, unknown>).entity_type;
        const id = (a as Record<string, unknown>).entity_id;
        if (typeof t === "string" && isLaunchEntityType(t) && typeof id === "string" && UUID_RE.test(id)) anchor = { entity_type: t, entity_id: id };
    }

    const supabase = createAdminClient();
    const result = await loadPacketPreview(supabase, { orgId: ctx.orgId, formIds, requirementResponsibilities: rules, anchor });
    if (!result.ok) return jsonError(result.error ?? "Failed to preview packet", 400);
    return jsonData(result);
}
