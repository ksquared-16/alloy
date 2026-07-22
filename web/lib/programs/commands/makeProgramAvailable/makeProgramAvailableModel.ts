/**
 * Make Program Available — command model (Programs → Locations).
 * Platform term: assignment. Operator verb: Add to Locations / Make available.
 *
 * Verdict A: only published Program revisions may be associated with Locations.
 */

export type MakeProgramAvailableProgramRef =
    | {
          kind: "existing";
          programId: string;
          /** Optional; server resolves latest publication when omitted. */
          publicationId?: string;
          revisionId?: string;
      }
    | {
          kind: "new";
          input: {
              key: string;
              label: string;
              description?: string | null;
          };
      };

export type MakeProgramAvailableCommandInput = {
    orgId: string;
    actorUserId: string;
    program: MakeProgramAvailableProgramRef;
    locationIds: readonly string[];
    originatingLocationId?: string | null;
    /** Client-stable key for create+assign and assign retries. */
    idempotencyKey: string;
    /** null = org-wide site access; otherwise actor may only target these sites. */
    allowedSiteLocationIds: string[] | null;
    /** Optional Continuity entry mark for audit. */
    entryPoint?: "organization_program" | "location" | "unknown";
};

export type MakeProgramAvailableLocationResult = {
    locationId: string;
    locationLabel: string;
    status:
        | "new_association"
        | "already_available"
        | "already_available_local"
        | "blocked";
    code?: string;
    reason?: string;
    hasLocalConfiguration: boolean;
    offered: boolean | null;
    currentRevisionId: string | null;
};

export type MakeProgramAvailablePreview = {
    program: {
        id: string | null;
        label: string;
        key: string | null;
        lifecycleState: string;
        publicationRequired: boolean;
        publicationId: string | null;
        revisionId: string | null;
        willPublish: boolean;
    };
    requestedLocationIds: string[];
    newAssociations: MakeProgramAvailableLocationResult[];
    alreadyAvailable: MakeProgramAvailableLocationResult[];
    blocked: Array<{ locationId: string; locationLabel: string; code: string; reason: string }>;
    locallyConfigured: MakeProgramAvailableLocationResult[];
    retainedLocalConfiguration: MakeProgramAvailableLocationResult[];
    plannedOperations: string[];
    impact: {
        requested: number;
        eligible: number;
        unchanged: number;
        blocked: number;
    };
};

export type MakeProgramAvailableCommitResult = {
    status: "committed" | "partial" | "blocked";
    operationId: string;
    programId: string;
    /** Null when blocked before a publication/revision exists (e.g. draft Program). */
    revisionId: string | null;
    /** Null when blocked before a publication/revision exists (e.g. draft Program). */
    publicationId: string | null;
    createdProgram: boolean;
    publishedProgram: boolean;
    associatedLocationIds: string[];
    unchangedLocationIds: string[];
    blocked: Array<{ locationId: string; code: string; reason: string }>;
    failed: Array<{ locationId: string; code: string; retryable: boolean; reason: string }>;
    refreshTargets: string[];
    distributionRunId: string | null;
    idempotentReplay: boolean;
};

export const MAKE_PROGRAM_AVAILABLE_COMMAND_KEY = "programs.make_available.v1";

export function buildMakeProgramAvailableRefreshTargets(input: {
    programId: string;
    associatedLocationIds: readonly string[];
    originatingLocationId?: string | null;
}): string[] {
    const targets = new Set<string>([
        "programs:collection",
        `programs:program:${input.programId}`,
        `programs:program:${input.programId}:assignment`,
        "organization:programs-locations",
        "locations:collection",
    ]);
    for (const locationId of input.associatedLocationIds) {
        targets.add(`locations:location:${locationId}`);
        targets.add(`locations:location:${locationId}:programs`);
    }
    if (input.originatingLocationId) {
        targets.add(`locations:location:${input.originatingLocationId}`);
        targets.add(`locations:location:${input.originatingLocationId}:programs`);
    }
    return [...targets].sort();
}
