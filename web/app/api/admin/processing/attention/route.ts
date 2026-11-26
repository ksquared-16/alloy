import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError } from "@/lib/admin/forms/formsAdminResponses";
import { countUnworkedProcessingCases } from "@/lib/pos/processingCaseAttention";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/processing/attention — the Processing nav badge.
 *
 * How many actionable cases are still NEW / UNWORKED (see processingCaseAttention): arrived, and no
 * operator has recorded a decision on them. A count only — no record data.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    try {
        const unworked = await countUnworkedProcessingCases(createAdminClient(), ctx.orgId);
        return jsonData({ unworked_count: unworked });
    } catch (e) {
        return jsonError(e instanceof Error ? e.message : "Failed to count Processing attention", 500);
    }
}
