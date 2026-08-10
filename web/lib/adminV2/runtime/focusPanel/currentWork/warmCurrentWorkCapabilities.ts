/**
 * Warm-on-intent dispatcher for configured What's Next capabilities.
 *
 * The host does not know about tours, forms, or composers — it knows a capability by its declared
 * INTERACTION HOST (the resolved action surface, metadata not a label). This dispatcher maps that
 * host to the data the capability needs on open and warms it, so the centered host renders warmed
 * content synchronously and verifies freshness in the background. Keyed on the surface only — never
 * on an action name, stage, or process key. Add a case per capability host as they gain a preload.
 */
import { resolveCurrentWorkActionSurface } from "./resolveCurrentWorkActionSurface";
import { resolveOpportunityTourScheduleFromTruth } from "./resolveOpportunityTourScheduleFromTruth";
import type { CurrentWorkActionVM } from "./currentWorkSurfaceTypes";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { prefetchTourSchedule } from "@/lib/tours/tourScheduleWarmCache";
import { prefetchActiveDrawerFamilyWorkspace } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import { prefetchEligibleEnrollmentChildren } from "./eligibleEnrollmentChildrenWarmCache";
import { prefetchFormDelivery } from "./formDeliveryWarmCache";
import { commandTimingMark } from "./commandSurfaceTiming";

/** Best-effort dynamic chunk preload so centered hosts open without a blank pause. */
function preloadCommandPanelChunk(importer: () => Promise<unknown>): void {
    try {
        void importer();
    } catch {
        /* ignore */
    }
}

/** Warm the data a single action's capability host will need, from operator intent. Best-effort. */
export function warmCurrentWorkCapabilityOnIntent(
    action: CurrentWorkActionVM,
    context: OperationalContext,
): void {
    if (typeof window === "undefined") return;
    const surface = resolveCurrentWorkActionSurface(action);
    const actionKey = (action.handlerKey ?? action.actionRef ?? action.key).trim();
    switch (surface) {
        case "communications_composer": {
            // The communication capability's host — warm the family workspace VM (recipients, thread,
            // channel) so the composer opens with content instead of "Loading conversation…".
            prefetchActiveDrawerFamilyWorkspace("opportunities", context.subject.id);
            if (actionKey === "send_tour_invitation") {
                preloadCommandPanelChunk(
                    () => import("@/components/admin/focusPanel/cards/CurrentWorkTourInvitationPanel"),
                );
            }
            return;
        }
        case "inline_form": {
            if (actionKey === "add_child" || actionKey === "add_sibling") {
                preloadCommandPanelChunk(
                    () => import("@/components/admin/focusPanel/cards/CurrentWorkAddChildPanel"),
                );
                return;
            }
            // The scheduling capability's declared host — warm bookings + availability + rules.
            const tour = resolveOpportunityTourScheduleFromTruth(context.truth);
            prefetchTourSchedule(context.subject.id, tour.locationId);
            return;
        }
        case "form_delivery": {
            // The form-delivery host — warm configured forms + eligible recipients + related subjects.
            prefetchFormDelivery(context.subject.id);
            return;
        }
        case "subject_selector": {
            // Move to Waitlist — warm eligible children + mark intent so click→shell timings start early.
            commandTimingMark(actionKey || "waitlist_child", "intent");
            prefetchEligibleEnrollmentChildren(context.subject.id);
            return;
        }
        default:
            return;
    }
}

/** Warm every executable action's capability once the What's Next surface is visible (proactive). */
export function warmCurrentWorkCapabilitiesForActions(
    actions: readonly CurrentWorkActionVM[],
    context: OperationalContext,
): void {
    for (const action of actions) warmCurrentWorkCapabilityOnIntent(action, context);
}
