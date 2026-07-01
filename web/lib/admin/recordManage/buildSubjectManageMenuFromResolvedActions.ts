import type { ResolvedActionForClient } from "@/lib/admin/actions/types";

/**
 * Subject-local Manage menu — same registry-backed catalog as command rail `header_menu`.
 * Manage is a filtered presentation of operational actions for the active record.
 */
export function buildSubjectManageMenuFromResolvedActions(
    actions: ResolvedActionForClient[] | null | undefined,
): ResolvedActionForClient[] {
    return Array.isArray(actions) ? actions : [];
}

/** True when Manage should use registry actions instead of legacy entity admin stubs. */
export function subjectManageMenuUsesRegistryActions(
    actions: ResolvedActionForClient[] | null | undefined,
): boolean {
    return actions !== undefined;
}
