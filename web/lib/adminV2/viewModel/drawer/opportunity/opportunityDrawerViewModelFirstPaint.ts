import { drawerFirstPaintDependenciesSettled, drawerViewModelFirstPaintSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";
import type {
    OpportunityDrawerFirstPaintContract,
    OpportunityDrawerFirstPaintDependencyKey,
    OpportunityDrawerFirstPaintDependencyState,
    OpportunityDrawerFirstPaintViewportSlot,
    OpportunityDrawerViewModel,
    StatusControlVm,
} from "@/lib/adminV2/viewModel/drawer/types";

export {
    OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_VIEWPORT_SLOTS as OPPORTUNITY_DRAWER_WORKFLOW_V1_FIRST_PAINT_BASE_SLOTS,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerFirstViewportContract";

export function opportunityDrawerViewModelFirstPaintSettled(
    vm: Pick<OpportunityDrawerViewModel, "first_paint"> | null | undefined
): boolean {
    return drawerViewModelFirstPaintSettled(vm);
}

export function opportunityDrawerVmFirstPaintDependencySettled(
    vm: Pick<OpportunityDrawerViewModel, "first_paint"> | null | undefined,
    key: OpportunityDrawerFirstPaintDependencyKey
): boolean {
    if (!vm?.first_paint?.settled) return false;
    const dep = vm.first_paint.dependencies.find((d) => d.key === key);
    if (!dep) return false;
    return dep.status === "ready" || dep.status === "empty";
}

export function opportunityDrawerVmShouldRefetchFirstPaintDependency(
    vm: Pick<OpportunityDrawerViewModel, "first_paint"> | null | undefined,
    key: OpportunityDrawerFirstPaintDependencyKey
): boolean {
    return !opportunityDrawerVmFirstPaintDependencySettled(vm, key);
}

export function buildOpportunityDrawerFirstPaintContract(params: {
    viewport_slots: OpportunityDrawerFirstPaintViewportSlot[];
    dependencies: OpportunityDrawerFirstPaintDependencyState[];
    data: Partial<Record<OpportunityDrawerFirstPaintDependencyKey, unknown>>;
    deferred?: OpportunityDrawerFirstPaintDependencyKey[];
    background?: OpportunityDrawerFirstPaintDependencyKey[];
}): OpportunityDrawerFirstPaintContract {
    const settled = drawerFirstPaintDependenciesSettled(params.dependencies);
    return {
        settled,
        viewport_slots: params.viewport_slots,
        dependencies: params.dependencies,
        data: params.data,
        deferred: params.deferred ?? [],
        background: params.background ?? [],
    };
}

/** Ensures workflow_v1 VM declares a settled first-paint contract with required slots. */
export function opportunityDrawerFirstPaintContractValid(
    vm: Pick<OpportunityDrawerViewModel, "layout" | "first_paint">
): boolean {
    if (!vm.first_paint?.settled) return false;
    if (vm.layout.mode !== "workflow_v1") return false;
    const required = new Set<OpportunityDrawerFirstPaintViewportSlot>([
        "header",
        "status",
        "location",
        "actions",
        "tabs",
        "lead_summary",
        "tour_slot",
    ]);
    const geometry = vm.layout.shell.geometry;
    if (geometry.summary_right_column_reserved === true) {
        required.add("tasks_summary");
        required.add("reminders_summary");
    }
    const present = new Set(vm.first_paint.viewport_slots);
    for (const slot of required) {
        if (!present.has(slot)) return false;
    }
    return drawerFirstPaintDependenciesSettled(vm.first_paint.dependencies);
}

export function statusDefsFromViewModelStatusControl(status: StatusControlVm): {
    status_key: string;
    status_label: string;
    sort_order: number;
    is_active: boolean;
}[] {
    if (status.renderAs === "dropdown") {
        return status.options.map((o) => ({
            status_key: o.status_key,
            status_label: o.label,
            sort_order: o.sort_order,
            is_active: true,
        }));
    }
    if (status.renderAs === "readonly_pill") {
        return [
            {
                status_key: status.label,
                status_label: status.label,
                sort_order: 0,
                is_active: true,
            },
        ];
    }
    return [];
}
