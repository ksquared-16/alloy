/**
 * Configuration Object concern registry helpers (Checkpoint C.5).
 */

import type {
    ConfigurationObjectConcernDefinition,
    ConfigurationObjectWorkspaceDescriptor,
} from "@/lib/configRuntime/configurationObject/types";

export function visibleConfigurationObjectConcerns(
    concerns: readonly ConfigurationObjectConcernDefinition[],
): ConfigurationObjectConcernDefinition[] {
    return [...concerns]
        .filter((c) => c.visible && c.permissionAllowed)
        .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function resolveActiveConfigurationObjectConcern(
    descriptor: ConfigurationObjectWorkspaceDescriptor,
    rawConcern: string | string[] | null | undefined,
): { concern: string; normalized: boolean } {
    const value = Array.isArray(rawConcern) ? rawConcern[0] : rawConcern;
    const trimmed = String(value ?? "").trim();
    const visible = visibleConfigurationObjectConcerns(descriptor.concerns);
    const keys = new Set(visible.map((c) => c.key));
    if (!trimmed) {
        return { concern: descriptor.defaultConcernKey, normalized: false };
    }
    if (keys.has(trimmed)) {
        return { concern: trimmed, normalized: false };
    }
    // Hidden/forbidden concerns fail closed to default (not leak existence).
    return { concern: descriptor.defaultConcernKey, normalized: true };
}

export function configurationObjectConcernHref(
    descriptor: ConfigurationObjectWorkspaceDescriptor,
    objectId: string,
    concern?: string | null,
    itemId?: string | null,
): string {
    const params = new URLSearchParams();
    const id = String(objectId ?? "").trim();
    if (id) params.set(descriptor.objectIdQueryParam, id);
    const concernKey = String(concern ?? "").trim() || descriptor.defaultConcernKey;
    if (concernKey !== descriptor.defaultConcernKey) {
        params.set(descriptor.concernQueryParam, concernKey);
    }
    const item = String(itemId ?? "").trim();
    if (item && descriptor.itemIdQueryParam) {
        params.set(descriptor.itemIdQueryParam, item);
    }
    const qs = params.toString();
    return qs ? `${descriptor.basePath}?${qs}` : descriptor.basePath;
}

export function configurationObjectCollectionHref(
    descriptor: ConfigurationObjectWorkspaceDescriptor,
): string {
    return descriptor.basePath;
}
