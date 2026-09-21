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

/**
 * Diagnostic decomposition of the evaluator's own wall.
 *
 * The seed already accumulates these; they were simply never surfaced. Carrying them is how the
 * ~778ms this prerequisite contributes gets attributed to a phase instead of a label. NOTE the
 * seed's own contract: when groups run concurrently these are SUMS OF CONCURRENT WORK and do not
 * add to the caller's wall — they rank phases, they do not reconcile to the wall by addition.
 */
export type FirstOrderWorkViewDiagnostics = {
    readonly spans: Record<string, number>;
    readonly targetCount: number;
    readonly hostWorkUnitCount: number;
    readonly groupCount: number;
    readonly locatorMs: number;
    readonly seedMs: number;
    readonly deptUnitsMs: number;
    readonly deptUnitCount: number;
};

export type FirstOrderWorkViewTotals =
    | {
          status: "ok"; totalsByViewId: Record<string, number | null>;
          configuredViewSignature: string; diagnostics: FirstOrderWorkViewDiagnostics;
      }
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

    /*
     * THE DEPARTMENT'S WORK UNITS ARE FETCHED ONCE AND SERVE BOTH CONSUMERS.
     *
     * The first version let `loadSettlementLocators` fetch them internally and then passed
     * `deptWorkUnits: []` to the seed. The seed uses that set to decide host ACCESSIBILITY, and
     * its contract is explicit: "a target whose host is NOT in the set is not assumed accessible
     * — it resolves UNKNOWN." With an empty set no host was present, so all seven configured
     * Work Views resolved UNKNOWN against an operator frame showing 3, 0, 3, 16, 0, 7 and 2.
     *
     * The seed was right and the caller was wrong: it refused to assume accessibility for hosts
     * it had never been shown. One fetch, both consumers.
     */
    const tDept = performance.now();
    const { data: deptRows, error: deptError } = await supabase
        .from("work_units")
        .select("id, key, name, department_id, is_active, sort_order, queue_definition")
        .eq("org_id", args.orgId)
        .eq("department_id", departmentId);
    if (deptError) return { status: "unavailable", reason: `department work units unavailable: ${deptError.message}` };
    const deptWorkUnits = (deptRows ?? []) as Parameters<typeof loadSettlementLocators>[0]["deptWorkUnits"] & object;

    const deptUnitsMs = Math.round(performance.now() - tDept);

    const tLoc = performance.now();
    const locators = await loadSettlementLocators({
        supabase,
        orgId: args.orgId,
        departmentId,
        workViews,
        activeWorkViewId: args.caller.activeWorkViewId,
        surfaceWorkUnitId: args.workUnitId,
        deptWorkUnits,
    });
    const locatorMs = Math.round(performance.now() - tLoc);
    if (locators.status !== "resolved") {
        return { status: "unavailable", reason: "settlement locators unavailable" };
    }

    const tSeed = performance.now();
    const seed = await resolveWorkViewTotalsSeed({
        supabase,
        orgId: args.orgId,
        hostWorkUnitId: args.workUnitId,
        countTargets: locators.workViewCountTargets,
        deptWorkUnits: deptWorkUnits as Parameters<typeof resolveWorkViewTotalsSeed>[0]["deptWorkUnits"],
        departmentMetadata: args.departmentMetadata,
        departmentId,
        recordScopeConstraints: args.caller.recordScopeConstraints,
        recordScopeImpossible: args.caller.recordScopeImpossible,
        viewerDisplayTimeZone: args.caller.viewerDisplayTimeZone,
    });
    const seedMs = Math.round(performance.now() - tSeed);
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
        diagnostics: {
            spans: seed.spans as unknown as Record<string, number>,
            targetCount: locators.workViewCountTargets.length,
            hostWorkUnitCount: new Set(locators.workViewCountTargets.map((t) => t.hostWorkUnitId)).size,
            groupCount: new Set(locators.workViewCountTargets.map((t) => `${t.hostWorkUnitId}::${t.baseQueueKey}`)).size,
            locatorMs, seedMs, deptUnitsMs, deptUnitCount: deptWorkUnits.length,
        },
    };
}
