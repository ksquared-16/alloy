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
import { resolveFocusPanelMutationOpportunityId } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import { prefetchTourSchedule } from "@/lib/tours/tourScheduleWarmCache";
import { prefetchTourInvitationPrepare } from "@/lib/tours/tourInvitationPrepareWarmCache";
import { prefetchActiveDrawerFamilyWorkspace } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import { prefetchEligibleEnrollmentChildren } from "./eligibleEnrollmentChildrenWarmCache";
import { prefetchFormDelivery } from "./formDeliveryWarmCache";
import { commandTimingMark } from "./commandSurfaceTiming";

/**
 * The FAMILY opportunity id every capability host warms against — never the raw subject id.
 *
 * Under child attention the subject is the child / process-instance, while these hosts are all
 * keyed by the family opportunity (Record of Truth): recipients, tour bookings, form delivery and
 * eligible children are family-scoped resources. Passing the subject straight through produced
 * `?entity_type=opportunities&entity_id=<participation>` and `/tours/opportunities/<participation>`,
 * which 404 on every child selection — the same class as warming an opportunity VM with a child id.
 *
 * `resolveFocusPanelMutationOpportunityId` already encodes the ownership rule
 * (`child.family_opportunity_id` wins), so EVERY branch resolves through here rather than reaching
 * for `context.subject.id`. One seam, not a fix per capability.
 */
function resolveWarmOpportunityId(context: OperationalContext): string {
    return resolveFocusPanelMutationOpportunityId({
        subjectId: context.subject.id,
        grain: context.grain ?? null,
        truth: (context.truth ?? null) as Record<string, unknown> | null,
    });
}

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
            const opportunityId = resolveWarmOpportunityId(context);
            // Always preload the composer chunk — Message / Contact Family / Tour share one host.
            // Without this, Message opened a cold dynamic() import and lost the race to elevation dismiss.
            preloadCommandPanelChunk(
                () => import("@/components/admin/communications/CommunicationsDrawerSection"),
            );
            prefetchActiveDrawerFamilyWorkspace("opportunities", opportunityId);
            if (actionKey === "send_tour_invitation") {
                commandTimingMark("send_tour_invitation", "intent");
                // Mint + template render is the slow path — start prepare on hover/focus.
                prefetchTourInvitationPrepare(opportunityId);
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
            prefetchTourSchedule(resolveWarmOpportunityId(context), tour.locationId);
            return;
        }
        case "form_delivery": {
            // The form-delivery host — warm configured forms + eligible recipients + related subjects.
            prefetchFormDelivery(resolveWarmOpportunityId(context));
            return;
        }
        case "subject_selector": {
            // Move to Waitlist — warm eligible children + mark intent so click→shell timings start early.
            commandTimingMark(actionKey || "waitlist_child", "intent");
            prefetchEligibleEnrollmentChildren(resolveWarmOpportunityId(context));
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
