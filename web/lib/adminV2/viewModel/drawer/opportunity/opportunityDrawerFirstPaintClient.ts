import { tourBookingsFromFirstPaintData } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies";
import {
    opportunityDrawerVmFirstPaintDependencySettled,
    opportunityDrawerVmShouldRefetchFirstPaintDependency,
    opportunityDrawerViewModelFirstPaintSettled,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelFirstPaint";
import type {
    OpportunityDrawerFirstPaintDependencyKey,
    OpportunityDrawerViewModel,
} from "@/lib/adminV2/viewModel/drawer/types";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

export {
    opportunityDrawerViewModelFirstPaintSettled,
    opportunityDrawerVmFirstPaintDependencySettled,
    opportunityDrawerVmShouldRefetchFirstPaintDependency,
};

export function tourBookingsFromOpportunityDrawerVm(
    vm: Pick<OpportunityDrawerViewModel, "first_paint"> | null | undefined
): TourBookingRow[] {
    if (!vm?.first_paint?.data) return [];
    return tourBookingsFromFirstPaintData(vm.first_paint.data);
}

export function vmFirstPaintBlocksClientFetch(
    vm: Pick<OpportunityDrawerViewModel, "first_paint"> | null | undefined,
    key: OpportunityDrawerFirstPaintDependencyKey
): boolean {
    return opportunityDrawerVmFirstPaintDependencySettled(vm, key);
}
