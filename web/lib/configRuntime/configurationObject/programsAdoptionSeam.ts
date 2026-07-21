/**
 * Programs → Configuration Object Runtime adoption seams (Checkpoint C.5).
 *
 * Compilation-safe mapping only. Does not wire ProgramsPublicationWorkspace
 * or alter Program assignment / publication / distribution contracts.
 *
 * Checkpoint D consumes this descriptor to adopt ConfigurationObjectWorkspace.
 */

import type { ConfigurationObjectWorkspaceDescriptor } from "@/lib/configRuntime/configurationObject/types";
import {
    PROGRAM_CONFIGURATION_SECTIONS,
    type ProgramConfigurationSection,
} from "@/lib/programs/programConfigurationSections";
import { CANONICAL_ORGANIZATION_PROGRAMS_HREF } from "@/lib/admin/canonicalAdminRoutes";

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

/** Workspace chapters that remain outside a selected Program object. */
export const PROGRAMS_WORKSPACE_SIBLING_CHAPTERS = [
    { id: "tuition", label: "Tuition", objectRuntimeEligible: true },
    { id: "catalog", label: "Catalog", objectRuntimeEligible: false },
    { id: "policies", label: "Policies", objectRuntimeEligible: true },
    { id: "accounting", label: "Accounting", objectRuntimeEligible: false },
    { id: "simulator", label: "Simulator", objectRuntimeEligible: false },
    { id: "funding", label: "Funding", objectRuntimeEligible: true },
] as const;
