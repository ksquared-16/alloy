import { adminV2DrawerViewModelShadowEnabled } from "@/lib/adminV2/viewModel/drawer/shadow/drawerViewModelShadowGate";
import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";
import { drawerViewModelCutoverFlagSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover";

export type DrawerViewModelRuntimeFlagsSummary = {
    drawer_vm_shadow_flag_enabled: boolean;
    drawer_vm_cutover_flag_enabled: boolean;
    drawer_vm_cutover_flag_value: string | null;
    /** Reminder: NEXT_PUBLIC_* flags are inlined at build time — env changes require redeploy. */
    build_time_public_env: true;
};

/** Server/Vercel — one line per VM compose when shadow or cutover flag is on. */
export function logDrawerViewModelRuntimeFlagsServerSummary(): void {
    if (!adminV2DrawerViewModelShadowEnabled() && !adminV2DrawerViewModelCutoverEnabled()) return;
    try {
        const cutover = drawerViewModelCutoverFlagSnapshot();
        console.info("[drawer-vm-runtime:flags]", {
            drawer_vm_shadow_flag_enabled: adminV2DrawerViewModelShadowEnabled(),
            drawer_vm_cutover_flag_enabled: cutover.drawer_vm_cutover_flag_enabled,
            drawer_vm_cutover_flag_value: cutover.drawer_vm_cutover_flag_value,
            build_time_public_env: true,
        } satisfies DrawerViewModelRuntimeFlagsSummary);
    } catch {
        /* best-effort only */
    }
}
