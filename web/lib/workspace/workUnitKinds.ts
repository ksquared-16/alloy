/**
 * Logical work-unit classification (code-first; DB `work_units` rows align by `key`).
 * Does not change visual resolver — used for routing / exception semantics only.
 */
export type WorkUnitKind = "throughput" | "exception" | "standard";

export const NEEDS_ATTENTION_WORK_UNIT = {
    key: "needs_attention" as const,
    kind: "exception" as const satisfies WorkUnitKind,
};
