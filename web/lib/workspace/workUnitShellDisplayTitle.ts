import {
    readDepartmentPageCache,
    readWorkUnitPageCache,
} from "@/lib/workspace/adminV2WorkspaceSessionCache";

/** Deterministic fallback when work-unit name is not yet loaded — SSR and first client paint must match. */
export const WORK_UNIT_SHELL_DISPLAY_FALLBACK = "Work unit";

export function resolveWorkUnitShellDisplayTitle(params: {
    workUnitId?: string | null;
    workUnitName?: string | null;
}): string {
    const name = params.workUnitName?.trim();
    if (name) return name;
    return WORK_UNIT_SHELL_DISPLAY_FALLBACK;
}

/**
 * Session-cache lookup for work-unit shell title — **client-only after mount**.
 * Do not call during SSR or first render (hydration mismatch).
 */
export function readWorkUnitShellDisplayTitleFromSessionCache(params: {
    orgId: string;
    departmentId: string;
    workUnitId: string;
    principalUserId: string | null;
    accessScopeFingerprint: string;
}): string | null {
    const hit = readWorkUnitPageCache(
        params.orgId,
        params.departmentId,
        params.workUnitId,
        params.principalUserId,
        params.accessScopeFingerprint
    );
    const fromWu = hit?.workUnit?.name?.trim();
    if (fromWu) return fromWu;

    const deptHit = readDepartmentPageCache(
        params.orgId,
        params.departmentId,
        params.principalUserId,
        params.accessScopeFingerprint
    );
    const fromDeptList = deptHit?.workUnits?.find((w) => w.id === params.workUnitId)?.name?.trim();
    return fromDeptList || null;
}

/** Department KPI / oper row label — prefer configured work unit name over legacy hardcoded copy. */
export function resolveDeptWorkUnitDisplayLabel(wu: {
    name?: string | null;
    key?: string | null;
}): string {
    const name = wu.name?.trim();
    if (name) return name;
    const key = (wu.key ?? "").trim();
    if (key) {
        return key
            .split("_")
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }
    return WORK_UNIT_SHELL_DISPLAY_FALLBACK;
}
