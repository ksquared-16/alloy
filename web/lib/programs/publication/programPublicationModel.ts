import { createHash } from "node:crypto";
import type {
    ConfigurationFieldDefinition,
    EffectiveConfigurationField,
} from "@/lib/configPublication/types";
import { resolveEffectiveConfiguration } from "@/lib/configPublication/effectiveResolution";

export type ProgramDraftStatus = "draft" | "validated";
export type ProgramLifecycleStatus = "active" | "retired";

export type ProgramPayload = {
    programKey: string;
    label: string;
    description: string | null;
    category: string | null;
    eligibility: Record<string, unknown>;
    audience: Record<string, unknown>;
    requiredResourceType: string | null;
    qualificationRequirements: unknown[];
    defaultPolicyRefs: Record<string, unknown>;
    defaultCommercialPosture: Record<string, unknown>;
};

export type ProgramDraft = ProgramPayload & {
    id: string;
    programId: string;
    status: ProgramDraftStatus;
    baseRevisionId: string | null;
    validationErrors: string[];
    updatedAt: string;
};

export type ProgramRevision = ProgramPayload & {
    id: string;
    programId: string;
    revisionNumber: number;
    payloadChecksum: string;
    publishedAt: string;
};

export type ProgramLocationValues = {
    offered: boolean | null;
    localAuthorizationEvidence: string | null;
};

export type ProgramLocationOverrides = {
    description?: string | null;
};

export const PROGRAM_CONFIGURATION_FIELDS: readonly ConfigurationFieldDefinition[] = [
    { key: "programKey", policy: "organization_locked" },
    { key: "label", policy: "organization_locked" },
    { key: "description", policy: "location_may_override" },
    { key: "category", policy: "organization_locked" },
    { key: "eligibility", policy: "organization_locked" },
    { key: "audience", policy: "organization_locked" },
    { key: "requiredResourceType", policy: "organization_locked" },
    { key: "qualificationRequirements", policy: "organization_locked" },
    { key: "defaultPolicyRefs", policy: "organization_locked" },
    { key: "defaultCommercialPosture", policy: "organization_locked" },
    { key: "offered", policy: "location_must_supply" },
    { key: "localAuthorizationEvidence", policy: "location_must_supply" },
    { key: "assignedResources", policy: "runtime_derived" },
    { key: "capacity", policy: "runtime_derived" },
    { key: "scheduleAvailability", policy: "runtime_derived" },
] as const;

function stableValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value != null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entry]) => [key, stableValue(entry)]),
        );
    }
    return value;
}

export function programPayloadChecksum(payload: ProgramPayload): string {
    return createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex");
}

export function validateProgramPayload(payload: ProgramPayload): string[] {
    const errors: string[] = [];
    if (!/^[a-z0-9_]{2,64}$/.test(payload.programKey)) {
        errors.push("Program key must contain 2–64 lowercase letters, numbers, or underscores.");
    }
    if (!payload.label.trim()) errors.push("Program name is required.");
    if (payload.label.trim().length > 120) errors.push("Program name must be 120 characters or fewer.");
    if (payload.description != null && payload.description.length > 2000) {
        errors.push("Description must be 2,000 characters or fewer.");
    }

    const minimumAge = payload.audience.minimumAge;
    const maximumAge = payload.audience.maximumAge;
    if (
        typeof minimumAge === "number"
        && typeof maximumAge === "number"
        && minimumAge > maximumAge
    ) {
        errors.push("Minimum audience age cannot be greater than maximum audience age.");
    }
    return errors;
}

export function resolveEffectiveProgramConfiguration(input: {
    revision: ProgramRevision;
    locationValues: ProgramLocationValues;
    locationOverrides: ProgramLocationOverrides;
    runtimeValues?: Record<string, unknown>;
}): EffectiveConfigurationField[] {
    const organizationValues: Record<string, unknown> = {
        programKey: input.revision.programKey,
        label: input.revision.label,
        description: input.revision.description,
        category: input.revision.category,
        eligibility: input.revision.eligibility,
        audience: input.revision.audience,
        requiredResourceType: input.revision.requiredResourceType,
        qualificationRequirements: input.revision.qualificationRequirements,
        defaultPolicyRefs: input.revision.defaultPolicyRefs,
        defaultCommercialPosture: input.revision.defaultCommercialPosture,
    };
    const locationValues: Record<string, unknown> = {};
    if (input.locationValues.offered != null) locationValues.offered = input.locationValues.offered;
    if (input.locationValues.localAuthorizationEvidence != null) {
        locationValues.localAuthorizationEvidence = input.locationValues.localAuthorizationEvidence;
    }

    return resolveEffectiveConfiguration(PROGRAM_CONFIGURATION_FIELDS, {
        organizationValues,
        locationOverrides: input.locationOverrides,
        locationValues,
        runtimeValues: input.runtimeValues,
    });
}
