import "server-only";

/**
 * SHARED ROUTE COMPOSITION for the bounded Provisioning Answer.
 *
 * Extracted verbatim from `GET /api/admin/work-units/[id]/provisioning-answer` so the two callers —
 * the HTTP seam K2 fetches, and the RSC route bootstrap that SEEDS the answer (Runtime V1 Realization)
 * — resolve IDENTICALLY: same gate, same slug→view resolution, same `composeWorkUnitProvisioningAnswer`
 * inputs. One resolver, one composition; the seed and any client fallback can never diverge.
 *
 * U-P1: authorization + tenant scope resolved ONCE, by the canonical route gate; the composer never
 * re-resolves them. Slug→host-unit resolution can never fail the answer — an unresolvable slug is passed
 * through so the composer returns the same honest terminal error.
 */
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    loadAdminRouteGate,
    type AdminRouteGateFailure,
} from "@/lib/admin/adminRouteGate";
import {
    composeWorkUnitProvisioningAnswer,
    type ProvisioningAnswer,
} from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import {
    fetchWorkUnitsForSlugResolution,
    fetchDepartmentsForSlugResolution,
} from "@/lib/admin/fetchWorkUnitsForSlugResolution";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

export type RouteProvisioningResult =
    | { ok: true; answer: ProvisioningAnswer }
    | { ok: false; gate: AdminRouteGateFailure };

/**
 * Resolve the operator route slug → host Work Unit + active view, then compose the ONE bounded answer.
 * `requestedWorkViewId` / `requestedSubjectId` are the URL-carried attention inputs (K1 owns intent).
 */
export async function composeProvisioningAnswerForRoute(input: {
    rawSlug: string;
    requestedWorkViewId: string | null;
    requestedSubjectId: string | null;
}): Promise<RouteProvisioningResult> {
    // U-P1 — one authorization + one scope resolve for the entire answer.
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return { ok: false, gate };

    const supabase = createAdminClient();

    // ── CANONICAL ROUTE RESOLUTION — the operator route names a WORK VIEW, hosted on a work unit. ──
    // Same precedence (work_unit_key → work_view → queue_lane_key) the API route and seed route use.
    // An explicit lens on the URL (K1's intent) always wins over the slug's implied view.
    let workUnitSlug = input.rawSlug;
    let requestedWorkViewId = input.requestedWorkViewId;
    const platformKey = workUnitRouteSlugToKey((input.rawSlug ?? "").trim());
    if (platformKey) {
        try {
            const { rows: workUnits } = await fetchWorkUnitsForSlugResolution({
                supabase,
                orgId: gate.orgId,
                dim: gate.dim,
                platformKey,
            });
            const departments = await fetchDepartmentsForSlugResolution({
                supabase,
                orgId: gate.orgId,
                departmentIds: workUnits.map((r) => r.department_id),
            });
            const resolved = resolveWorkUnitByRouteSlug({ slug: input.rawSlug, workUnits, departments });
            if (resolved.status === "resolved") {
                workUnitSlug = resolved.match.workUnitKey;
                if (!requestedWorkViewId && resolved.match.initialWorkViewId) {
                    requestedWorkViewId = resolved.match.initialWorkViewId;
                }
            }
            // not_found / ambiguous → fall through with the raw slug; the composer emits the honest error.
        } catch {
            // Resolution I/O failure must never fail the answer; the composer still produces a terminal.
        }
    }

    const answer = await composeWorkUnitProvisioningAnswer({
        supabase,
        orgId: gate.orgId,
        currentUserId: gate.userId ?? null,
        workUnitSlug,
        requestedWorkViewId,
        requestedSubjectId: input.requestedSubjectId,
    });

    return { ok: true, answer };
}
