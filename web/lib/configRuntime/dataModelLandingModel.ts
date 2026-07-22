import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";

/** Data Model landing — tiles use existing settings routes only. */
export function buildDataModelLandingModel(): OrganizationDomainLandingModel {
    return {
        domainKey: "data-model",
        title: "Data Model",
        purpose:
            "Organization vocabulary shared by records, processes, and configured surfaces — entities, fields, statuses, and derived calculations.",
        ownershipNote: "Organization-owned definitions. Not a Location inheritance domain.",
        summaryCards: [
            {
                id: "ownership",
                label: "Ownership",
                value: "Organization",
                detail: "Definitions apply org-wide; Locations do not author a second vocabulary.",
            },
            {
                id: "entry",
                label: "How to start",
                value: "Choose a section",
                detail: "Open Entities, Fields, Statuses, or Calculations — no invented readiness score.",
            },
            {
                id: "scope",
                label: "Scope model",
                value: "Organization only",
                detail: "Assignment and override layers do not apply to the Data Model vocabulary.",
            },
        ],
        tiles: [
            {
                id: "entities",
                label: "Entities",
                summary: "Record types and terminology the Organization operates on.",
                capabilities: ["Entity labels", "Hub terminology", "Operator-facing names"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${adminSettingsSubpathHref("entities")}?section=entities`,
            },
            {
                id: "fields",
                label: "Fields",
                summary: "Field definitions, types, validation, and entity field workspaces.",
                capabilities: ["Field definitions", "Categories", "Relationships tab in Fields"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: adminSettingsSubpathHref("fields"),
            },
            {
                id: "statuses",
                label: "Statuses",
                summary: "Status vocabulary and lifecycle presentation.",
                capabilities: ["Status definitions", "Lifecycle presentation"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: adminSettingsSubpathHref("statuses"),
            },
            {
                id: "calculations",
                label: "Operational Calculations",
                summary: "Metrics, formulas, targets, and derived values.",
                capabilities: ["Operational metrics", "Derived values"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: adminSettingsSubpathHref("calculations"),
            },
            {
                id: "option-sets",
                label: "Option sets",
                summary: "Reusable option vocabularies for configured fields.",
                capabilities: ["Option set catalog", "Per-set editing"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: adminSettingsSubpathHref("option-sets"),
            },
            {
                id: "relationships",
                label: "Relationships",
                summary: "Person and family relationship configuration.",
                capabilities: ["Family roles", "Person relationships"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: adminSettingsSubpathHref("relationships"),
            },
        ],
    };
}
