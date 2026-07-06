/**
 * Queue Row Builder — preview scaffolding (edit canvas only).
 *
 * The runtime always renders live QueueRowContext from the queue API.
 * The builder uses a minimal blank row so configured fields/widgets drive
 * the preview — never hardcoded sample household/contact copy.
 */

import type { QueueRowModel } from "@/lib/presentation/runtime";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

/** Minimal frozen context — slots stay empty until the operator adds configured items. */
export function blankPreviewRowModel(): QueueRowModel {
    const context: QueueRowContext = {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "builder-preview", display_name: "" },
        row_stage: "",
        lifecycle_key: "enrollment",
        row_status_key: "",
        row_status_label: "",
        case_context: {
            case_id: "builder-preview",
            display_name: "",
            case_type_label: "",
            case_status_key: "",
            case_status_label: "",
        },
        primary_contact: null,
        related_subjects_summary: [],
        row_presentation_mode: "single_subject",
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "builder-preview" },
    };
    return { context, entityType: "opportunity", entityId: "builder-preview" };
}

export { resolveQueueRowLibraryIsWaitlist } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
