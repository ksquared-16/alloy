import type { ScheduledWorkHandler, ScheduledWorkHandlerKey } from "@/lib/scheduledWork/scheduledWorkTypes";

/**
 * THE REGISTRY — code-owned, and the whole of what the scheduler may run.
 *
 * A `handler_key` in the database is a NAME. It resolves here or it resolves
 * nowhere, so a row that named something unregistered cannot cause execution: it
 * fails terminally and stays visible. Configuration cannot introduce behaviour,
 * because behaviour is not configuration — which is what keeps this a platform
 * primitive rather than a way to run arbitrary work by inserting a row.
 */
const REGISTRY = new Map<ScheduledWorkHandlerKey, ScheduledWorkHandler>();

export function registerScheduledWorkHandler(
    key: ScheduledWorkHandlerKey,
    handler: ScheduledWorkHandler,
): void {
    const k = key.trim();
    if (!k) throw new Error("scheduled work handler key is required");
    // Re-registration under one key is ambiguous about which implementation runs,
    // and the answer would depend on module import order.
    if (REGISTRY.has(k)) throw new Error(`scheduled work handler already registered: ${k}`);
    REGISTRY.set(k, handler);
}

export function resolveScheduledWorkHandler(
    key: ScheduledWorkHandlerKey,
): ScheduledWorkHandler | null {
    return REGISTRY.get(key.trim()) ?? null;
}

export function registeredScheduledWorkHandlerKeys(): string[] {
    return [...REGISTRY.keys()].sort();
}

/** Test seam only. Never called by the runtime. */
export function __resetScheduledWorkRegistryForTests(): void {
    REGISTRY.clear();
}
