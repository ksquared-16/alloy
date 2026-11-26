import { describe, expect, it } from "vitest";
import { buildConfigurationDeliveryPlan } from "@/lib/configPublication/deliveryPlan";
import { resolveEffectiveConfiguration } from "@/lib/configPublication/effectiveResolution";
import type { ConfigurationPublicationRecord } from "@/lib/configPublication/types";
import { previewProgramDelivery } from "@/lib/programs/publication/programPublicationAdapter";
import {
    programPayloadChecksum,
    resolveEffectiveProgramConfiguration,
    validateProgramPayload,
    type ProgramRevision,
} from "@/lib/programs/publication/programPublicationModel";

const publication: ConfigurationPublicationRecord = {
    id: "publication-1",
    orgId: "org-1",
    domainKey: "programs",
    subjectId: "program-1",
    revision: { id: "revision-2", number: 2, checksum: "checksum" },
    publishedAt: "2026-07-17T00:00:00.000Z",
};

const revision: ProgramRevision = {
    id: "revision-2",
    programId: "program-1",
    revisionNumber: 2,
    payloadChecksum: "checksum",
    publishedAt: "2026-07-17T00:00:00.000Z",
    programKey: "preschool",
    label: "Preschool",
    description: "Organization description",
    category: "Early learning",
    eligibility: {},
    audience: { minimumAge: 3, maximumAge: 5 },
    requiredResourceType: "classroom",
    qualificationRequirements: ["Early childhood license"],
    defaultPolicyRefs: {},
    defaultCommercialPosture: {},
};

describe("Configuration Publication delivery identity", () => {
    it("is deterministic across target ordering and duplicates", () => {
        const first = buildConfigurationDeliveryPlan({
            publication,
            providerKey: "programs.v1",
            providerVersion: 1,
            targets: [
                { locationId: "b", locationLabel: "B" },
                { locationId: "a", locationLabel: "A" },
                { locationId: "a", locationLabel: "Duplicate" },
            ],
        });
        const second = buildConfigurationDeliveryPlan({
            publication,
            providerKey: "programs.v1",
            providerVersion: 1,
            targets: [
                { locationId: "a", locationLabel: "A" },
                { locationId: "b", locationLabel: "B" },
            ],
        });
        expect(first.idempotencyKey).toBe(second.idempotencyKey);
        expect(first.targets.map((target) => target.locationId)).toEqual(["a", "b"]);
    });

    it("changes when provider version or target set changes", () => {
        const base = buildConfigurationDeliveryPlan({
            publication,
            providerKey: "programs.v1",
            providerVersion: 1,
            targets: [{ locationId: "a", locationLabel: "A" }],
        });
        const changed = buildConfigurationDeliveryPlan({
            publication,
            providerKey: "programs.v1",
            providerVersion: 2,
            targets: [{ locationId: "a", locationLabel: "A" }],
        });
        expect(changed.idempotencyKey).not.toBe(base.idempotencyKey);
    });
});

describe("effective Configuration resolution", () => {
    it("preserves false, null, zero, and explicit location overrides", () => {
        const resolved = resolveEffectiveConfiguration(
            [
                { key: "locked", policy: "organization_locked" },
                { key: "override", policy: "location_may_override" },
                { key: "required", policy: "location_must_supply" },
                { key: "derived", policy: "runtime_derived" },
            ],
            {
                organizationValues: { locked: false, override: "org" },
                locationOverrides: { override: null },
                locationValues: { required: 0 },
                runtimeValues: { derived: false },
            },
        );
        expect(resolved.map(({ value, source }) => ({ value, source }))).toEqual([
            { value: false, source: "organization" },
            { value: null, source: "location_override" },
            { value: 0, source: "location" },
            { value: false, source: "runtime_derived" },
        ]);
    });

    it("rejects protected and unknown overrides", () => {
        expect(() =>
            resolveEffectiveConfiguration(
                [{ key: "identity", policy: "organization_locked" }],
                {
                    organizationValues: { identity: "Organization" },
                    locationOverrides: { identity: "Location" },
                },
            ),
        ).toThrow("not allowed");
        expect(() =>
            resolveEffectiveConfiguration([], {
                organizationValues: {},
                locationOverrides: { unknown: true },
            }),
        ).toThrow("Unknown configuration override");
    });
});

describe("Programs reference adapter", () => {
    it("resolves permitted local description while locking identity", () => {
        const fields = resolveEffectiveProgramConfiguration({
            revision,
            locationValues: { offered: false, localAuthorizationEvidence: "License 123" },
            locationOverrides: { description: "Local description" },
            runtimeValues: { assignedResources: [], capacity: 0 },
        });
        expect(fields.find((field) => field.key === "label")).toMatchObject({
            value: "Preschool",
            source: "organization",
        });
        expect(fields.find((field) => field.key === "description")).toMatchObject({
            value: "Local description",
            source: "location_override",
        });
        expect(fields.find((field) => field.key === "offered")).toMatchObject({
            value: false,
            source: "location",
        });
    });

    it("previews protected local truth and required inputs", () => {
        const preview = previewProgramDelivery({
            revision,
            locationId: "location-1",
            locationLabel: "Downtown",
            context: {
                currentRevisionId: "revision-1",
                offeringExists: true,
                offered: true,
                localDescriptionOverride: "Downtown Preschool",
                localAuthorizationEvidence: null,
                protectedResourceAssignmentCount: 2,
            },
        });
        expect(preview.impacts.map((impact) => impact.fieldKey)).toEqual(
            expect.arrayContaining(["revision", "description", "offered", "assignedResources"]),
        );
        expect(preview.requiredInputs).toHaveLength(1);
        expect(preview.conflicts).toEqual([]);
    });

    it("validates draft payloads and computes order-independent checksums", () => {
        expect(validateProgramPayload({ ...revision, programKey: "Bad key" })).not.toEqual([]);
        const a = programPayloadChecksum(revision);
        const b = programPayloadChecksum({
            ...revision,
            audience: { maximumAge: 5, minimumAge: 3 },
        });
        expect(a).toBe(b);
    });
});
