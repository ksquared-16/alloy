/** Entity-agnostic first-paint contract — reusable by Opportunity, Person, Child drawer VMs. */

export type DrawerFirstPaintDependencyDisposition = "first_paint_required" | "background_deferred";

export type DrawerFirstPaintDependencyState<TKey extends string = string> = {
    key: TKey;
    disposition: DrawerFirstPaintDependencyDisposition;
    status: "ready" | "empty" | "pending" | "deferred";
    satisfied_by: "server_fetch" | "record_metadata" | "pending" | "not_required";
};

export type DrawerFirstPaintContract<TKey extends string = string, TSlot extends string = string> = {
    /** True when every first_paint_required dependency is ready or known-empty. */
    settled: boolean;
    /** UI regions included in the first viewport for this drawer type. */
    viewport_slots: TSlot[];
    dependencies: DrawerFirstPaintDependencyState<TKey>[];
    /** Resolved payloads keyed by dependency — authoritative for first paint. */
    data: Partial<Record<TKey, unknown>>;
    /** Dependencies explicitly deferred past first paint. */
    deferred: TKey[];
    /** Dependencies allowed to refresh invisibly after paint. */
    background: TKey[];
};
