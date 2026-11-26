/**
 * Configuration Continuity — mutation invalidation bus (Checkpoint A).
 *
 * Domains publish after confirmed saves; listeners refresh owned caches without
 * remounting the Organization shell. Complements (does not replace) the existing
 * `admin-entity-saved` DOM event used by Locations.
 */

import { markConfigurationContinuity } from "@/lib/configRuntime/configurationContinuity";

export type ConfigurationInvalidationScope =
    | "organization"
    | "locations"
    | "programs"
    | "commercial"
    | "all";

export type ConfigurationInvalidationEvent = {
    scope: ConfigurationInvalidationScope;
    reason: string;
    entityId?: string | null;
    atMs: number;
};

type Listener = (event: ConfigurationInvalidationEvent) => void;

const listeners = new Set<Listener>();

export function subscribeConfigurationInvalidation(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function publishConfigurationInvalidation(
    scope: ConfigurationInvalidationScope,
    reason: string,
    entityId?: string | null,
): void {
    const event: ConfigurationInvalidationEvent = {
        scope,
        reason,
        entityId: entityId ?? null,
        atMs: Date.now(),
    };
    markConfigurationContinuity("invalidated", {
        scope,
        reason,
        entity_id: entityId ?? null,
    });
    for (const listener of listeners) {
        try {
            listener(event);
        } catch {
            /* listener errors must not break publishers */
        }
    }
    if (typeof window !== "undefined") {
        window.dispatchEvent(
            new CustomEvent("alloy-configuration-invalidated", { detail: event }),
        );
    }
}

/** Test-only reset. */
export function resetConfigurationInvalidationForTests(): void {
    listeners.clear();
}
