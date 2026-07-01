import { describe, expect, it } from "vitest";

import { buildInstantiateWorkWorkflowProvenance } from "@/lib/admin/operationalWork/workflowInstantiateWork/buildInstantiateWorkWorkflowProvenance";
import { parseInstantiateWorkWorkflowActionPayload } from "@/lib/admin/operationalWork/workflowInstantiateWork/parseInstantiateWorkWorkflowActionPayload";
import { resolveInstantiateWorkWorkflowSubject } from "@/lib/admin/operationalWork/workflowInstantiateWork/resolveInstantiateWorkWorkflowSubject";

const orgId = "11111111-1111-4111-8111-111111111111";
const oppId = "33333333-3333-4333-8333-333333333333";
const runId = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
const actorId = "22222222-2222-4222-8222-222222222222";
const workflowId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const eventId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const validPayload = {
    version: 1,
    work_definition_key: "contact_family",
    subject: { mode: "event_primary_entity" },
};

describe("parseInstantiateWorkWorkflowActionPayload", () => {
    it("parses valid payload", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload(validPayload);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.work_definition_key).toBe("contact_family");
        expect(parsed.payload.subject.mode).toBe("event_primary_entity");
    });

    it("applies default behavior policies", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload(validPayload);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.payload.on_disabled_definition).toBe("skip");
        expect(parsed.payload.on_deduped).toBe("soft_success");
        expect(parsed.payload.on_rejected).toBe("fail");
    });

    it("rejects invalid version", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload({ ...validPayload, version: 2 });
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.error).toBe("VERSION_UNSUPPORTED");
    });

    it("rejects missing work definition key", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload({ ...validPayload, work_definition_key: "" });
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.error).toBe("WORK_DEFINITION_KEY_REQUIRED");
    });

    it("rejects manual_ad_hoc", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload({
            ...validPayload,
            work_definition_key: "manual_ad_hoc",
        });
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.error).toBe("WORK_DEFINITION_KEY_NOT_ALLOWED");
    });

    it("rejects invalid subject mapping", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload({
            ...validPayload,
            subject: { mode: "unknown" },
        });
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.error).toBe("SUBJECT_MAPPING_INVALID");
    });

    it("rejects path mapping with unsafe path", () => {
        const parsed = parseInstantiateWorkWorkflowActionPayload({
            ...validPayload,
            subject: { mode: "path", entity_type: "opportunities", entity_id_path: "opportunity..id" },
        });
        expect(parsed.ok).toBe(false);
    });
});

describe("resolveInstantiateWorkWorkflowSubject", () => {
    it("resolves event primary entity from payload entity_type and entity_id", () => {
        const resolved = resolveInstantiateWorkWorkflowSubject({
            orgId,
            workflowPayload: {
                entity_type: "opportunities",
                entity_id: oppId,
            },
            subjectMapping: { mode: "event_primary_entity" },
        });
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.subject).toEqual({ entityType: "opportunities", entityId: oppId });
        expect(resolved.subjectFingerprint).toBe(`${orgId}:opportunities:${oppId}`);
    });

    it("resolves path subject from enriched payload", () => {
        const resolved = resolveInstantiateWorkWorkflowSubject({
            orgId,
            workflowPayload: {
                opportunity: { id: oppId },
            },
            subjectMapping: {
                mode: "path",
                entity_type: "opportunities",
                entity_id_path: "opportunity.id",
            },
        });
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.subject.entityId).toBe(oppId);
    });

    it("resolves static subject", () => {
        const resolved = resolveInstantiateWorkWorkflowSubject({
            orgId,
            workflowPayload: {},
            subjectMapping: {
                mode: "static",
                entity_type: "opportunities",
                entity_id: oppId,
            },
        });
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.subject).toEqual({ entityType: "opportunities", entityId: oppId });
    });

    it("returns failure when subject id is missing for path mapping", () => {
        const resolved = resolveInstantiateWorkWorkflowSubject({
            orgId,
            workflowPayload: { opportunity: {} },
            subjectMapping: {
                mode: "path",
                entity_type: "opportunities",
                entity_id_path: "opportunity.id",
            },
        });
        expect(resolved.ok).toBe(false);
        if (resolved.ok) return;
        expect(resolved.error).toBe("SUBJECT_ID_MISSING");
    });

    it("returns failure when event primary entity lacks id", () => {
        const resolved = resolveInstantiateWorkWorkflowSubject({
            orgId,
            workflowPayload: { entity_type: "opportunities" },
            subjectMapping: { mode: "event_primary_entity" },
        });
        expect(resolved.ok).toBe(false);
        if (resolved.ok) return;
        expect(resolved.error).toBe("SUBJECT_ID_MISSING");
    });
});

describe("buildInstantiateWorkWorkflowProvenance", () => {
    it("creates stable idempotency key from run id and action order", () => {
        const provenance = buildInstantiateWorkWorkflowProvenance({
            workflowRunId: runId,
            actionOrder: 2,
            actorUserId: actorId,
            workflowId,
            eventId,
        });
        expect(provenance.source).toBe("workflow");
        expect(provenance.workflow_run_id).toBe(runId);
        expect(provenance.workflow_id).toBe(workflowId);
        expect(provenance.event_id).toBe(eventId);
        expect(provenance.idempotency_key).toBe(`${runId}:2`);
        expect(provenance.created_by_user_id).toBe(actorId);
    });

    it("handles actor-less provenance safely", () => {
        const provenance = buildInstantiateWorkWorkflowProvenance({
            workflowRunId: runId,
            actionOrder: 1,
        });
        expect(provenance.idempotency_key).toBe(`${runId}:1`);
        expect(provenance.created_by_user_id).toBeUndefined();
        expect(provenance.workflow_id).toBeUndefined();
        expect(provenance.event_id).toBeUndefined();
    });
});
