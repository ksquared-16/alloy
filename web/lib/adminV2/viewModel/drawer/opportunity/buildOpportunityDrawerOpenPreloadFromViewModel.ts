import type { OpportunityDrawerOperationalBootstrapResponse } from "@/lib/admin/opportunityDrawerOperationalBootstrapTypes";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import type { ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { emptyResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { drawerShellToOpportunityRecordContract } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/compileShell";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export type OpportunityDrawerViewModelPreload = OpportunityDrawerOpenPreload & {
    openPath: "view_model";
    viewModel: OpportunityDrawerViewModel;
};

export function isOpportunityDrawerViewModelPreload(
    preload: OpportunityDrawerOpenPreload
): preload is OpportunityDrawerViewModelPreload {
    return preload.openPath === "view_model" && preload.viewModel != null;
}

function paintRecordFromViewModel(vm: OpportunityDrawerViewModel): Record<string, unknown> {
    return {
        ...vm.above_fold.record,
        id: vm.entity.id,
        _record_surface: "full",
    };
}

function headerActionsFromViewModel(header: OpportunityDrawerViewModel["actions"]["header"]): ResolvedActionsBySlot {
    return { ...emptyResolvedActionsBySlot(), header };
}

function bootstrapFromViewModel(
    vm: OpportunityDrawerViewModel,
    paintRecord: Record<string, unknown>
): OpportunityDrawerOperationalBootstrapResponse {
    const layoutConfig = vm.layout.shell.layout_config_snapshot as RecordLayoutConfigJson;
    const deptId = vm.workspace.department_id;
    const wuId = vm.workspace.work_unit_id;

    return {
        entity: paintRecord,
        record_layout: {
            source: "global_template",
            key: vm.layout.shell.layout_version,
            config_json: layoutConfig,
            inquiry_drawer_mode: "workflow_v1",
        },
        record_header_actions: headerActionsFromViewModel(vm.actions.header),
        work_unit:
            wuId && deptId ?
                {
                    id: wuId,
                    department_id: deptId,
                    queue_definition: null,
                }
            :   null,
        workspace_scope: {
            department_id: deptId,
            work_unit_id: wuId,
        },
        oper_trust_preview: vm.header.oper_trust_preview,
        timing: {
            route_gate_ms: 0,
            phases_ms: vm.timing.phases_ms,
            attention_resolver_passes: 0,
        },
    };
}

export function buildOpportunityDrawerOpenPreloadFromViewModel(
    viewModel: OpportunityDrawerViewModel
): OpportunityDrawerViewModelPreload {
    const paintRecord = paintRecordFromViewModel(viewModel);
    const headerActions = headerActionsFromViewModel(viewModel.actions.header);
    const bootstrap = bootstrapFromViewModel(viewModel, paintRecord);

    return {
        opportunityId: viewModel.entity.id,
        openPath: "view_model",
        viewModel,
        bootstrap,
        primaryEntity: paintRecord,
        fullEntity: null,
        headerActions,
        enrichmentHeldUntilInteraction: false,
    };
}

export function opportunityDrawerViewModelRecordShell(
    viewModel: OpportunityDrawerViewModel
): ReturnType<typeof drawerShellToOpportunityRecordContract> {
    return drawerShellToOpportunityRecordContract(viewModel.layout.shell);
}
