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
import {
    operatorProgramError,
    readProgramAgeRange,
    validateProgramAgeRange,
    writeProgramAgeAudience,
    type ProgramAgeUnit,
} from "@/lib/programs/programsOperatorPresentation";
import type { ProgramAgeRange } from "@/lib/programs/programAgeRange";

export const PROGRAMS_ENDPOINT = "/api/admin/configuration/programs";
export const LOCATION_PROGRAM_CATEGORIES_ENDPOINT = "/api/admin/location-program-categories";

export type ProgramOperatorFields = {
    name: string;
    description: string;
    minimumAge: string;
    minimumAgeUnit: ProgramAgeUnit;
    maximumAge: string;
    maximumAgeUnit: ProgramAgeUnit;
};

export type LocationProgramAssignmentConfig = {
    locationId: string;
    localDisplayName: string;
    availableFrom: string;
    availableThrough: string;
};

function emptyFields(): ProgramOperatorFields {
    return {
        name: "",
        description: "",
        minimumAge: "",
        minimumAgeUnit: "years",
        maximumAge: "",
        maximumAgeUnit: "years",
    };
}

export function emptyProgramOperatorFields(): ProgramOperatorFields {
    return emptyFields();
}

export function fieldsFromAudience(
    name: string,
    description: string | null | undefined,
    audience: Record<string, unknown> | null | undefined,
): ProgramOperatorFields {
    const range = readProgramAgeRange(audience);
    return {
        name,
        description: description ?? "",
        minimumAge: range.minimum != null ? String(range.minimum.value) : "",
        minimumAgeUnit: range.minimum?.unit ?? "years",
        maximumAge: range.maximum != null ? String(range.maximum.value) : "",
        maximumAgeUnit: range.maximum?.unit ?? "years",
    };
}

function optionalNumber(value: string): number | null {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function fieldsToAgeRange(fields: ProgramOperatorFields): ProgramAgeRange {
    const minValue = optionalNumber(fields.minimumAge);
    const maxValue = optionalNumber(fields.maximumAge);
    return {
        minimum:
            minValue == null
                ? null
                : { value: minValue, unit: fields.minimumAgeUnit },
        maximum:
            maxValue == null
                ? null
                : { value: maxValue, unit: fields.maximumAgeUnit },
    };
}

export function validateProgramOperatorFields(fields: ProgramOperatorFields): string | null {
    if (!fields.name.trim()) return "Program name is required.";
    const minRaw = fields.minimumAge.trim();
    const maxRaw = fields.maximumAge.trim();
    if (minRaw && optionalNumber(minRaw) == null) return "Minimum age must be a number.";
    if (maxRaw && optionalNumber(maxRaw) == null) return "Maximum age must be a number.";
    if (minRaw.includes(".") || maxRaw.includes(".")) {
        return "Use whole numbers with Weeks, Months, or Years.";
    }
    return validateProgramAgeRange(fieldsToAgeRange(fields));
}

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

function audiencePatch(fields: ProgramOperatorFields): Record<string, unknown> {
    return writeProgramAgeAudience(fieldsToAgeRange(fields));
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
    const validationError = validateProgramOperatorFields(fields);
    if (validationError) throw new Error(validationError);
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

async function listLocationProgramCategories(): Promise<
    Array<{ id: string; program_id: string | null; location_id: string }>
> {
    const response = await fetch(`${LOCATION_PROGRAM_CATEGORIES_ENDPOINT}?include_inactive=true`, {
        credentials: "include",
    });
    const json = (await response.json().catch(() => ({}))) as {
        categories?: Array<Record<string, unknown>>;
        error?: string;
    };
    if (!response.ok) {
        throw new Error(operatorProgramError(json.error ?? `Request failed (${response.status})`));
    }
    return (json.categories ?? []).map((row) => ({
        id: String(row.id ?? ""),
        program_id: row.program_id != null ? String(row.program_id) : null,
        location_id: String(row.location_id ?? ""),
    }));
}

export async function patchLocationProgramAssignments(input: {
    programId: string;
    configs: readonly LocationProgramAssignmentConfig[];
}): Promise<void> {
    if (input.configs.length === 0) return;

    const categories = await listLocationProgramCategories();
    const byLocation = new Map(
        categories
            .filter((row) => row.program_id === input.programId && row.id)
            .map((row) => [row.location_id, row.id] as const),
    );

    const updates = input.configs.flatMap((config) => {
        const id = byLocation.get(config.locationId);
        if (!id) return [];
        return [{
            id,
            local_display_name: config.localDisplayName.trim() || null,
            available_from: config.availableFrom.trim() || null,
            available_through: config.availableThrough.trim() || null,
        }];
    });
    if (updates.length === 0) return;

    const response = await fetch(LOCATION_PROGRAM_CATEGORIES_ENDPOINT, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
        throw new Error(operatorProgramError(json.error ?? `Request failed (${response.status})`));
    }
}

export async function createProgramOperator(input: {
    fields: ProgramOperatorFields;
    locationIds: readonly string[];
    existingKeys: ReadonlySet<string>;
    sharedAvailability?: { availableFrom: string; availableThrough: string } | null;
}): Promise<{ programId: string }> {
    const validationError = validateProgramOperatorFields(input.fields);
    if (validationError) throw new Error(validationError);

    const name = input.fields.name.trim();
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
        const range = fieldsToAgeRange(input.fields);
        if (range.minimum || range.maximum) {
            await persistProgramDefinition(programId, input.fields);
        }
        const shared = input.sharedAvailability;
        if (shared && (shared.availableFrom.trim() || shared.availableThrough.trim())) {
            await patchLocationProgramAssignments({
                programId,
                configs: locationIds.map((locationId) => ({
                    locationId,
                    localDisplayName: "",
                    availableFrom: shared.availableFrom,
                    availableThrough: shared.availableThrough,
                })),
            });
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
    await persistProgramDefinition(input.programId, input.fields);
}

export async function syncProgramLocationsOperator(input: {
    programId: string;
    publicationId?: string | null;
    selectedLocationIds: readonly string[];
    currentLocationIds: readonly string[];
    configs?: readonly LocationProgramAssignmentConfig[];
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
        for (const item of blocked) {
            selected.add(item.locationId);
        }
    }

    const remainingConfigs = (input.configs ?? []).filter((config) => selected.has(config.locationId));
    if (remainingConfigs.length > 0 && blocked.length === 0) {
        await patchLocationProgramAssignments({
            programId: input.programId,
            configs: remainingConfigs,
        });
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
