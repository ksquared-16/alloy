/**
 * Programs → Configuration Object Runtime adoption seams (Checkpoint C.5 / D).
 *
 * Descriptor consumed by ProgramsPublicationWorkspace via ConfigurationObjectWorkspace.
 * Does not alter Program assignment / publication / distribution contracts.
 */

import type { ConfigurationObjectWorkspaceDescriptor } from "@/lib/configRuntime/configurationObject/types";
import {
    PROGRAM_CONFIGURATION_SECTIONS,
    type ProgramConfigurationSection,
} from "@/lib/programs/programConfigurationSections";
import { CANONICAL_ORGANIZATION_PROGRAMS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    commercialSettingsHref,
    type CommercialCompatChapter,
} from "@/lib/commercial/commercialChapterRoutes";

const PROGRAM_CONCERN_LABELS: Record<ProgramConfigurationSection, string> = {
    overview: "Overview",
    definition: "Definition",
    offerings: "Delivery Options",
    pricing: "Tuition",
    availability: "Locations",
    policies: "Policies",
    relationships: "Relationships",
    publication: "Publication",
    assignment: "Distribution",
    history: "History",
};

const PROGRAM_CONCERN_CAPABILITY: Record<
    ProgramConfigurationSection,
    ConfigurationObjectWorkspaceDescriptor["concerns"][number]["capability"]
> = {
    overview: "overview",
    definition: "domain",
    offerings: "domain",
    pricing: "domain",
    availability: "assignment",
    policies: "domain",
    relationships: "relationships",
    publication: "publication",
    assignment: "distribution",
    history: "history",
};

/**
 * Descriptor Programs will pass to ConfigurationObjectWorkspace in Checkpoint D.
 * Labels follow the adoption map (Delivery Options / Locations / Distribution)
 * without renaming ProgramConfigurationSection keys (contract preserved).
 */
export function buildProgramsConfigurationObjectDescriptor(args?: {
    permissionAllowed?: (section: ProgramConfigurationSection) => boolean;
}): ConfigurationObjectWorkspaceDescriptor {
    const allow = args?.permissionAllowed ?? (() => true);
    const sections = [...PROGRAM_CONFIGURATION_SECTIONS] as ProgramConfigurationSection[];
    return {
        domainId: "programs",
        objectTypeLabel: "Program",
        collectionLabel: "Programs",
        basePath: CANONICAL_ORGANIZATION_PROGRAMS_HREF,
        objectIdQueryParam: "programId",
        concernQueryParam: "section",
        defaultConcernKey: "overview",
        lifecycleSlots: {
            assignment: true,
            publication: true,
            distribution: true,
            history: true,
            activation: false,
        },
        concerns: sections.map((key, order) => ({
            key,
            label: PROGRAM_CONCERN_LABELS[key],
            order,
            capability: PROGRAM_CONCERN_CAPABILITY[key],
            visible: true,
            permissionAllowed: allow(key),
        })),
    };
}

/**
 * Related Commercial tools — intentional leave paths only.
 * Never link bare `/settings/commercial` (that historically owned Programs IA).
 */
export const PROGRAMS_WORKSPACE_SIBLING_CHAPTERS = [
    {
        id: "tuition" as const satisfies CommercialCompatChapter,
        label: "Tuition",
        objectRuntimeEligible: true,
        href: commercialSettingsHref("tuition"),
    },
    {
        id: "catalog" as const satisfies CommercialCompatChapter,
        label: "Catalog",
        objectRuntimeEligible: true,
        href: commercialSettingsHref("catalog"),
    },
    {
        id: "policies" as const satisfies CommercialCompatChapter,
        label: "Policies",
        objectRuntimeEligible: true,
        href: commercialSettingsHref("policies"),
    },
    {
        id: "accounting" as const satisfies CommercialCompatChapter,
        label: "Accounting",
        objectRuntimeEligible: false,
        href: commercialSettingsHref("accounting"),
    },
    {
        id: "simulator" as const satisfies CommercialCompatChapter,
        label: "Simulator",
        objectRuntimeEligible: false,
        href: commercialSettingsHref("simulator"),
    },
    {
        id: "funding" as const satisfies CommercialCompatChapter,
        label: "Funding",
        objectRuntimeEligible: false,
        href: commercialSettingsHref("funding"),
    },
] as const;
