/**
 * Resolve compact CondensedQueueRow slot DISPLAY VALUES from frozen QueueRowContext.
 *
 * Builder field labels are metadata — never substitute for runtime values. When a slot has
 * configured `fieldKeys`, each key resolves to live row data; absent values omit the slot.
 */

import { formatQueueRowNameDisplay } from "@/lib/presentation/formatQueueRowNameDisplay";
import { formatQueueRowPhoneDisplay } from "@/lib/presentation/runtime/formatQueueRowContactDisplay";
import { isCollectionFieldKey } from "@/lib/presentation/collectionFieldPresentation";
import { resolveQueueRowChildrenFieldFromContext } from "@/lib/layout/runtime/queueRowChildrenFieldRegistry";
import {
    resolveQueueRowProcessStageLabel,
    resolveQueueRowRecordStatusLabel,
} from "@/lib/presentation/runtime/resolveQueueRowFieldLabelsFromContext";
import { queueRowSubjectDisplayName } from "@/lib/presentation/runtime/types";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { FocusedSubjectContext } from "@/lib/presentation/runtime/resolveQueueRowSubjectFocus";
import type { CompactRowSlotConfig, CompactRowSlots } from "@/lib/presentation/runtime/queueRowSurfaceConfig";

function contactLine(context: QueueRowContext): string | null {
    const parts: string[] = [];
    const contact = context.primary_contact;
    if (contact?.display_name?.trim()) parts.push(contact.display_name.trim());
    const phone = formatQueueRowPhoneDisplay(contact?.phone);
    if (phone) parts.push(phone);
    if (contact?.email?.trim()) parts.push(contact.email.trim());
    const related = context.related_subjects_summary
        .filter((subject) => subject.visibility !== "hidden")
        .map((subject) => subject.display_name.trim())
        .filter(Boolean);
    if (related.length) parts.push(related.join(", "));
    return parts.length ? parts.join(" · ") : null;
}

function focusSiblingChip(siblings: { count: number; summary: string | null }): string | null {
    if (siblings.count <= 0) return null;
    return siblings.summary?.trim() || `${siblings.count} ${siblings.count === 1 ? "child" : "children"}`;
}

function groupedCountLabel(context: QueueRowContext): string | null {
    if (context.row_presentation_mode !== "grouped_subjects") return null;
    const count = context.row_count ?? context.row_subjects?.length ?? null;
    if (count == null) return null;
    const unit = (context.row_count_unit ?? "records").replace(/_/g, " ");
    return `${count} ${unit}`;
}

export function resolveQueueRowFieldValueFromContext(
    fieldKey: string,
    context: QueueRowContext,
): string | null {
    const key = fieldKey.trim();
    if (!key) return null;

    const childrenResolved = resolveQueueRowChildrenFieldFromContext(key, context);
    if (childrenResolved != null) return childrenResolved;

    switch (key) {
        case "queue_row.stage_label":
            return resolveQueueRowProcessStageLabel(context);
        case "opportunity.status_label":
            return resolveQueueRowRecordStatusLabel(context);
        case "customer.display_name":
        case "queue_row.subject_label":
            return queueRowSubjectDisplayName(context).trim() || null;
        case "person.primary_contact_name":
            return context.primary_contact?.display_name?.trim() || null;
        case "person.phone":
            return context.primary_contact?.phone?.trim() || null;
        case "person.email":
            return context.primary_contact?.email?.trim() || null;
        case "opportunity.attention_reason":
            return context.attention_summary?.needs_attention
                ? context.attention_summary.primary_reason_label?.trim() || null
                : null;
        case "queue_row.work_summary":
            return (
                context.current_work_summary?.label?.trim()
                ?? context.next_best_action?.label?.trim()
                ?? context.work_summary?.primary_open_label?.trim()
                ?? null
            );
        case "queue_row.next_best_action_label":
            return context.next_best_action?.label?.trim() ?? null;
        case "queue_row.group_count_label":
            return groupedCountLabel(context);
        default:
            return null;
    }
}

function defaultSlotDisplay(
    slot: keyof CompactRowSlots,
    context: QueueRowContext,
    focus: FocusedSubjectContext | null,
): string | null {
    switch (slot) {
        case "subject":
            return focus?.primary.display_name?.trim() || queueRowSubjectDisplayName(context).trim() || null;
        case "status":
            return resolveQueueRowRecordStatusLabel(context);
        case "contact":
            return focus ? focus.supportingLines.join(" · ") || contactLine(context) : contactLine(context);
        case "attention":
            return context.attention_summary?.needs_attention
                ? context.attention_summary.primary_reason_label?.trim() || null
                : null;
        case "work":
            return (
                context.current_work_summary?.label?.trim()
                ?? context.next_best_action?.label?.trim()
                ?? context.work_summary?.primary_open_label?.trim()
                ?? null
            );
        case "groupCount":
            return focus?.siblings ? focusSiblingChip(focus.siblings) : groupedCountLabel(context);
        default:
            return null;
    }
}

/** Resolve the runtime display string for one compact slot (null → hide; never emit field labels). */
export function resolveCompactSlotDisplay(
    slot: keyof CompactRowSlots,
    context: QueueRowContext,
    config: CompactRowSlotConfig | undefined,
    focus: FocusedSubjectContext | null | undefined,
): string | null {
    const resolvedFocus = focus ?? null;
    if (config?.fieldKeys?.length) {
        const parts = config.fieldKeys
            .map((key) => {
                if (isCollectionFieldKey(key)) {
                    return resolveQueueRowChildrenFieldFromContext(key, context, {
                        collectionPresentation: config.collectionPresentationByFieldKey?.[key],
                        nameDisplay: config.nameDisplayByFieldKey?.[key],
                    });
                }
                const raw = resolveQueueRowFieldValueFromContext(key, context);
                if (!raw?.trim()) return null;
                if (key === "person.phone") {
                    return formatQueueRowPhoneDisplay(raw);
                }
                return formatQueueRowNameDisplay(raw, config.nameDisplayByFieldKey?.[key], key);
            })
            .filter((value): value is string => Boolean(value?.trim()));
        return parts.length ? parts.join(" · ") : null;
    }
    return defaultSlotDisplay(slot, context, resolvedFocus);
}
