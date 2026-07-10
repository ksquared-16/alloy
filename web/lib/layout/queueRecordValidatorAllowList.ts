/**
 * Queue row v3 — publish validation derived from canonical data-provider catalog.
 *
 * Field refs must be resolvable on queue row runtime records. Picker-visible refs
 * are a subset filtered by consumer picker capabilities.
 *
 * Invariant: VISIBLE_QUEUE_PICKER_REFS(layoutKind) ⊆ VALIDATOR_ALLOWED_QUEUE_REFS(layoutKind)
 *
 * Legacy saved references pass through queueRowLegacyCompatibility.
 */

import { publishableQueueRowRefKeys } from "@/lib/fields/canonicalDataProviderRegistry";
import { isLegacyQueueRowCompatibilityRefKey } from "@/lib/fields/queueRowLegacyCompatibility";
import { isQueueRowRuntimeResolvableRefKey } from "@/lib/fields/queueRowRuntimeResolution";
import { validateRefKeyForWrite } from "@/lib/layout/layoutRefKeyAliases";

export type QueueRecordLayoutKind = "pipeline" | "waitlist";

export function queueRecordLayoutKind(isWaitlist: boolean): QueueRecordLayoutKind {
    return isWaitlist ? "waitlist" : "pipeline";
}

/** Publish allow-list for pipeline or waitlist queue row layouts — derived from provider catalog. */
export function validatorAllowedQueueRecordFieldRefKeys(isWaitlist = false): readonly string[] {
    return publishableQueueRowRefKeys(isWaitlist);
}

export function isValidatorAllowedQueueRecordFieldRefKey(refKey: string, isWaitlist = false): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;
    const writeGuard = validateRefKeyForWrite(trimmed);
    if (!writeGuard.ok) return false;
    if (isLegacyQueueRowCompatibilityRefKey(trimmed)) return true;
    return isQueueRowRuntimeResolvableRefKey(trimmed, isWaitlist);
}

/** @deprecated Use validatorAllowedQueueRecordFieldRefKeys — kept for test/doc references. */
export const PIPELINE_QUEUE_RECORD_VALIDATOR_FIELD_REFS = validatorAllowedQueueRecordFieldRefKeys(false);
/** @deprecated Use validatorAllowedQueueRecordFieldRefKeys — kept for test/doc references. */
export const WAITLIST_QUEUE_RECORD_VALIDATOR_FIELD_REFS = validatorAllowedQueueRecordFieldRefKeys(true);
