/** Actionable lifecycle-builder API errors (avoid generic "Not found"). */

export function lifecycleBuilderDepartmentScopeError(departmentId: string): string {
    return `Department not in workspace scope (department_id: ${departmentId})`;
}

export function lifecycleBuilderDepartmentNotFoundError(departmentId: string): string {
    return `Department not found (department_id: ${departmentId})`;
}

export function lifecycleBuilderV1MissingError(departmentId: string): string {
    return `lifecycle_builder_v1 is not configured on department (department_id: ${departmentId})`;
}

export function lifecycleBuilderProcessNotFoundError(processId: string, departmentId: string): string {
    return `Process not found in lifecycle_builder_v1 (process_id: ${processId}, department_id: ${departmentId})`;
}

export function departmentMetadataHasLifecycleBuilderV1(metadata: unknown): boolean {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    return Object.prototype.hasOwnProperty.call(metadata, "lifecycle_builder_v1");
}
