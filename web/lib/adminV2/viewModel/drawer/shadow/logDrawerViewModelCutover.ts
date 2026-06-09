import {
    adminV2OpportunityDrawerVmCutoverEnabled,
    adminV2PersonDrawerVmCutoverEnabled,
    adminV2ChildDrawerVmCutoverEnabled,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";
import { perfDebugTraceEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

export type DrawerViewModelCutoverLogPayload = {
    entity_type?: string;
    entity_id?: string;
    opportunity_id?: string;
    person_id?: string;
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

export function drawerViewModelCutoverFlagSnapshot(entityType?: string): {
    drawer_vm_cutover_flag_enabled: boolean;
    drawer_vm_cutover_flag_value: string | null;
} {
    const envByEntity: Record<string, string> = {
        opportunity: "NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH",
        person: "NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH",
        child: "NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM_KILL_SWITCH",
    };
    const key = entityType ? envByEntity[entityType] : "NEXT_PUBLIC_ADMINV2_DRAWER_VM";
    const raw = key ? process.env[key] : process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
    const enabled =
        entityType === "person" ? adminV2PersonDrawerVmCutoverEnabled()
        : entityType === "child" ? adminV2ChildDrawerVmCutoverEnabled()
        : adminV2OpportunityDrawerVmCutoverEnabled();
    return {
        drawer_vm_cutover_flag_enabled: enabled,
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
    if (!perfDebugTraceEnabled()) return;
    perfDrawer(`vm_cutover_${event}`, {
        entity_type: payload.entity_type,
        entity_id: payload.entity_id ?? payload.opportunity_id ?? payload.person_id,
        source: payload.open_path ?? "cutover",
    });
}
