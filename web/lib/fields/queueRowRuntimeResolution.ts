/**
 * Queue row runtime resolution gate — breaks circular dependency between
 * fieldResolverRegistry and queueRecordValidatorAllowList.
 *
 * A refKey is runtime-resolvable when the canonical provider catalog (or legacy
 * compatibility adapter) supports it for the queue layout kind.
 */

import { evaluateQueueRowProviderEligibility } from "@/lib/fields/queueRowProviderEligibility";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export function isQueueRowRuntimeResolvableRefKey(
    refKey: string,
    isWaitlist: boolean,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): boolean {
    return evaluateQueueRowProviderEligibility(refKey, isWaitlist, tenantFieldDefinitions).resolvable;
}

export function isQueueRowRuntimeResolvableEitherLayout(
    refKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): boolean {
    return (
        isQueueRowRuntimeResolvableRefKey(refKey, false, tenantFieldDefinitions)
        || isQueueRowRuntimeResolvableRefKey(refKey, true, tenantFieldDefinitions)
    );
}
