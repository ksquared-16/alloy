import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";

export type DrawerViewModelCutoverLogPayload = {
    opportunity_id?: string;
    drawer_vm_cutover_flag_enabled: boolean;
    /** Raw build-time env echo (undefined when not set at build). */
    drawer_vm_cutover_flag_value?: string | null;
    drawer_vm_open_attempted?: boolean;
    drawer_vm_open_committed?: boolean;
    drawer_vm_fallback_reason?: string | null;
    open_path?: "legacy" | "view_model" | null;
    primary_hydrate_skipped?: boolean;
    pipeline_pinned?: boolean;
};

export function drawerViewModelCutoverFlagSnapshot(): {
    drawer_vm_cutover_flag_enabled: boolean;
    drawer_vm_cutover_flag_value: string | null;
} {
    const raw = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
    return {
        drawer_vm_cutover_flag_enabled: adminV2DrawerViewModelCutoverEnabled(),
        drawer_vm_cutover_flag_value: raw == null ? null : String(raw),
    };
}

/** Never throws — cutover diagnostics must not affect drawer UX. */
export function safeLogDrawerViewModelCutover(event: string, payload: DrawerViewModelCutoverLogPayload): void {
    try {
        logDrawerViewModelCutover(event, payload);
    } catch {
        /* best-effort only */
    }
}

export function logDrawerViewModelCutover(event: string, payload: DrawerViewModelCutoverLogPayload): void {
    if (typeof window === "undefined") return;
    console.info(`[drawer-vm-cutover:${event}]`, payload);
}
