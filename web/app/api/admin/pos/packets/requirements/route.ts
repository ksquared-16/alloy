import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { loadFormRequirements } from "@/lib/pos/packet/loadFormRequirements";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/pos/packets/requirements?form_definition_ids=a,b
 *
 * The composer's canonical requirements seam: enumerated, operator-language requirements for the
 * selected published forms (identity + type + labels + recommended responsibility defaults + valid
 * option sets). Derives from the deterministic enumerator; never exposes raw schema JSON.
 */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const raw = new URL(request.url).searchParams.get("form_definition_ids") ?? "";
    const formIds = raw.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s));
    if (formIds.length === 0) return jsonError("form_definition_ids is required", 400);

    const supabase = createAdminClient();
    const result = await loadFormRequirements(supabase, { orgId: ctx.orgId, formIds });
    if (!result.ok) return jsonError(result.error ?? "Failed to load requirements", 400);

    return jsonData({ forms: result.forms, missing_published_forms: result.missing_published_forms });
}
