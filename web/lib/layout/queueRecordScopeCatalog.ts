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
];

const SYSTEM_REF_PATTERNS = [/\.id$/, /created_at/, /updated_at/, /record_id/];

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

export function filterCatalogGroupsForScope(
    groups: LayoutCatalogGroup[],
    scope: QueueRecordScope,
): LayoutCatalogGroup[] {
    const allowed = new Set(entityKeysForQueueRecordScope(scope));
    return groups
        .map((g) => {
            let fields = g.fields.filter((f) => allowed.has(f.entityKey));
            if (scope.type === "lifecycle_context") {
                fields = fields.filter((f) => LIFECYCLE_REF_PATTERNS.some((re) => re.test(f.refKey)));
            }
            if (scope.type === "system") {
                fields = fields.filter((f) => SYSTEM_REF_PATTERNS.some((re) => re.test(f.refKey)));
            }
            if (scope.type === "repeated_related") {
                fields = fields.filter((f) => !f.refKey.startsWith("opportunity."));
            }
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
