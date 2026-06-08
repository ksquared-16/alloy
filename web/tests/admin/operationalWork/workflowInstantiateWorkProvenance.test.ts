import { describe, expect, it } from "vitest";

import {
    buildOperationalWorkMetadataForInstantiate,
    normalizeInstantiateProvenance,
    parseOperationalWorkViewFromTaskRow,
} from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";
import {
    buildWorkflowInstantiateOperationalProvenance,
    resolveWorkflowInstantiateActor,
    WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE,
} from "@/lib/admin/operationalWork/workflowInstantiateWork/workflowInstantiateWorkActorPolicy";

const orgId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const ownerId = "55555555-5555-5555-8555-555555555555";
const oppId = "33333333-3333-4333-8333-333333333333";
const runId = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
const workflowId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const eventId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const actionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const fingerprint = `${orgId}:opportunities:${oppId}`;

describe("workflow instantiate provenance persistence", () => {
    it("persists full workflow provenance through metadata builder", () => {
        const instantiateProvenance = buildWorkflowInstantiateOperationalProvenance({
            workflowRunId: runId,
            workflowId,
            actionOrder: 2,
            workflowActionId: actionId,
            eventId,
            eventType: "opportunity_status_changed",
            actorUserId: actorId,
            executorUserId: actorId,
            executorSource: "actor",
            subjectMapping: { mode: "event_primary_entity" },
            actionPayloadVersion: 1,
        });

        const normalized = normalizeInstantiateProvenance(instantiateProvenance, {
            idempotencyKey: `${runId}:2`,
        });

        const metadata = buildOperationalWorkMetadataForInstantiate({
            workDefinitionKey: "contact_family",
            subjectFingerprint: fingerprint,
            dedupeKey: "dedupe-key",
            provenance: normalized,
            contextSnapshot: { event_type: "opportunity_status_changed", lifecycle_stage_key: "tour" },
        });

        expect(metadata.provenance).toEqual({
            source: "workflow",
            workflow_run_id: runId,
            workflow_id: workflowId,
            workflow_action_order: 2,
            workflow_action_id: actionId,
            workflow_event_id: eventId,
            workflow_event_type: "opportunity_status_changed",
            workflow_subject_mapping_mode: "event_primary_entity",
            workflow_action_payload_version: 1,
            idempotency_key: `${runId}:2`,
            created_by_user_id: actorId,
            executor_user_id: actorId,
        });
        expect(metadata.subject_fingerprint).toBe(fingerprint);
        expect(metadata.dedupe_key).toBe("dedupe-key");
    });

    it("round-trips workflow provenance through parseOperationalWorkViewFromTaskRow", () => {
        const metadata = buildOperationalWorkMetadataForInstantiate({
            workDefinitionKey: "contact_family",
            subjectFingerprint: fingerprint,
            dedupeKey: "dedupe-key",
            provenance: normalizeInstantiateProvenance(
                buildWorkflowInstantiateOperationalProvenance({
                    workflowRunId: runId,
                    workflowId,
                    actionOrder: 1,
                    eventId,
                    eventType: "opportunity_status_changed",
                    actorUserId: actorId,
                    executorUserId: actorId,
                    executorSource: "actor",
                    subjectMapping: { mode: "path", entity_type: "opportunities", entity_id_path: "opportunity.id" },
                    actionPayloadVersion: 1,
                }),
                { idempotencyKey: `${runId}:1` },
            ),
        });

        const view = parseOperationalWorkViewFromTaskRow({
            id: "66666666-6666-4666-8666-666666666666",
            org_id: orgId,
            entity_type: "opportunities",
            entity_id: oppId,
            assigned_to_user_id: null,
            created_by: actorId,
            title: "Contact family",
            description: null,
            due_at: "2027-01-02T12:00:00.000Z",
            status: "open",
            source: "manual",
            proposal_id: null,
            metadata,
            created_at: "2027-01-01T00:00:00.000Z",
            updated_at: "2027-01-01T00:00:00.000Z",
        });

        expect(view.provenance.source).toBe("workflow");
        expect(view.provenance.workflow_event_id).toBe(eventId);
        expect(view.provenance.workflow_subject_mapping_mode).toBe("path");
        expect(view.provenance.idempotency_key).toBe(`${runId}:1`);
    });
});

describe("resolveWorkflowInstantiateActor", () => {
    it("uses actor as executor and created_by when actor exists", () => {
        const resolved = resolveWorkflowInstantiateActor({ actor_user_id: actorId });
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.executorUserId).toBe(actorId);
        expect(resolved.actorUserId).toBe(actorId);
        expect(resolved.executorSource).toBe("actor");
    });

    it("uses record owner as executor without claiming actor", () => {
        const resolved = resolveWorkflowInstantiateActor({
            opportunity: { assigned_to: ownerId },
        });
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.executorUserId).toBe(ownerId);
        expect(resolved.actorUserId).toBeNull();
        expect(resolved.executorSource).toBe("record_owner");

        const provenance = buildWorkflowInstantiateOperationalProvenance({
            workflowRunId: runId,
            workflowId,
            actionOrder: 1,
            actorUserId: resolved.actorUserId,
            executorUserId: resolved.executorUserId,
            executorSource: resolved.executorSource,
            subjectMapping: { mode: "event_primary_entity" },
            actionPayloadVersion: 1,
        });
        expect(provenance.created_by_user_id).toBeUndefined();
        expect(provenance.executor_user_id).toBe(ownerId);
    });

    it("fails clearly when actor and owner are missing", () => {
        const resolved = resolveWorkflowInstantiateActor({});
        expect(resolved.ok).toBe(false);
        if (resolved.ok) return;
        expect(resolved.error).toBe("WORKFLOW_ACTOR_UNAVAILABLE");
        expect(resolved.message).toBe(WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE);
    });
});

describe("workflow metadata framework version", () => {
    it("preserves work_framework_version on persisted metadata", () => {
        const md = buildOperationalWorkMetadataForInstantiate({
            workDefinitionKey: "contact_family",
            subjectFingerprint: fingerprint,
            dedupeKey: null,
            provenance: { source: "workflow", workflow_run_id: runId },
        });
        expect(md.work_framework_version).toBe(OPERATIONAL_WORK_FRAMEWORK_VERSION);
    });
});
