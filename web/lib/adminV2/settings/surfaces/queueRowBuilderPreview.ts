/**
 * Queue Row Builder — preview scaffolding (edit canvas only).
 *
 * The runtime always renders live QueueRowContext from the queue API.
 * The builder synthesizes placeholder context from the operator's in-progress
 * config so placed items appear on the real CondensedQueueRow canvas.
 *
 * Children names/count/summary MUST seed `related_subjects_summary` — the same
 * payload path CondensedQueueRow uses live — so Live Preview is truthful.
 */

import type { QueueRowModel } from "@/lib/presentation/runtime";
import { mapQueueRowSurfaceToCompactConfig } from "@/lib/presentation/runtime/queueRowSurfaceConfig";
import type { QueueRecordLayoutConfigV3 } from "@/lib/layout/queueRecordLayoutV3";
import type { QueueRowContext, RelatedSubjectSummary } from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    isCollectionFieldKey,
    isLegacyChildrenCollectionFieldKey,
} from "@/lib/presentation/collectionFieldPresentation";

/** Minimal frozen context — empty row before the operator adds anything. */
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

type EnabledPreviewField = { fieldKey: string; label: string };

function enabledFieldsFromConfig(config: QueueRecordLayoutConfigV3): EnabledPreviewField[] {
    const fields: EnabledPreviewField[] = [];
    for (const col of config.columns) {
        for (const block of col.blocks) {
            if (block.type === "field_group" || block.type === "repeated_record_block") {
                for (const field of block.fields) {
                    fields.push({
                        fieldKey: field.fieldKey,
                        label: (field.label ?? field.fieldKey.split(".").pop() ?? field.fieldKey).trim(),
                    });
                }
            }
            if (block.type === "widget") {
                const widgetLabels: Record<string, string> = {
                    attention: "Attention",
                    current_work: "Tasks",
                    follow_ups: "Follow-up needed",
                    activity_timeline: "Last activity",
                };
                fields.push({
                    fieldKey: `widget:${block.widgetKey}`,
                    label: block.label ?? widgetLabels[block.widgetKey] ?? block.widgetKey.replace(/_/g, " "),
                });
            }
        }
    }
    return fields;
}

const PREVIEW_CHILDREN: readonly RelatedSubjectSummary[] = [
    {
        subject_type: "child",
        subject_id: "preview-child-1",
        display_name: "Blake Wenc",
        status_label: "—",
    },
    {
        subject_type: "child",
        subject_id: "preview-child-2",
        display_name: "Jarek Wenc",
        status_label: "—",
    },
];

function configNeedsChildrenPreview(fields: readonly EnabledPreviewField[]): boolean {
    return fields.some(
        (field) =>
            isCollectionFieldKey(field.fieldKey)
            || isLegacyChildrenCollectionFieldKey(field.fieldKey)
            || field.fieldKey === "child.name",
    );
}

/**
 * Build a preview row whose visible lines reflect configured fields/widgets.
 * Uses field labels as placeholder values for scalar slots — and real sample
 * child subjects for children.names / count / summary so CondensedQueueRow
 * resolves the same way as the live queue.
 */
export function previewRowModelFromConfig(config: QueueRecordLayoutConfigV3): QueueRowModel {
    const base = blankPreviewRowModel();
    const ctx = base.context;
    if (!ctx) return base;

    const compactConfig = mapQueueRowSurfaceToCompactConfig(config);
    if (compactConfig.slots.subject.label) {
        ctx.row_subject.display_name = compactConfig.slots.subject.label;
        ctx.case_context.display_name = compactConfig.slots.subject.label;
    }
    if (compactConfig.slots.status.label) {
        ctx.row_status_label = compactConfig.slots.status.label;
        ctx.row_stage = compactConfig.slots.status.label;
    }
    if (compactConfig.slots.contact.label) {
        ctx.primary_contact = { display_name: compactConfig.slots.contact.label };
    }
    if (compactConfig.slots.attention.label) {
        ctx.attention_summary = {
            needs_attention: true,
            primary_reason_label: compactConfig.slots.attention.label,
        };
    }
    if (compactConfig.slots.work.label) {
        ctx.current_work_summary = {
            label: compactConfig.slots.work.label,
            state: "open",
            due_label: null,
            progress_hint: null,
            blocker_hint: null,
        };
    }

    const enabled = enabledFieldsFromConfig(config);
    if (configNeedsChildrenPreview(enabled) || compactConfig.slots.groupCount.fieldKeys?.some(isCollectionFieldKey)) {
        ctx.related_subjects_summary = [...PREVIEW_CHILDREN];
        ctx.row_count = PREVIEW_CHILDREN.length;
        ctx.row_count_unit = "children";
        // Keep single_subject + related_subjects — same path as family enrollment rows.
        ctx.row_presentation_mode = "single_subject";
        if (!ctx.row_subject.display_name) {
            ctx.row_subject.display_name = "Wenc";
            ctx.case_context.display_name = "Wenc";
        }
    } else if (compactConfig.slots.groupCount.label) {
        ctx.row_presentation_mode = "grouped_subjects";
        ctx.row_count = 2;
        ctx.row_count_unit = "children";
    }

    for (const { fieldKey, label } of enabled) {
        if (fieldKey.startsWith("widget:")) {
            const widgetKey = fieldKey.slice("widget:".length);
            if (widgetKey === "attention" || widgetKey === "follow_ups") {
                ctx.attention_summary = {
                    needs_attention: true,
                    primary_reason_label: label,
                };
            }
            if (widgetKey === "current_work" || widgetKey === "activity_timeline") {
                ctx.current_work_summary = {
                    label,
                    state: "open",
                    due_label: null,
                    progress_hint: null,
                    blocker_hint: null,
                };
            }
            continue;
        }

        if (fieldKey.startsWith("waitlist.")) {
            ctx.row_presentation_mode = "grouped_subjects";
            ctx.row_count = 12;
            ctx.row_count_unit = "candidates";
            if (fieldKey === "waitlist.positionLabel" && !ctx.row_subject.display_name) {
                ctx.row_subject.display_name = `#12 · ${label}`;
            }
        }
    }

    return base;
}

export {
    resolveQueueRowCatalogIsWaitlist,
    resolveQueueRowIncludeWaitlistLibraryFields,
    resolveQueueRowLibraryIsWaitlist,
} from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
