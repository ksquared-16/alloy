import { describe, expect, it } from "vitest";

import {
    buildInstantiateRequestFromDefinition,
} from "@/lib/admin/operationalWork/buildInstantiateRequestFromDefinition";
import { getPlatformWorkDefinition } from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import { resolveWorkDefinition } from "@/lib/admin/operationalWork/resolveWorkDefinition";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";

describe("buildInstantiateRequestFromDefinition", () => {
    const contactFamily = resolveWorkDefinition("contact_family")!;

    it("maps definition fields to instantiate request", () => {
        const built = buildInstantiateRequestFromDefinition({
            definition: contactFamily,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            recordOwnerUserId: userId,
            now: new Date("2027-01-01T12:00:00.000Z"),
        });

        expect(built.ok).toBe(true);
        if (!built.ok) return;
        expect(built.request.workDefinitionKey).toBe("contact_family");
        expect(built.request.title).toBe("Contact family");
        expect(built.request.category).toBe("follow_up");
        expect(built.request.shape).toBe("task");
        expect(built.request.dedupePolicy).toBe("definition_subject");
        expect(built.request.subject).toEqual({ entityType: "opportunities", entityId: oppId });
        expect(built.request.subjectFingerprint).toBe(`${orgId}:opportunities:${oppId}`);
        expect(built.request.suggestedActionKeys).toEqual(["create_task"]);
        expect(built.request.dueAt).toBe("2027-01-02T12:00:00.000Z");
    });

    it("due override wins over definition due policy", () => {
        const built = buildInstantiateRequestFromDefinition({
            definition: contactFamily,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            dueAtOverride: "2027-06-15T09:00:00.000Z",
            recordOwnerUserId: userId,
        });
        expect(built.ok).toBe(true);
        if (built.ok) expect(built.request.dueAt).toBe("2027-06-15T09:00:00.000Z");
    });

    it("assignee override wins over definition assignee policy", () => {
        const assignee = "44444444-4444-4444-8444-444444444444";
        const built = buildInstantiateRequestFromDefinition({
            definition: contactFamily,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            assigneeOverride: assignee,
            recordOwnerUserId: "55555555-5555-5555-8555-555555555555",
        });
        expect(built.ok).toBe(true);
        if (built.ok) expect(built.request.assignedToUserId).toBe(assignee);
    });

    it("creator policy resolves to current user", () => {
        const adHoc = resolveWorkDefinition("manual_ad_hoc")!;
        const built = buildInstantiateRequestFromDefinition({
            definition: adHoc,
            orgId,
            userId,
            subject: { entityType: null, entityId: null },
            provenance: { source: "manual" },
            titleOverride: "Custom task",
        });
        expect(built.ok).toBe(true);
        if (built.ok) expect(built.request.assignedToUserId).toBe(userId);
    });

    it("unassigned policy resolves to null", () => {
        const definition = {
            ...contactFamily,
            assignee_policy: { kind: "unassigned" as const },
        };
        const built = buildInstantiateRequestFromDefinition({
            definition,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
        });
        expect(built.ok).toBe(true);
        if (built.ok) expect(built.request.assignedToUserId).toBeNull();
    });

    it("record owner policy resolves when owner provided", () => {
        const owner = "55555555-5555-5555-8555-555555555555";
        const built = buildInstantiateRequestFromDefinition({
            definition: contactFamily,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            recordOwnerUserId: owner,
        });
        expect(built.ok).toBe(true);
        if (built.ok) expect(built.request.assignedToUserId).toBe(owner);
    });

    it("copies context snapshot onto request", () => {
        const built = buildInstantiateRequestFromDefinition({
            definition: contactFamily,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            recordOwnerUserId: userId,
            contextSnapshot: {
                attention_reason_codes: ["tour_date_passed"],
                lifecycle_stage_key: "tour",
            },
        });
        expect(built.ok).toBe(true);
        if (built.ok) {
            expect(built.request.contextSnapshot?.attention_reason_codes).toEqual(["tour_date_passed"]);
        }
    });

    it("rejects disallowed subject", () => {
        const built = buildInstantiateRequestFromDefinition({
            definition: contactFamily,
            orgId,
            userId,
            subject: { entityType: null, entityId: null },
            provenance: { source: "manual" },
        });
        expect(built.ok).toBe(false);
    });

    it("rejects definition with none due policy when no override", () => {
        const definition = {
            ...contactFamily,
            due_policy: { kind: "none" as const },
        };
        const built = buildInstantiateRequestFromDefinition({
            definition,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
        });
        expect(built.ok).toBe(false);
        if (!built.ok) expect(built.error).toBe("DUE_AT_REQUIRED");
    });
});

describe("resolveDueAtFromWorkDefinitionPolicy", () => {
    it("defaults offset to one day when days/hours omitted", async () => {
        const { resolveDueAtFromWorkDefinitionPolicy } = await import(
            "@/lib/admin/operationalWork/workDefinitionDueResolution"
        );
        const result = resolveDueAtFromWorkDefinitionPolicy({
            duePolicy: { kind: "offset_from_create" },
            now: new Date("2027-01-01T00:00:00.000Z"),
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.dueAt).toBe("2027-01-02T00:00:00.000Z");
    });
});

describe("resolveAssigneeFromWorkDefinitionPolicy", () => {
    it("falls back role policy to creator", async () => {
        const { resolveAssigneeFromWorkDefinitionPolicy } = await import(
            "@/lib/admin/operationalWork/workDefinitionAssigneeResolution"
        );
        expect(
            resolveAssigneeFromWorkDefinitionPolicy({
                assigneePolicy: { kind: "role", role_key: "enrollment_coordinator" },
                userId,
            }),
        ).toBe(userId);
    });
});

describe("catalog manual ad hoc", () => {
    it("uses weak dedupe policy", () => {
        expect(getPlatformWorkDefinition("manual_ad_hoc")?.dedupe_policy).toBe("none");
    });
});

describe("suggested action keys metadata persistence", () => {
    it("persists suggested action keys into framework metadata", async () => {
        const { buildOperationalWorkMetadataForInstantiate } = await import(
            "@/lib/admin/operationalWork/operationalWorkMetadata"
        );
        const built = buildInstantiateRequestFromDefinition({
            definition: resolveWorkDefinition("contact_family")!,
            orgId,
            userId,
            subject: { entityType: "opportunities", entityId: oppId },
            provenance: { source: "manual" },
            recordOwnerUserId: userId,
            contextSnapshot: { lifecycle_stage_key: "tour" },
        });
        expect(built.ok).toBe(true);
        if (!built.ok) return;

        const metadata = buildOperationalWorkMetadataForInstantiate({
            workDefinitionKey: built.request.workDefinitionKey!,
            category: built.request.category,
            subjectFingerprint: built.request.subjectFingerprint!,
            dedupeKey: "dedupe-key",
            provenance: { source: "manual" },
            contextSnapshot: built.request.contextSnapshot,
            suggestedActionKeys: built.request.suggestedActionKeys,
        });

        expect(metadata.suggested_action_keys).toEqual(["create_task"]);
        expect(metadata.context_snapshot).toEqual({ lifecycle_stage_key: "tour" });
    });
});
