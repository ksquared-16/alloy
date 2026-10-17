"use client";

/**
 * PLANS THAT RUN WHERE THE OPERATOR CLICKED.
 *
 * Most execution plans open a host (a workspace, a composer, a record command). A few are a single
 * canonical mutation on a thing the card already names — cancelling the scheduled tour is one. Those
 * used to fall through to "open the workspace", which never ran them, so Cancel Tour on the Process
 * card did nothing.
 *
 * This is where they run, so a card stays a composer: it hands over the plan and learns whether the
 * plan was handled here. Nothing here decides availability; the planner already did.
 */

import type { CurrentWorkActionExecutionPlan } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

/** The question asked before a destructive plan runs, by plan kind. The family is told, so the operator is asked. */
const CONFIRMATION: Partial<Record<CurrentWorkActionExecutionPlan["kind"], string>> = {
    cancel_tour: "Cancel this tour? The family will be notified that it is cancelled.",
};

export function runCurrentWorkPlanInline(
    plan: CurrentWorkActionExecutionPlan,
    deps: {
        mutation?: FocusPanelMutation;
        confirm?: (message: string) => boolean;
        report?: (message: string) => void;
    },
): boolean {
    if (plan.kind !== "cancel_tour") return false;
    const cancel = deps.mutation?.tour?.cancelTour;
    const report = deps.report ?? ((m: string) => window.alert(m));
    if (!cancel) {
        report("Tour cancellation is not available right now.");
        return true;
    }
    const ask = deps.confirm ?? ((m: string) => window.confirm(m));
    if (!ask(CONFIRMATION[plan.kind] ?? "Continue?")) return true;
    void cancel(plan.bookingId).then((result) => {
        if (!result.ok) report(result.error ?? "The tour could not be cancelled.");
    });
    return true;
}
