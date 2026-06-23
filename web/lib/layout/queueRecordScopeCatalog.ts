/**
 * Map queue record column scope → layout field catalog entity groups for the picker.
 */

import type { LayoutCatalogField, LayoutCatalogGroup } from "@/lib/layout/fieldCatalog";
import type { QueueRecordScope } from "@/lib/layout/queueRecordLayoutV3";

const LIFECYCLE_REF_PATTERNS = [
    /status/,
    /attention/,
    /next_step/,
    /stage/,
    /work_unit/,
    /tour/,
    /lifecycle/,
    /current_work/,
    /last_activity/,
    /queue_row\./,
];

const SYSTEM_REF_PATTERNS = [/\.id$/, /created_at/, /updated_at/, /record_id/];

/** Detect placement_candidate / flat-VM waitlist catalog buckets (wl_* entity keys). */
export function isWaitlistShapedCatalog(groups: LayoutCatalogGroup[]): boolean {
    return groups.some(
        (g) => g.entityKey === "placement_candidate" || g.entityKey.startsWith("wl_"),
    );
}

export function entityKeysForQueueRecordScope(scope: QueueRecordScope): string[] {
    switch (scope.type) {
        case "main_record":
            return ["opportunity", "customer"];
        case "primary_related":
            return ["person"];
        case "repeated_related":
            return scope.relationshipKey === "children" ? ["child", "inquiry_child"] : ["child"];
        case "lifecycle_context":
            return ["opportunity"];
        case "system":
            return ["opportunity", "person", "child"];
        default:
            return ["opportunity"];
    }
}

/** Defensive refKey matching when waitlist catalog uses non-canonical entityKey buckets. */
export function waitlistRefKeyMatchesQueueRecordScope(scope: QueueRecordScope, refKey: string): boolean {
    switch (scope.type) {
        case "repeated_related":
            if (scope.relationshipKey === "children") {
                return (
                    (refKey.startsWith("child.") || refKey.startsWith("inquiry_child."))
                    && !refKey.startsWith("opportunity.")
                );
            }
            return refKey.startsWith("child.") && !refKey.startsWith("opportunity.");
        case "primary_related":
            return refKey.startsWith("person.") || refKey.startsWith("household.primary");
        case "main_record":
            return (
                refKey.startsWith("customer.")
                || refKey.startsWith("opportunity.")
                || refKey.startsWith("household.")
                || refKey === "candidateId"
            );
        case "lifecycle_context":
            return (
                LIFECYCLE_REF_PATTERNS.some((re) => re.test(refKey))
                || refKey.startsWith("waitlist.")
                || refKey.startsWith("queue_row.")
            );
        case "system":
            return (
                SYSTEM_REF_PATTERNS.some((re) => re.test(refKey))
                || /Id$/.test(refKey)
                || refKey.endsWith(".id")
            );
        default:
            return false;
    }
}

function fieldPassesCanonicalScopeRules(field: LayoutCatalogField, scope: QueueRecordScope): boolean {
    if (scope.type === "lifecycle_context") {
        return LIFECYCLE_REF_PATTERNS.some((re) => re.test(field.refKey));
    }
    if (scope.type === "system") {
        return SYSTEM_REF_PATTERNS.some((re) => re.test(field.refKey));
    }
    if (scope.type === "repeated_related") {
        return !field.refKey.startsWith("opportunity.");
    }
    return true;
}

function isWaitlistCatalogBucket(entityKey: string): boolean {
    return entityKey === "placement_candidate" || entityKey.startsWith("wl_");
}

function fieldMatchesQueueRecordScope(
    field: LayoutCatalogField,
    scope: QueueRecordScope,
    allowedEntityKeys: Set<string>,
    waitlistShaped: boolean,
): boolean {
    const canonical = allowedEntityKeys.has(field.entityKey) && !isWaitlistCatalogBucket(field.entityKey);
    if (canonical) {
        return fieldPassesCanonicalScopeRules(field, scope);
    }
    if (!waitlistShaped) return false;
    return waitlistRefKeyMatchesQueueRecordScope(scope, field.refKey);
}

export function filterCatalogGroupsForScope(
    groups: LayoutCatalogGroup[],
    scope: QueueRecordScope,
): LayoutCatalogGroup[] {
    const allowed = new Set(entityKeysForQueueRecordScope(scope));
    const waitlistShaped = isWaitlistShapedCatalog(groups);
    return groups
        .map((g) => {
            const fields = g.fields.filter((f) => fieldMatchesQueueRecordScope(f, scope, allowed, waitlistShaped));
            return { ...g, fields };
        })
        .filter((g) => g.fields.length > 0);
}

export function filterCatalogFieldForScope(field: LayoutCatalogField, scope: QueueRecordScope): boolean {
    const groups = filterCatalogGroupsForScope(
        [{ entityKey: field.entityKey, entityLabel: field.entityLabel, fields: [field] }],
        scope,
    );
    return groups.length > 0 && (groups[0]?.fields.length ?? 0) > 0;
}

export function scopeLabel(scope: QueueRecordScope): string {
    switch (scope.type) {
        case "main_record":
            return "Main record";
        case "primary_related":
            return `Primary related · ${scope.relationshipKey}`;
        case "repeated_related":
            return `Repeated · ${scope.relationshipKey}`;
        case "lifecycle_context":
            return "Lifecycle / status";
        case "system":
            return "System";
        default:
            return "Scope";
    }
}
