import type { SupabaseClient } from "@supabase/supabase-js";

import { loadSettlementLocators } from "@/lib/runtime/provisioning/settlementLocators";
import { resolveWorkViewTotalsSeed } from "@/lib/runtime/provisioning/workViewTotalsSeed";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";

/**
 * CONFIGURED WORK VIEW VALUES FOR THE FIRST-ORDER FRAME.
 *
 * ── NO EXTRACTION WAS NEEDED, AND I SAID OTHERWISE ──
 *
 * I reported that the count-target derivation was "trapped inside the legacy composer" with "no
 * standalone exported derivation". That was wrong. `resolveSettlementLocators` (pure) and
 * `loadSettlementLocators` (fetch + resolve) have been standalone exported owners in
 * `settlementLocators.ts` all along, and `composeWorkUnitProvisioningAnswer` already CALLS
 * `loadSettlementLocators` rather than deriving targets inline. I had grepped for exports whose
 * names contain "CountTarget"; the owner is named for LOCATORS, so the search missed it and I
 * reported an absence I had not established.
 *
 * So this module wires A′ to the owner that already exists. Nothing is extracted and nothing is
 * reimplemented:
 *
 *   configured Work Views  → `savedWorkViewsFromDepartmentMetadata` (the configuration owner)
 *   count targets          → `loadSettlementLocators`               (the locator owner, shared
 *                                                                    with the legacy composer)
 *   the totals themselves  → `resolveWorkViewTotalsSeed`
 *                              → `evaluateWorkViewTotalsForGroup`   (the ONE evaluator)
 *
 * ── SCOPE AND TIMEZONE COME FROM THE CALLER ──
 *
 * The seed needs the request's record scope and the viewer's display timezone. The production
 * path resolves both at its gate and says so explicitly: "they are request-time by construction —
 * no verdict is cached, persisted, or carried to another request." A′ takes them as inputs for
 * the same reason it takes `authority` as an input. Resolving them here would make a second scope
 * authority and a second timezone owner out of a projection runtime.
 */

export type FirstOrderWorkViewTotals =
    | { status: "ok"; totalsByViewId: Record<string, number | null>; configuredViewSignature: string }
    | { status: "unavailable"; reason: string };

export type FirstOrderWorkViewCallerInputs = {
    /** The request's already-resolved record scope. Never computed here. */
    recordScopeConstraints: Parameters<typeof resolveWorkViewTotalsSeed>[0]["recordScopeConstraints"];
    recordScopeImpossible: boolean;
    /** The viewer's display timezone META, as the evaluator consumes it. */
    viewerDisplayTimeZone: Parameters<typeof resolveWorkViewTotalsSeed>[0]["viewerDisplayTimeZone"];
    /** The Work View the surface opened with, for the locator's own active-target resolution. */
    activeWorkViewId: string;
};

export async function readWorkViewTotalsForFirstOrder(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        /** The surface work unit this frame answers for. */
        workUnitId: string;
        departmentId: string | null;
        departmentMetadata: unknown;
        caller: FirstOrderWorkViewCallerInputs;
    },
): Promise<FirstOrderWorkViewTotals> {
    const departmentId = (args.departmentId ?? "").trim();
    if (!departmentId) return { status: "unavailable", reason: "no department for this work unit" };

    // CONFIGURATION selects the views. Nothing here knows how many there are or what they answer.
    const workViews = savedWorkViewsFromDepartmentMetadata(args.departmentMetadata);
    if (!workViews.length) return { status: "unavailable", reason: "no configured work views" };

    const locators = await loadSettlementLocators({
        supabase,
        orgId: args.orgId,
        departmentId,
        workViews,
        activeWorkViewId: args.caller.activeWorkViewId,
        surfaceWorkUnitId: args.workUnitId,
    });
    if (locators.status !== "resolved") {
        return { status: "unavailable", reason: "settlement locators unavailable" };
    }

    const seed = await resolveWorkViewTotalsSeed({
        supabase,
        orgId: args.orgId,
        hostWorkUnitId: args.workUnitId,
        countTargets: locators.workViewCountTargets,
        deptWorkUnits: [],
        departmentMetadata: args.departmentMetadata,
        departmentId,
        recordScopeConstraints: args.caller.recordScopeConstraints,
        recordScopeImpossible: args.caller.recordScopeImpossible,
        viewerDisplayTimeZone: args.caller.viewerDisplayTimeZone,
    });
    if (seed.status !== "resolved") {
        // The seed carries NO totals when it cannot answer, deliberately — an empty list would
        // read as authoritative zeros. That distinction is preserved, not flattened.
        return { status: "unavailable", reason: `work view seed ${seed.status}` };
    }

    /*
     * `known: false` means UNKNOWN and is carried as null, never as zero. A known zero arrives as
     * `count: 0, known: true` and stays zero — the row contract states this, and collapsing the
     * two would tell an operator a lens is empty when nobody counted it.
     */
    const totalsByViewId: Record<string, number | null> = {};
    for (const row of seed.totals) totalsByViewId[row.workViewId] = row.known ? row.count : null;

    return {
        status: "ok",
        totalsByViewId,
        configuredViewSignature: seed.identity.configuredViewSignature,
    };
}
