/**
 * Proof binding value resolution (Phase 2).
 *
 * Binding-aware display resolution for LayoutRuntimePlan proof rendering.
 * Uses relation handles and computed keys — never surfaces raw FK/UUID ids
 * for relationship/reference/computed items.
 */

import { resolveItemValue, type ResolvedValue } from "../resolveItemValue";
import type { LayoutItem } from "../layoutV2";
import { classifyLayoutItemBinding, type LayoutItemBindingPlan } from "./classifyLayoutItemBinding";
import { isOpaqueIdValue, readProofComputed, readProofRelation, type ProofRuntimeRecord } from "./proofRecordContext";

export type ProofBindingResolution = ResolvedValue & {
    bindingClass: LayoutItemBindingPlan["bindingClass"];
    /** Related entity handle when applicable (relationship/reference). */
    relationHandle?: string | null;
    /** True for lifecycle-owned computed projections. */
    isComputed?: boolean;
    /** True when item is unsupported and omitted from render. */
    omitted?: boolean;
    /** Reason for placeholder/omission (proof diagnostics). */
    reason?: string;
};

function withBinding(base: ResolvedValue, binding: LayoutItemBindingPlan, extra: Partial<ProofBindingResolution> = {}): ProofBindingResolution {
    return {
        ...base,
        bindingClass: binding.bindingClass,
        ...extra,
    };
}

function formatFieldValue(raw: unknown, item: LayoutItem): ResolvedValue {
    return resolveItemValue({ [item.refKey]: raw, ...flattenRefKey(item.refKey, raw) }, item);
}

function flattenRefKey(refKey: string, raw: unknown): Record<string, unknown> {
    return { [refKey]: raw };
}

function safeDisplay(raw: unknown, item: LayoutItem): ResolvedValue {
    if (isOpaqueIdValue(raw)) {
        return { display: null, isPlaceholder: true, renderHint: item.renderHint ?? "text", raw: null };
    }
    if (raw === undefined || raw === null || raw === "") {
        return { display: null, isPlaceholder: true, renderHint: item.renderHint ?? "text", raw: null };
    }
    return formatFieldValue(raw, item);
}

function resolveRelationshipField(
    record: ProofRuntimeRecord,
    item: LayoutItem,
    binding: LayoutItemBindingPlan,
): ProofBindingResolution {
    const relationKey = binding.relationKey;
    if (!relationKey) {
        const direct = record[item.refKey];
        if (direct !== undefined && direct !== null && direct !== "") {
            return withBinding(safeDisplay(direct, item), binding);
        }
        return withBinding(
            { display: null, isPlaceholder: true, renderHint: item.renderHint ?? "text", raw: null },
            binding,
            { reason: "missing_relation_key" },
        );
    }

    const rel = readProofRelation(record, relationKey);
    const handle = rel?.handle ?? null;
    const fieldRaw = rel?.fields?.[binding.fieldKey] ?? record[item.refKey];

    const value = safeDisplay(fieldRaw, item);
    return withBinding(value, binding, {
        relationHandle: handle,
        reason: value.isPlaceholder ? "relation_field_unavailable" : undefined,
    });
}

function resolveReferenceField(
    record: ProofRuntimeRecord,
    item: LayoutItem,
    binding: LayoutItemBindingPlan,
): ProofBindingResolution {
    const relationKey = binding.relationKey;
    if (!relationKey) {
        return withBinding(
            { display: null, isPlaceholder: true, renderHint: item.renderHint ?? "text", raw: null },
            binding,
            { reason: "missing_relation_key" },
        );
    }

    const rel = readProofRelation(record, relationKey);
    const handle = rel?.handle ?? null;
    const fieldRaw = rel?.fields?.[binding.fieldKey];
    const displayRaw = fieldRaw ?? handle;

    if (!displayRaw || isOpaqueIdValue(displayRaw)) {
        return withBinding(
            { display: null, isPlaceholder: true, renderHint: item.renderHint ?? "text", raw: null },
            binding,
            { relationHandle: handle, reason: "reference_unavailable" },
        );
    }

    const value = safeDisplay(displayRaw, item);
    return withBinding(value, binding, { relationHandle: handle });
}

function resolveComputedProjection(
    record: ProofRuntimeRecord,
    item: LayoutItem,
    binding: LayoutItemBindingPlan,
): ProofBindingResolution {
    const computeKey = binding.computeKey;
    if (!computeKey) {
        return withBinding(
            { display: null, isPlaceholder: true, renderHint: item.renderHint ?? "text", raw: null },
            binding,
            { isComputed: true, reason: "missing_compute_key" },
        );
    }

    const raw = readProofComputed(record, computeKey) ?? record[item.refKey];
    if (raw === undefined || raw === null || raw === "" || isOpaqueIdValue(raw)) {
        return withBinding(
            { display: null, isPlaceholder: true, renderHint: item.renderHint ?? "text", raw: null },
            binding,
            { isComputed: true, reason: "computed_unavailable" },
        );
    }

    const value = safeDisplay(raw, item);
    return withBinding(value, binding, { isComputed: true });
}

/** Resolve one layout item using binding plan semantics (proof path only). */
export function resolveProofBindingValue(
    record: ProofRuntimeRecord,
    item: LayoutItem,
    anchorEntity: string,
    bindingPlan?: LayoutItemBindingPlan,
): ProofBindingResolution {
    const binding = bindingPlan ?? classifyLayoutItemBinding(item, anchorEntity);

    switch (binding.bindingClass) {
        case "relationship_field":
            return resolveRelationshipField(record, item, binding);
        case "reference_field":
            return resolveReferenceField(record, item, binding);
        case "computed_projection":
            return resolveComputedProjection(record, item, binding);
        case "widget":
        case "repeater":
            return withBinding(resolveItemValue(record, item), binding);
        case "base_field":
        default:
            return withBinding(resolveItemValue(record, item), binding);
    }
}

/** Whether a proof item should render (fail-closed for unknown kinds). */
export function shouldRenderProofItem(item: LayoutItem): boolean {
    return item.kind === "field" || item.kind === "field_group" || item.kind === "related_list" || item.kind === "widget_placeholder";
}
