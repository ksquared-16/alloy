import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";
import { dataModelSectionHref } from "@/lib/dataModel/dataModelChapterRoutes";

/** Data Model landing model — tiles deep-link into the Category workspace (no ceremony cards). */
export function buildDataModelLandingModel(): OrganizationDomainLandingModel {
    return {
        domainKey: "data-model",
        title: "Data Model",
        purpose:
            "Configure the shared vocabulary, fields, statuses, relationships, and derived values used across Alloy.",
        ownershipNote: "Organization-owned definitions. Not a Location inheritance domain.",
        summaryCards: [],
        tiles: [
            {
                id: "entities",
                label: "Entities",
                summary: "Record types and terminology the Organization operates on.",
                capabilities: ["Entity labels", "Hub terminology", "Operator-facing names"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: dataModelSectionHref("entities"),
            },
            {
                id: "fields",
                label: "Fields",
                summary: "Field definitions, types, validation, and entity field workspaces.",
                capabilities: ["Field definitions", "Categories", "Relationships tab in Fields"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: dataModelSectionHref("fields"),
            },
            {
                id: "statuses",
                label: "Statuses",
                summary: "Status vocabulary owned by explicit subject domains.",
                capabilities: ["Status domains", "Status values", "Lifecycle presentation"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: dataModelSectionHref("statuses"),
            },
            {
                id: "option-sets",
                label: "Option Sets",
                summary: "Reusable option vocabularies for configured fields.",
                capabilities: ["Option set catalog", "Per-set values"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: dataModelSectionHref("option-sets"),
            },
            {
                id: "relationships",
                label: "Relationships",
                summary: "Canonical edges between Entities and relationship-role vocabulary.",
                capabilities: ["Family roles", "Person relationships"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: dataModelSectionHref("relationships"),
            },
            {
                id: "calculations",
                label: "Operational Calculations",
                summary: "Metrics, formulas, targets, and derived values.",
                capabilities: ["Operational metrics", "Derived values"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: dataModelSectionHref("calculations"),
            },
        ],
    };
}
