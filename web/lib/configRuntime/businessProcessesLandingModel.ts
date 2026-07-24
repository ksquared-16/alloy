import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";

const PROCESSES_BASE = adminSettingsSubpathHref("processes");

/** Business Processes landing — Organization definition + activation; overrides unproven. */
export function buildBusinessProcessesLandingModel(): OrganizationDomainLandingModel {
    return {
        domainKey: "business-processes",
        title: "Business Processes",
        purpose:
            "Organization-owned process definitions, stages, work views, and action placement. Location activation exists where the builder already supports it — overrides are not claimed without evidence.",
        ownershipNote: "Organization definition + Location activation/assignment when present in the process builder.",
        summaryCards: [
            {
                id: "ownership",
                label: "Ownership",
                value: "Organization",
                detail: "Process definitions are authored centrally.",
            },
            {
                id: "activation",
                label: "Location",
                value: "Activation / availability",
                detail: "Operational contexts choose availability — not a fabricated override layer.",
            },
            {
                id: "entry",
                label: "How to start",
                value: "Open a section",
                detail: "Tiles enter the existing process builder — no redesign in this sprint.",
            },
        ],
        tiles: [
            {
                id: "stages",
                label: "Stages & Work Views",
                summary: "Stage structure, work views, and stage operating detail.",
                capabilities: ["Stages", "Work Views", "Operating plan inside stage editor"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${PROCESSES_BASE}?section=stages`,
            },
            {
                id: "actions",
                label: "Actions",
                summary: "Action placement matrix for the selected process.",
                capabilities: ["Action placement", "Process-bound actions"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${PROCESSES_BASE}?section=actions`,
            },
            {
                id: "automation",
                label: "Automation",
                summary: "Process-bound automation owned in the process builder today.",
                capabilities: ["Automation section", "Existing builder path"],
                kind: "configuration",
                postureLabel: "Organization definition",
                href: `${PROCESSES_BASE}?section=automation`,
            },
            {
                id: "health",
                label: "Configuration Health",
                summary: "Builder health attention for the selected process.",
                capabilities: ["Health checklist", "Existing builder path"],
                kind: "utility",
                postureLabel: "Builder utility",
                href: `${PROCESSES_BASE}?section=health`,
            },
        ],
    };
}
