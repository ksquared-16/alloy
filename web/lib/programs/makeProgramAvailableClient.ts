/**
 * Production Programs Make Available client adapter (Stage 3).
 * Calls preview_make_available / make_available — no fixture mutation.
 */

import {
    PROGRAMS_CONFIGURATION_ENDPOINT,
    postProgramConfigurationAction,
} from "@/lib/programs/locationProgramAssociation";
import type {
    MakeProgramAvailableCommitResult,
    MakeProgramAvailablePreview,
    MakeProgramAvailableProgramRef,
} from "@/lib/programs/commands/makeProgramAvailable/makeProgramAvailableModel";
import { invalidateProgramsCollection } from "@/lib/programs/programsCollectionCache";
import { invalidateLocationsCollection } from "@/lib/locations/locationsCollectionCache";
import { publishConfigurationInvalidation } from "@/lib/configRuntime/configurationInvalidation";

export type ProgramAvailabilityOrigin =
    | { kind: "program"; programId: string }
    | { kind: "location"; locationId: string };

export type MakeAvailableClientRequest = {
    program: MakeProgramAvailableProgramRef;
    locationIds: readonly string[];
    originatingLocationId?: string | null;
    idempotencyKey: string;
    entryPoint: "organization_program" | "location" | "unknown";
};

function operatorMessage(error: unknown, fallback: string): string {
    if (typeof error === "string" && error.trim()) return error.trim();
    if (error != null && typeof error === "object") {
        const record = error as Record<string, unknown>;
        if (typeof record.operatorMessage === "string" && record.operatorMessage.trim()) {
            return record.operatorMessage.trim();
        }
        if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
    }
    return fallback;
}

export function createMakeAvailableIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `make-available:${crypto.randomUUID()}`;
    }
    return `make-available:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Fingerprint of operator intent — regenerate idempotency key when this changes. */
export function makeAvailableIntentFingerprint(input: {
    program: MakeProgramAvailableProgramRef;
    locationIds: readonly string[];
}): string {
    const locations = [...input.locationIds].map((id) => id.trim()).filter(Boolean).sort();
    if (input.program.kind === "existing") {
        return JSON.stringify({
            kind: "existing",
            programId: input.program.programId,
            publicationId: input.program.publicationId ?? null,
            locations,
        });
    }
    return JSON.stringify({
        kind: "new",
        key: input.program.input.key.trim(),
        label: input.program.input.label.trim(),
        description: input.program.input.description ?? null,
        locations,
    });
}

export async function previewMakeProgramAvailableClient(
    input: MakeAvailableClientRequest,
): Promise<MakeProgramAvailablePreview> {
    const json = await postProgramConfigurationAction({
        action: "preview_make_available",
        program: input.program,
        locationIds: [...input.locationIds],
        targetIds: [...input.locationIds],
        originatingLocationId: input.originatingLocationId ?? undefined,
        idempotencyKey: input.idempotencyKey,
        entryPoint: input.entryPoint,
    });
    if (!json.ok || json.preview == null || typeof json.preview !== "object") {
        throw new Error(operatorMessage(json.error, "Preview could not be completed."));
    }
    return json.preview as MakeProgramAvailablePreview;
}

export async function commitMakeProgramAvailableClient(
    input: MakeAvailableClientRequest,
): Promise<MakeProgramAvailableCommitResult> {
    const json = await postProgramConfigurationAction({
        action: "make_available",
        program: input.program,
        locationIds: [...input.locationIds],
        targetIds: [...input.locationIds],
        originatingLocationId: input.originatingLocationId ?? undefined,
        idempotencyKey: input.idempotencyKey,
        entryPoint: input.entryPoint,
    });
    if (!json.ok || json.result == null || typeof json.result !== "object") {
        throw new Error(operatorMessage(json.error, "Make available could not be completed."));
    }
    return json.result as MakeProgramAvailableCommitResult;
}

/**
 * Map backend refreshTargets into Continuity / collection invalidation.
 * Deduplicates scopes. Does not global-flush unless target requires it.
 */
export function applyMakeAvailableRefreshTargets(input: {
    orgId: string | null | undefined;
    refreshTargets: readonly string[];
    reason?: string;
}): void {
    const reason = input.reason ?? "program-make-available";
    const scopes = new Set<"programs" | "locations" | "organization">();
    for (const target of input.refreshTargets) {
        if (target.startsWith("programs:") || target === "organization:programs-locations") {
            scopes.add("programs");
        }
        if (target.startsWith("locations:")) {
            scopes.add("locations");
        }
        if (target.startsWith("organization:")) {
            scopes.add("organization");
        }
    }
    if (!input.orgId) {
        for (const scope of scopes) {
            publishConfigurationInvalidation(scope === "organization" ? "organization" : scope, reason);
        }
        return;
    }
    if (scopes.has("programs") || scopes.has("organization")) {
        invalidateProgramsCollection(input.orgId, reason, { publishBus: true });
    }
    if (scopes.has("locations")) {
        invalidateLocationsCollection(input.orgId, reason, { publishBus: true });
    }
    if (scopes.has("organization") && !scopes.has("programs")) {
        publishConfigurationInvalidation("organization", reason);
    }
}

export { PROGRAMS_CONFIGURATION_ENDPOINT };
