/**
 * Canonical marker for departments created by the primary Lifecycle Builder.
 * Legacy flags (lifecycle_activation_owned_v1, activation_owned) are read for migration only.
 */

import { LIFECYCLE_ACTIVATION_METADATA_KEY, lifecycleActivationFromMetadata } from "@/lib/lifecycle/lifecycleActivationConfig";

export const LIFECYCLE_BUILDER_OWNED_METADATA_KEY = "lifecycle_builder_owned_v1" as const;

export type LifecycleBuilderOwnedV1 = {
    source: "lifecycle_builder";
    created_by: string;
    created_at: string;
    process_id: string | null;
};

export const LIFECYCLE_ACTIVATION_OWNED_DEPT_FLAG = "lifecycle_activation_owned_v1" as const;

function parseBuilderOwnedV1(raw: unknown): LifecycleBuilderOwnedV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    if (o.source !== "lifecycle_builder") return null;
    const created_by = typeof o.created_by === "string" ? o.created_by.trim() : "";
    const created_at = typeof o.created_at === "string" ? o.created_at.trim() : "";
    if (!created_by || !created_at) return null;
    const process_id =
        o.process_id === null || o.process_id === undefined
            ? null
            : typeof o.process_id === "string"
              ? o.process_id.trim() || null
              : null;
    return { source: "lifecycle_builder", created_by, created_at, process_id };
}

/** True when department is a dedicated builder-owned runtime lifecycle (canonical or legacy marker). */
export function isLifecycleBuilderOwnedDepartmentMetadata(metadata: unknown): boolean {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return false;
    const m = metadata as Record<string, unknown>;
    if (parseBuilderOwnedV1(m[LIFECYCLE_BUILDER_OWNED_METADATA_KEY])) return true;
    if (m[LIFECYCLE_ACTIVATION_OWNED_DEPT_FLAG] === true) return true;
    const activation = lifecycleActivationFromMetadata(metadata);
    return activation?.activation_owned === true;
}

export function lifecycleBuilderOwnedFromMetadata(metadata: unknown): LifecycleBuilderOwnedV1 | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return parseBuilderOwnedV1((metadata as Record<string, unknown>)[LIFECYCLE_BUILDER_OWNED_METADATA_KEY]);
}

export function buildLifecycleBuilderOwnedMetadata(params: {
    created_by: string;
    process_id?: string | null;
    created_at?: string;
}): Record<string, unknown> {
    const created_by = params.created_by.trim();
    if (!created_by) throw new Error("created_by is required for lifecycle_builder_owned_v1");
    const owned: LifecycleBuilderOwnedV1 = {
        source: "lifecycle_builder",
        created_by,
        created_at: params.created_at ?? new Date().toISOString(),
        process_id: params.process_id?.trim() ? params.process_id.trim() : null,
    };
    return { [LIFECYCLE_BUILDER_OWNED_METADATA_KEY]: owned };
}

export function mergeLifecycleBuilderOwnedIntoMetadata(
    metadata: Record<string, unknown>,
    patch: Partial<LifecycleBuilderOwnedV1> & { created_by?: string }
): Record<string, unknown> {
    const existing = parseBuilderOwnedV1(metadata[LIFECYCLE_BUILDER_OWNED_METADATA_KEY]);
    const next: LifecycleBuilderOwnedV1 = {
        source: "lifecycle_builder",
        created_by: (patch.created_by ?? existing?.created_by ?? "").trim(),
        created_at: patch.created_at ?? existing?.created_at ?? new Date().toISOString(),
        process_id:
            patch.process_id !== undefined ? (patch.process_id?.trim() ? patch.process_id.trim() : null) : (existing?.process_id ?? null),
    };
    if (!next.created_by) throw new Error("created_by is required");
    return { ...metadata, [LIFECYCLE_BUILDER_OWNED_METADATA_KEY]: next };
}

/** Department metadata for POST /api/admin/departments when creating a new lifecycle. */
export function newBuilderOwnedDepartmentMetadata(createdBy: string): Record<string, unknown> {
    return buildLifecycleBuilderOwnedMetadata({ created_by: createdBy, process_id: null });
}

/** @deprecated Use isLifecycleBuilderOwnedDepartmentMetadata */
export const isActivationOwnedDepartmentMetadata = isLifecycleBuilderOwnedDepartmentMetadata;

/** @deprecated Use newBuilderOwnedDepartmentMetadata */
export function activationOwnedDepartmentMetadata(): Record<string, unknown> {
    return { [LIFECYCLE_ACTIVATION_OWNED_DEPT_FLAG]: true };
}

export function canDeleteBuilderOwnedLifecycle(metadata: unknown): boolean {
    return isLifecycleBuilderOwnedDepartmentMetadata(metadata);
}
