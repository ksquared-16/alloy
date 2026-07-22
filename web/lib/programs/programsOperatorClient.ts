/**
 * Client helpers for the simplified Programs operator surface.
 * Internally uses create/update/validate/publish + make_available; never exposes those terms.
 */

import {
    commitMakeProgramAvailableClient,
    createMakeAvailableIdempotencyKey,
    previewMakeProgramAvailableClient,
} from "@/lib/programs/makeProgramAvailableClient";
import { slugifyProgramKey } from "@/lib/programs/locationProgramAssociation";
import { operatorProgramError } from "@/lib/programs/programsOperatorPresentation";
import type { ProgramAgeUnit } from "@/lib/programs/programsOperatorPresentation";

export const PROGRAMS_ENDPOINT = "/api/admin/configuration/programs";

export type ProgramOperatorFields = {
    name: string;
    description: string;
    minimumAge: string;
    maximumAge: string;
    ageUnit: ProgramAgeUnit;
};

async function postAction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(PROGRAMS_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
        const error = json.error;
        const message =
            error != null && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
                ? String((error as { message: string }).message)
                : typeof json.reason === "string"
                  ? json.reason
                  : `Request failed (${response.status})`;
        const err = new Error(operatorProgramError(message)) as Error & { blocked?: boolean; status?: number };
        err.blocked = json.blocked === true || response.status === 409;
        err.status = response.status;
        throw err;
    }
    return json;
}

function optionalNumber(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function audiencePatch(fields: ProgramOperatorFields): Record<string, unknown> {
    const minimumAge = optionalNumber(fields.minimumAge);
    const maximumAge = optionalNumber(fields.maximumAge);
    const audience: Record<string, unknown> = {};
    if (minimumAge != null) audience.minimumAge = minimumAge;
    if (maximumAge != null) audience.maximumAge = maximumAge;
    if (minimumAge != null || maximumAge != null) audience.ageUnit = fields.ageUnit;
    return audience;
}

function uniqueProgramKey(name: string, existingKeys: ReadonlySet<string>): string {
    const base = slugifyProgramKey(name) || "program";
    if (!existingKeys.has(base) && base.length >= 2) return base;
    for (let i = 2; i < 1000; i += 1) {
        const candidate = `${base}_${i}`.slice(0, 64);
        if (!existingKeys.has(candidate)) return candidate;
    }
    return `${base}_${Date.now()}`.slice(0, 64);
}

async function persistProgramDefinition(programId: string, fields: ProgramOperatorFields): Promise<void> {
    await postAction({
        action: "update_draft",
        programId,
        patch: {
            label: fields.name.trim(),
            description: fields.description.trim() || null,
            audience: audiencePatch(fields),
        },
    });
    const validation = await postAction({ action: "validate_draft", programId });
    const errors = Array.isArray(validation.errors) ? validation.errors.map(String) : [];
    if (errors.length > 0) {
        throw new Error(operatorProgramError(errors.join(" ")));
    }
    await postAction({ action: "publish", programId });
}

export async function createProgramOperator(input: {
    fields: ProgramOperatorFields;
    locationIds: readonly string[];
    existingKeys: ReadonlySet<string>;
}): Promise<{ programId: string }> {
    const name = input.fields.name.trim();
    if (!name) throw new Error("Program name is required.");
    const key = uniqueProgramKey(name, input.existingKeys);
    const locationIds = [...new Set(input.locationIds.map(String).filter(Boolean))];

    if (locationIds.length > 0) {
        const idempotencyKey = createMakeAvailableIdempotencyKey();
        await previewMakeProgramAvailableClient({
            program: {
                kind: "new",
                input: {
                    key,
                    label: name,
                    description: input.fields.description.trim() || null,
                },
            },
            locationIds,
            idempotencyKey,
            entryPoint: "organization_program",
        });
        const result = await commitMakeProgramAvailableClient({
            program: {
                kind: "new",
                input: {
                    key,
                    label: name,
                    description: input.fields.description.trim() || null,
                },
            },
            locationIds,
            idempotencyKey,
            entryPoint: "organization_program",
        });
        const programId = String(result.programId ?? "").trim();
        if (!programId) throw new Error("We could not create this Program. Try again.");
        // Age range is not part of make_available create input — persist + publish.
        if (input.fields.minimumAge.trim() || input.fields.maximumAge.trim()) {
            await persistProgramDefinition(programId, input.fields);
        }
        return { programId };
    }

    const created = await postAction({
        action: "create_draft",
        key,
        label: name,
    });
    const programId = String(created.programId ?? "").trim();
    if (!programId) throw new Error("We could not create this Program. Try again.");
    await persistProgramDefinition(programId, input.fields);
    return { programId };
}

export async function saveProgramOperator(input: {
    programId: string;
    fields: ProgramOperatorFields;
}): Promise<void> {
    const name = input.fields.name.trim();
    if (!name) throw new Error("Program name is required.");
    await persistProgramDefinition(input.programId, input.fields);
}

export async function syncProgramLocationsOperator(input: {
    programId: string;
    publicationId?: string | null;
    selectedLocationIds: readonly string[];
    currentLocationIds: readonly string[];
}): Promise<{ blocked: Array<{ locationId: string; locationLabel: string; reason: string }> }> {
    const selected = new Set(input.selectedLocationIds.map(String).filter(Boolean));
    const current = new Set(input.currentLocationIds.map(String).filter(Boolean));
    const toAdd = [...selected].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !selected.has(id));
    let blocked: Array<{ locationId: string; locationLabel: string; reason: string }> = [];

    if (toAdd.length > 0) {
        const idempotencyKey = createMakeAvailableIdempotencyKey();
        await previewMakeProgramAvailableClient({
            program: {
                kind: "existing",
                programId: input.programId,
                publicationId: input.publicationId ?? undefined,
            },
            locationIds: toAdd,
            idempotencyKey,
            entryPoint: "organization_program",
        });
        await commitMakeProgramAvailableClient({
            program: {
                kind: "existing",
                programId: input.programId,
                publicationId: input.publicationId ?? undefined,
            },
            locationIds: toAdd,
            idempotencyKey,
            entryPoint: "organization_program",
        });
    }

    if (toRemove.length > 0) {
        const result = await postAction({
            action: "remove_locations",
            programId: input.programId,
            locationIds: toRemove,
        });
        const payload = result.result as { blocked?: Array<{ locationId: string; locationLabel: string; reason: string }> } | undefined;
        blocked = Array.isArray(payload?.blocked) ? payload.blocked : [];
    }

    return { blocked };
}

export async function archiveProgramOperator(programId: string): Promise<void> {
    await postAction({ action: "archive", programId });
}

export async function restoreProgramOperator(programId: string): Promise<void> {
    await postAction({ action: "restore", programId });
}

export async function deleteProgramOperator(programId: string): Promise<{ blocked?: boolean; reason?: string }> {
    try {
        await postAction({ action: "delete", programId });
        return {};
    } catch (error) {
        const err = error as Error & { blocked?: boolean };
        if (err.blocked) {
            return { blocked: true, reason: err.message };
        }
        throw error;
    }
}
