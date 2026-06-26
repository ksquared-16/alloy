import { describe, expect, it } from "vitest";

import {
    attachOperationalWorkView,
    buildOperationalWorkMetadataForCreate,
    extractOperationalTaskBpDimensions,
    parseOperationalWorkViewFromTaskRow,
    toOperationalTaskApiRow,
} from "@/lib/admin/operationalWork/operationalWorkMetadata";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

const baseRow = (): OperationalTaskRow => ({
    id: "66666666-6666-4666-8666-666666666666",
    org_id: "11111111-1111-4111-8111-111111111111",
    entity_type: "opportunities",
    entity_id: "33333333-3333-4333-8333-333333333333",
    assigned_to_user_id: null,
    created_by: "22222222-2222-4222-8222-222222222222",
    title: "Follow up",
    description: null,
    due_at: "2027-01-15T12:00:00.000Z",
    status: "open",
    source: "manual",
    proposal_id: null,
    metadata: {},
    created_at: "2027-01-01T00:00:00.000Z",
    updated_at: "2027-01-01T00:00:00.000Z",
});

describe("buildOperationalWorkMetadataForCreate", () => {
    it("writes framework v1 keys for manual create", () => {
        const md = buildOperationalWorkMetadataForCreate({
            source: "manual",
            proposalId: null,
            callerMetadata: { custom_flag: true },
        });
        expect(md.work_framework_version).toBe(OPERATIONAL_WORK_FRAMEWORK_VERSION);
        expect(md.shape).toBe("task");
        expect(md).toMatchObject({
            provenance: { source: "manual" },
            custom_flag: true,
        });
    });

    it("maps task_assist proposal_id into provenance", () => {
        const proposalId = "44444444-4444-4444-8444-444444444444";
        const md = buildOperationalWorkMetadataForCreate({
            source: "task_assist",
            proposalId,
            callerMetadata: null,
        });
        expect(md.provenance).toEqual({ source: "task_assist", proposal_id: proposalId });
    });

    it("accepts optional category and context_snapshot from caller metadata", () => {
        const md = buildOperationalWorkMetadataForCreate({
            source: "manual",
            proposalId: null,
            callerMetadata: {
                category: "follow_up",
                context_snapshot: {
                    readiness_gap_ids: ["child:program_interest"],
                    lifecycle_stage_key: "qualification",
                },
            },
        });
        expect(md.category).toBe("follow_up");
        expect(md.context_snapshot).toEqual({
            readiness_gap_ids: ["child:program_interest"],
            lifecycle_stage_key: "qualification",
        });
    });

    it("does not allow caller to override framework keys", () => {
        const md = buildOperationalWorkMetadataForCreate({
            source: "manual",
            proposalId: null,
            callerMetadata: {
                work_framework_version: 99,
                shape: "checklist",
                provenance: { source: "workflow" },
            },
        });
        expect(md.work_framework_version).toBe(1);
        expect(md.shape).toBe("task");
        expect(md.provenance).toEqual({ source: "manual" });
    });
});

describe("buildOperationalWorkMetadataForInstantiate", () => {
    it("writes dedupe identity and provenance for instantiate", async () => {
        const { buildOperationalWorkMetadataForInstantiate } = await import(
            "@/lib/admin/operationalWork/operationalWorkMetadata"
        );
        const md = buildOperationalWorkMetadataForInstantiate({
            workDefinitionKey: "follow_up_after_tour",
            subjectFingerprint: "fp-1",
            dedupeKey: "dedupe-1",
            periodKey: "2026-W23",
            provenance: { source: "workflow", workflow_run_id: "run-1", idempotency_key: "idem-1" },
            contextSnapshot: { attention_reason_codes: ["tour_date_passed"] },
        });
        expect(md.work_definition_key).toBe("follow_up_after_tour");
        expect(md.subject_fingerprint).toBe("fp-1");
        expect(md.dedupe_key).toBe("dedupe-1");
        expect(md.dedupe_period_key).toBe("2026-W23");
        expect(md.provenance).toEqual({
            source: "workflow",
            workflow_run_id: "run-1",
            idempotency_key: "idem-1",
        });
        expect(md.context_snapshot).toEqual({ attention_reason_codes: ["tour_date_passed"] });
    });
});

describe("parseOperationalWorkViewFromTaskRow", () => {
    it("parses legacy rows without framework metadata", () => {
        const row = baseRow();
        row.source = "task_assist";
        row.proposal_id = "44444444-4444-4444-8444-444444444444";
        const view = parseOperationalWorkViewFromTaskRow(row);
        expect(view.shape).toBe("task");
        expect(view.framework_version).toBe(1);
        expect(view.category).toBeNull();
        expect(view.provenance).toEqual({
            source: "task_assist",
            proposal_id: "44444444-4444-4444-8444-444444444444",
        });
    });

    it("parses v1 metadata rows", () => {
        const row = baseRow();
        row.metadata = {
            work_framework_version: 1,
            shape: "task",
            category: "information_collection",
            work_definition_key: "collect_missing_information",
            provenance: { source: "manual" },
            context_snapshot: { attention_reason_codes: ["missing_required_info"] },
        };
        const view = parseOperationalWorkViewFromTaskRow(row);
        expect(view.category).toBe("information_collection");
        expect(view.work_definition_key).toBe("collect_missing_information");
        expect(view.context_snapshot?.attention_reason_codes).toEqual(["missing_required_info"]);
    });

    it("attachOperationalWorkView adds work field", () => {
        const instance = attachOperationalWorkView(baseRow());
        expect(instance.work.shape).toBe("task");
        expect(instance.title).toBe("Follow up");
    });
});

describe("extractOperationalTaskBpDimensions", () => {
    it("projects Business Process dimensions from top-level metadata", () => {
        const row = baseRow();
        row.metadata = {
            department_id: "dept-1",
            lifecycle_stage_key: "tour_scheduled",
            lifecycle_provenance: "lifecycle_template",
            work_definition_key: "follow_up_after_tour",
        };
        expect(extractOperationalTaskBpDimensions(row)).toEqual({
            department_id: "dept-1",
            lifecycle_stage_key: "tour_scheduled",
            lifecycle_provenance: "lifecycle_template",
            work_definition_key: "follow_up_after_tour",
        });
    });

    it("falls back to context_snapshot.lifecycle_stage_key when not top-level", () => {
        const row = baseRow();
        row.metadata = {
            work_definition_key: "collect_missing_information",
            context_snapshot: { lifecycle_stage_key: "qualification" },
        };
        const dims = extractOperationalTaskBpDimensions(row);
        expect(dims.lifecycle_stage_key).toBe("qualification");
        expect(dims.work_definition_key).toBe("collect_missing_information");
        expect(dims.department_id).toBeNull();
        expect(dims.lifecycle_provenance).toBeNull();
    });

    it("returns nulls for tasks without Business Process metadata", () => {
        const row = baseRow();
        row.metadata = {};
        expect(extractOperationalTaskBpDimensions(row)).toEqual({
            department_id: null,
            lifecycle_stage_key: null,
            lifecycle_provenance: null,
            work_definition_key: null,
        });
    });
});

describe("toOperationalTaskApiRow", () => {
    it("strips the parsed work view, preserves metadata, and surfaces BP dimensions (API → client contract)", () => {
        const row = attachOperationalWorkView({
            ...baseRow(),
            metadata: {
                work_framework_version: 1,
                shape: "task",
                provenance: { source: "lifecycle_template" },
                department_id: "dept-1",
                lifecycle_stage_key: "tour_scheduled",
                lifecycle_provenance: "lifecycle_template",
                work_definition_key: "follow_up_after_tour",
            },
        });
        // Sanity: the parsed view exists before conversion.
        expect(row.work.shape).toBe("task");

        const apiRow = toOperationalTaskApiRow(row);
        // Parsed work view stripped.
        expect("work" in apiRow).toBe(false);
        // Existing fields preserved, including the full metadata jsonb.
        expect(apiRow.title).toBe("Follow up");
        expect(apiRow.metadata).toMatchObject({ work_definition_key: "follow_up_after_tour" });
        // BP dimensions additively surfaced (the fields the client groups by).
        expect(apiRow.department_id).toBe("dept-1");
        expect(apiRow.lifecycle_stage_key).toBe("tour_scheduled");
        expect(apiRow.lifecycle_provenance).toBe("lifecycle_template");
        expect(apiRow.work_definition_key).toBe("follow_up_after_tour");
    });

    it("surfaces null BP dimensions for a manual / cross-process task", () => {
        const apiRow = toOperationalTaskApiRow(attachOperationalWorkView(baseRow()));
        expect(apiRow.department_id).toBeNull();
        expect(apiRow.lifecycle_stage_key).toBeNull();
        expect(apiRow.lifecycle_provenance).toBeNull();
    });
});
