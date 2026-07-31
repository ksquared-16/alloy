/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
    resolveQueueRowProcessStageLabel,
    resolveQueueRowRecordStatusLabel,
} from "@/lib/presentation/runtime/resolveQueueRowFieldLabelsFromContext";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

function baseContext(over: Partial<QueueRowContext> = {}): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Jordan Lee" },
        // When no subject stage key is present, row_stage is the process-stage label
        // (buildPartialQueueRowContext resolves it from the row, not the Work View lane).
        row_stage: "Lead",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "Open",
        case_context: {
            case_id: "opp-1",
            display_name: "Jordan Lee",
            case_type_label: "Enrollment",
            case_status_key: "open",
            case_status_label: "Active",
        },
        primary_contact: null,
        related_subjects_summary: [],
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
        ...over,
    };
}

describe("resolveQueueRowFieldLabelsFromContext", () => {
    it("Stage resolves process stage from row_stage when the subject carries no stage key", () => {
        expect(resolveQueueRowProcessStageLabel(baseContext())).toBe("Lead");
        expect(resolveQueueRowProcessStageLabel(baseContext({ row_stage: "Tour" }))).toBe("Tour");
    });

    it("Stage resolves the SUBJECT's stage over a lane-like row_stage", () => {
        // A Work View scopes several stages — do not show the lane name as the family's stage.
        expect(
            resolveQueueRowProcessStageLabel(
                baseContext({
                    row_stage: "New Leads",
                    drawer_open: {
                        entity_type: "opportunities",
                        entity_id: "opp-1",
                        stage_focus_key: "tour",
                    },
                }),
            ),
        ).toBe("Tour");
    });

    it("Stage prefers the tenant's authored label over a humanized key", () => {
        expect(
            resolveQueueRowProcessStageLabel(
                baseContext({
                    row_stage: "New Leads",
                    stage_labels_by_key: { tour: "Tours" },
                    drawer_open: {
                        entity_type: "opportunities",
                        entity_id: "opp-1",
                        stage_focus_key: "tour",
                    },
                }),
            ),
        ).toBe("Tours");
    });

    it("Stage reads active_subject.stage_key when stage_focus_key is absent", () => {
        expect(
            resolveQueueRowProcessStageLabel(
                baseContext({
                    row_stage: "New Leads",
                    drawer_open: {
                        entity_type: "opportunities",
                        entity_id: "opp-1",
                        active_subject: {
                            subject_type: "case",
                            subject_id: "opp-1",
                            lifecycle_key: "enrollment",
                            stage_key: "contacting",
                            status_key: "open",
                        },
                    },
                }),
            ),
        ).toBe("Contacting");
    });

    it("Status resolves record disposition from row_status_label", () => {
        expect(resolveQueueRowRecordStatusLabel(baseContext())).toBe("Open");
        expect(resolveQueueRowRecordStatusLabel(baseContext({ row_status_label: "Tour scheduled" }))).toBe(
            "Tour scheduled",
        );
    });

    it("Stage and Status stay distinct when both are present", () => {
        const ctx = baseContext({
            row_status_label: "Open",
            stage_labels_by_key: { qualified: "Qualified" },
            drawer_open: {
                entity_type: "opportunities",
                entity_id: "opp-1",
                stage_focus_key: "qualified",
            },
        });
        expect(resolveQueueRowProcessStageLabel(ctx)).toBe("Qualified");
        expect(resolveQueueRowRecordStatusLabel(ctx)).toBe("Open");
    });
});
