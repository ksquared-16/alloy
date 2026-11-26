/**
 * Programs Continuity selection helpers — Checkpoint D.
 *
 * Thin domain wrappers over Configuration Object selection laws.
 * Never invent a first-Program default (collection landing).
 */

import {
    resolveConfigurationObjectConcernState,
    resolveConfigurationObjectSelection,
} from "@/lib/configRuntime/configurationObject/selection";
import type { ConfigurationObjectSelectionResolution } from "@/lib/configRuntime/configurationObject/types";
import {
    normalizeProgramConfigurationSection,
    type ProgramConfigurationSection,
} from "@/lib/programs/programConfigurationSections";

export function resolveProgramsSelection(args: {
    routeProgramId: string | null | undefined;
    retainedProgramId: string | null | undefined;
    validProgramIds: ReadonlySet<string> | readonly string[];
    allowRetainedRestore?: boolean;
}): ConfigurationObjectSelectionResolution {
    return resolveConfigurationObjectSelection({
        routeObjectId: args.routeProgramId,
        retainedObjectId: args.retainedProgramId,
        validObjectIds: args.validProgramIds,
        allowRetainedRestore: args.allowRetainedRestore,
        missingLabel: "Program not found or unavailable.",
    });
}

export function resolveProgramsConcernState(args: {
    routeSection: string | null | undefined;
    localSection: ProgramConfigurationSection;
    routeProgramId: string | null;
    localProgramId: string | null;
}): {
    section: ProgramConfigurationSection;
    objectChanged: boolean;
} {
    const routeConcern = normalizeProgramConfigurationSection(args.routeSection);
    const projected = resolveConfigurationObjectConcernState({
        routeConcern,
        routeItemId: null,
        localConcern: args.localSection,
        localItemId: null,
        routeObjectId: args.routeProgramId,
        localObjectId: args.localProgramId,
    });
    return {
        section: projected.concern,
        objectChanged: projected.objectChanged,
    };
}
