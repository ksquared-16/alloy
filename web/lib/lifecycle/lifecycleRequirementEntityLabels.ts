/**
 * Customer-facing entity labels for Lifecycle Required Information UI.
 */

import { getEntityLabel, type EntityLabelsMap } from "@/lib/admin/entityLabelDisplay";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import { lifecycleEntityLabel } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

const ENTITY_TYPE_BY_REQUIREMENT_KEY: Record<LifecycleRequirementEntityKey, string> = {
    person: "persons",
    child: "customer_members",
    opportunity: "opportunities",
    customer: "customers",
};

export function lifecycleRequirementEntityLabelsFromMap(
    labels: EntityLabelsMap,
    primaryRecordLabel?: string
): Record<LifecycleRequirementEntityKey, string> {
    const lead =
        primaryRecordLabel?.trim() ||
        getEntityLabel(labels, "opportunities", "singular");
    return {
        person: getEntityLabel(labels, "persons", "singular"),
        child: getEntityLabel(labels, "customer_members", "singular"),
        opportunity: lead,
        customer: getEntityLabel(labels, "customers", "singular"),
    };
}

export function lifecycleRequirementEntityLabel(
    entity: LifecycleRequirementEntityKey,
    labels?: EntityLabelsMap | null,
    primaryRecordLabel?: string
): string {
    if (labels) {
        return lifecycleRequirementEntityLabelsFromMap(labels, primaryRecordLabel)[entity];
    }
    if (entity === "opportunity" && primaryRecordLabel?.trim()) {
        return primaryRecordLabel.trim();
    }
    const dbType = ENTITY_TYPE_BY_REQUIREMENT_KEY[entity];
    return lifecycleEntityLabel(entity) !== entity
        ? lifecycleEntityLabel(entity)
        : dbType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
