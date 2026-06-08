import {
    drawerViewModelCutoverFlagSnapshot,
    safeLogDrawerViewModelCutover,
    type DrawerViewModelCutoverLogPayload,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover";

export class DrawerViewModelHardCutoverError extends Error {
    readonly code: string;
    readonly entityType: string;
    readonly skipReason: string | null;

    constructor(
        entityType: string,
        message: string,
        code: string,
        skipReason: string | null = null
    ) {
        super(message);
        this.name = "DrawerViewModelHardCutoverError";
        this.entityType = entityType;
        this.code = code;
        this.skipReason = skipReason;
    }
}

export type DrawerViewModelLoadFailureReason =
    | "cutover_disabled"
    | "fetch_failed"
    | "skipped"
    | "not_structure_settled"
    | "composed_not_ready";

export type DrawerViewModelLoadFailure = {
    ok: false;
    reason: DrawerViewModelLoadFailureReason;
    skip_reason?: string;
};

export function throwDrawerViewModelHardCutoverFailure(params: {
    entityType: string;
    entityId: string;
    result: DrawerViewModelLoadFailure;
    message: string;
    code: string;
    skipReason?: string | null;
    extraLog?: Partial<DrawerViewModelCutoverLogPayload>;
}): never {
    safeLogDrawerViewModelCutover("hard_cutover_failure", {
        entity_type: params.entityType,
        entity_id: params.entityId,
        ...drawerViewModelCutoverFlagSnapshot(params.entityType),
        drawer_vm_open_committed: false,
        drawer_vm_fallback_reason: params.code,
        open_path: null,
        ...params.extraLog,
    });
    throw new DrawerViewModelHardCutoverError(
        params.entityType,
        params.message,
        params.code,
        params.skipReason ?? (params.result.reason === "skipped" ? (params.result.skip_reason ?? null) : null)
    );
}
