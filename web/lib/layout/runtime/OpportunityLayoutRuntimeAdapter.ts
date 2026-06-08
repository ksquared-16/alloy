/**
 * OpportunityLayoutRuntimeAdapter — the canonical VM/data → layout-runtime record adapter.
 *
 * Doctrine (Layout V2 convergence):
 *  - VM/data supplies VALUES only; the resolved LayoutDoc owns structure/refKeys.
 *  - `contact`  → the Person record (primary_contact relation, entityType "person").
 *  - `children` → customer_member / enrollment-child context (enrollment_children rows).
 *  - Missing values are emitted as empty bindings; the renderer shows `—` for them.
 *
 * This module is the single named entry point the runtime drawer/queue surfaces bind
 * to. It wraps the pure mapper {@link buildOpportunityLayoutRuntimeRecordFromVm} and
 * adds a per-drawer-open output cache so repeated renders within one open (tab
 * switches, re-renders) reuse the adapted record instead of re-projecting the VM.
 */

import {
    buildOpportunityLayoutRuntimeRecordFromVm,
    type BuildOpportunityLayoutRuntimeRecordInput,
} from "./buildOpportunityLayoutRuntimeRecordFromVm";
import type { ProofRuntimeRecord } from "./proofRecordContext";

export type OpportunityLayoutRuntimeAdapterInput = BuildOpportunityLayoutRuntimeRecordInput;

/**
 * Pure projection: VM paint record → operator-safe layout runtime record.
 *
 * Stateless; safe to call from server or client. Prefer the cached adapter
 * ({@link createOpportunityLayoutRuntimeAdapter}) on the client render path.
 */
export function adaptOpportunityVmToLayoutRuntimeRecord(
    input: OpportunityLayoutRuntimeAdapterInput,
): ProofRuntimeRecord {
    return buildOpportunityLayoutRuntimeRecordFromVm(input);
}

/**
 * Cheap content signature for the adapter cache. Captures the identity + the
 * fields that change what the adapter emits within a single drawer open
 * (status, last write, child roster). Avoids hashing the whole VM record.
 */
export function computeOpportunityAdapterCacheKey(input: OpportunityLayoutRuntimeAdapterInput): string {
    const vm = input.vmRecord ?? {};
    const children = Array.isArray(vm._inquiry_children) ? vm._inquiry_children : [];
    const childSig = children
        .map((c) => {
            const row = (c ?? {}) as Record<string, unknown>;
            return `${String(row.id ?? "")}:${String(row.updated_at ?? "")}`;
        })
        .join(",");
    return [
        input.opportunityId ?? "",
        String(input.statusDisplay ?? ""),
        String(vm.updated_at ?? ""),
        String(vm.status_key ?? ""),
        String(vm._status_display ?? ""),
        `${children.length}#${childSig}`,
    ].join("|");
}

export type OpportunityLayoutRuntimeAdapter = {
    /** Adapt the VM record, reusing the cached projection when unchanged. */
    adapt(input: OpportunityLayoutRuntimeAdapterInput): ProofRuntimeRecord;
    /** Drop the cached projection (call when the drawer closes / record changes). */
    reset(): void;
};

/**
 * Create a per-drawer-open adapter instance. Memoizes the last projection keyed by
 * {@link computeOpportunityAdapterCacheKey}; one entry is sufficient because a single
 * drawer open shows one opportunity at a time.
 */
export function createOpportunityLayoutRuntimeAdapter(): OpportunityLayoutRuntimeAdapter {
    let cachedKey: string | null = null;
    let cachedRecord: ProofRuntimeRecord | null = null;

    return {
        adapt(input) {
            const key = computeOpportunityAdapterCacheKey(input);
            if (cachedRecord != null && cachedKey === key) {
                return cachedRecord;
            }
            const record = adaptOpportunityVmToLayoutRuntimeRecord(input);
            cachedKey = key;
            cachedRecord = record;
            return record;
        },
        reset() {
            cachedKey = null;
            cachedRecord = null;
        },
    };
}
