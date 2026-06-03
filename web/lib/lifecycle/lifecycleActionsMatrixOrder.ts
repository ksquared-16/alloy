/**
 * Persisted display order for Lifecycle Actions Matrix rows.
 */

import type { LifecycleBaseActionKey } from "@/lib/lifecycle/lifecycleStageBaseActions";
import { LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER } from "@/lib/lifecycle/lifecycleActionsMatrix";

export const LIFECYCLE_ACTIONS_MATRIX_ORDER_METADATA_KEY = "lifecycle_actions_matrix_order_v1" as const;

export type LifecycleActionsMatrixOrderV1 = {
    version: 1;
    base_action_keys: LifecycleBaseActionKey[];
};

export function parseLifecycleActionsMatrixOrder(
    metadata: Record<string, unknown> | null | undefined
): LifecycleActionsMatrixOrderV1 | null {
    if (!metadata || typeof metadata !== "object") return null;
    const root = metadata[LIFECYCLE_ACTIONS_MATRIX_ORDER_METADATA_KEY];
    if (!root || typeof root !== "object" || Array.isArray(root)) return null;
    if ((root as { version?: unknown }).version !== 1) return null;
    const raw = (root as { base_action_keys?: unknown }).base_action_keys;
    if (!Array.isArray(raw)) return null;
    const allowed = new Set(LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER);
    const base_action_keys = raw
        .map((k) => String(k ?? "").trim())
        .filter((k): k is LifecycleBaseActionKey => allowed.has(k as LifecycleBaseActionKey));
    if (!base_action_keys.length) return null;
    return { version: 1, base_action_keys };
}

export function buildLifecycleActionsMatrixOrderPatch(
    base_action_keys: readonly LifecycleBaseActionKey[],
    existingMetadata: Record<string, unknown> | null
): Record<string, unknown> {
    const allowed = new Set(LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER);
    const keys = base_action_keys.filter((k) => allowed.has(k));
    return {
        [LIFECYCLE_ACTIONS_MATRIX_ORDER_METADATA_KEY]: {
            version: 1,
            base_action_keys: keys,
        },
    };
}

export function sortBaseActionKeysByMatrixOrder<T extends { base_action_key: LifecycleBaseActionKey }>(
    rows: readonly T[],
    order: LifecycleActionsMatrixOrderV1 | null
): T[] {
    if (!order?.base_action_keys.length) return [...rows];
    const index = new Map(order.base_action_keys.map((k, i) => [k, i]));
    return [...rows].sort((a, b) => {
        const ai = index.get(a.base_action_key) ?? 999;
        const bi = index.get(b.base_action_key) ?? 999;
        if (ai !== bi) return ai - bi;
        return a.base_action_key.localeCompare(b.base_action_key);
    });
}
