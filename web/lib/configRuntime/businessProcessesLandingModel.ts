import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";

const PROCESSES_BASE = adminSettingsSubpathHref("processes");

/**
 * Business Processes landing model — retained for deep-link tile hrefs only.
 * `/settings/processes` now always mounts the Collection → Selected Process → Focused Workspace
 * surface (`ProcessesConfigurationPage`); this model is no longer the page's default render path.
 */
export function buildBusinessProcessesLandingModel(): OrganizationDomainLandingModel {
    return {
        domainKey: "business-processes",
        title: "Business Processes",
        purpose: "Create and manage how operational work moves through Alloy.",
        ownershipNote: "Organization definition + Location activation/assignment when present in the process builder.",
        summaryCards: [],
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
                label: "Commands",
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
