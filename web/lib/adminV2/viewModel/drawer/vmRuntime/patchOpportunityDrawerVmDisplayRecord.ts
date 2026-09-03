import { buildOpportunityDrawerHeaderMenuActions } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerHeaderMenuActions";
import {
    mergeOptimisticTourBookings,
    readOptimisticTourBookingFromOverview,
} from "@/lib/admin/opportunityDrawerTourBookingRefresh";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

const TERMINAL_TOUR_STATUSES = new Set(["canceled", "completed", "no_show"]);

function hasActiveTourBooking(bookings: TourBookingRow[]): boolean {
    return bookings.some((b) => {
        const sk = String(b.status_key ?? "").trim();
        return sk && !TERMINAL_TOUR_STATUSES.has(sk);
    });
}

function reconcileHeaderStatus(
    vm: OpportunityDrawerViewModel,
    nextRecord: Record<string, unknown>
): OpportunityDrawerViewModel["header"] {
    const nextStatusKey =
        typeof nextRecord.status_key === "string" ? nextRecord.status_key.trim() : "";
    if (!nextStatusKey) return vm.header;
    const status = vm.header.status;
    if (status.renderAs === "hidden") return vm.header;
    const fromOptions = status.options?.find((o) => o.status_key === nextStatusKey)?.label?.trim();
    if (!fromOptions || fromOptions === status.label) return vm.header;
    if (status.renderAs === "dropdown") {
        return {
            ...vm.header,
            status: { ...status, status_key: nextStatusKey, label: fromOptions },
        };
    }
    return {
        ...vm.header,
        status: { ...status, label: fromOptions, status_key: nextStatusKey },
    };
}

/**
 * Apply an in-place record patch to a settled opportunity drawer VM — tour metadata,
 * optimistic bookings, and optional header action relabel (schedule ↔ reschedule).
 */
export function patchOpportunityDrawerVmDisplayRecord(
    vm: OpportunityDrawerViewModel,
    nextRecord: Record<string, unknown>,
    resolvedHeaderActions?: ResolvedActionsBySlot | null
): OpportunityDrawerViewModel {
    const optimistic = readOptimisticTourBookingFromOverview(nextRecord);
    const prevBookings = vm.summaries.active_tour_bookings ?? [];
    const activeTourBookings =
        optimistic ?
            mergeOptimisticTourBookings(prevBookings, {
                id: optimistic.id,
                start_at: optimistic.start_at,
                timezone: optimistic.timezone,
                status_key: optimistic.status_key,
            } as TourBookingRow)
        :   prevBookings;

    const hasActiveTour = hasActiveTourBooking(activeTourBookings);
    let actions = vm.actions;
    if (resolvedHeaderActions) {
        actions = {
            ...vm.actions,
            header: resolvedHeaderActions.header ?? [],
            header_menu: buildOpportunityDrawerHeaderMenuActions(resolvedHeaderActions, hasActiveTour),
        };
    } else if (optimistic) {
        const resolved: ResolvedActionsBySlot = {
            ...emptyResolvedActionsBySlot(),
            header: vm.actions.header,
        };
        actions = {
            ...vm.actions,
            header: vm.actions.header,
            header_menu: buildOpportunityDrawerHeaderMenuActions(resolved, hasActiveTour),
        };
    }

    return {
        ...vm,
        header: reconcileHeaderStatus(vm, nextRecord),
        actions,
        above_fold: {
            ...vm.above_fold,
            record: nextRecord,
        },
        summaries: {
            ...vm.summaries,
            active_tour_bookings: activeTourBookings,
            // A patch that only reshapes ACTIVE rows cannot decide the Tour concept; keep what
            // the loader resolved from the full set rather than narrowing it here.
            operator_relevant_tour_booking:
                vm.summaries.operator_relevant_tour_booking ?? null,
        },
    };
}
