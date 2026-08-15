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
import { type AdminRouteGateFailure } from "@/lib/admin/adminRouteGate";
import {
    composeWorkUnitProvisioningAnswer,
    type ProvisioningAnswer,
} from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { resolveWorkUnitRouteIdentity } from "@/lib/admin/resolveWorkUnitRouteIdentity";
import { parseCardFocusAspect } from "@/lib/runtime/kernel/attentionCardFocus";

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
    /**
     * `"none"` — the operator selected NO cohort. Carried from `?cohort=none`, which is how attention
     * projects contextual focus so it survives a reload.
     */
    cohort?: "none" | null;
    /** The kernel's ASPECT (`card:…|item:…`), for a contextual answer's card + row. */
    aspect?: string | null;
}): Promise<RouteProvisioningResult> {
    // U-P1 — one authorization + one scope resolve for the entire answer. The slug→identity resolution
    // is request-memoized (Phase 3 dedup): the work-unit layout's route-meta seed and this provisioning
    // seed share ONE resolution instead of each running the same DB reads.
    const { gate, resolution } = await resolveWorkUnitRouteIdentity(input.rawSlug);
    if (!gate.ok) return { ok: false, gate };

    const supabase = createAdminClient();

    // ── CANONICAL ROUTE RESOLUTION — the operator route names a WORK VIEW, hosted on a work unit. ──
    // Same precedence (work_unit_key → work_view → queue_lane_key) the API route and seed route use.
    // An explicit lens on the URL (K1's intent) always wins over the slug's implied view.
    // not_found / ambiguous / unresolved → fall through with the raw slug; the composer emits the honest error.
    const contextual = input.cohort === "none";
    let workUnitSlug = input.rawSlug;
    let requestedWorkViewId = input.requestedWorkViewId;
    if (resolution && resolution.status === "resolved") {
        workUnitSlug = resolution.match.workUnitKey;
        // THE SLUG'S IMPLIED VIEW IS A SECOND PLACE A LENS GETS FILLED IN — and the one that would
        // have quietly defeated contextual focus. When the operator selected no cohort there is
        // nothing for the slug to imply on their behalf: they addressed a HOST, and the view the slug
        // happens to open by default is exactly the `New` this whole change exists to stop claiming.
        if (!requestedWorkViewId && !contextual && resolution.match.initialWorkViewId) {
            requestedWorkViewId = resolution.match.initialWorkViewId;
        }
    }

    const aspect = contextual ? parseCardFocusAspect(input.aspect ?? null) : null;
    const answer = await composeWorkUnitProvisioningAnswer({
        supabase,
        orgId: gate.orgId,
        currentUserId: gate.userId ?? null,
        workUnitSlug,
        requestedWorkViewId,
        requestedSubjectId: input.requestedSubjectId,
        mode: contextual ? "contextual_focus" : "operational",
        requestedAspect: aspect ? { cardKey: aspect.card_key, itemId: aspect.item_id } : null,
    });

    return { ok: true, answer };
}
