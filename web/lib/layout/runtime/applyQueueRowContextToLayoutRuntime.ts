/**
 * Apply `_queue_row_context` presentation onto layout-runtime queue records / view models.
 * Redesign / proof path only — production CRM compact rows unchanged when context absent.
 */

import {
    formatOpportunityOperatorDisplayLabel,
    isGenericOpportunityBoilerplateLabel,
} from "@/lib/admin/opportunityDisplayLabel";
import type { OperationalQueueRecordViewModel } from "@/lib/layout/runtime/buildOperationalQueueRecordViewModel";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    readQueueRowContextFromRow,
    resolveQueueRowContextPresentation,
    type QueueRowContextPresentation,
} from "@/lib/workUnits/resolveQueueRowContextPresentation";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import {
    shouldSuppressDuplicateCaseSubjectLabel,
    suppressDuplicateQueueRowSubjectOnRecord,
} from "@/lib/layout/runtime/queueRowSubjectPresentation";

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function contextPrimaryLabelIsBoilerplate(raw: string): boolean {
    const trimmed = raw.trim();
    if (!trimmed) return true;
    return isGenericOpportunityBoilerplateLabel(trimmed) || /^family\s+inquiry\s*[-–—:|]/i.test(trimmed);
}

function overlayContextHouseholdFields(
    mutable: Record<string, unknown>,
    presentation: QueueRowContextPresentation,
): void {
    const raw = trimOrNull(presentation.primaryLabel);
    if (!raw) return;

    const formatted = formatOpportunityOperatorDisplayLabel(raw, {
        customerName: trimOrNull(mutable["customer.display_name"]) ?? trimOrNull(mutable.name),
        locationName: trimOrNull(mutable["opportunity.location"]),
    });
    const overlayLabel = formatted || raw;
    const boilerplate = contextPrimaryLabelIsBoilerplate(raw);
    const existingHousehold = trimOrNull(mutable["customer.display_name"]) ?? trimOrNull(mutable.name);

    if (boilerplate && existingHousehold) {
        return;
    }

    const householdKeys = ["customer.display_name", "customer.name", "name", "opportunity.title"] as const;
    for (const key of householdKeys) {
        if (boilerplate) {
            if (!trimOrNull(mutable[key])) mutable[key] = overlayLabel;
        } else {
            mutable[key] = overlayLabel;
        }
    }
}

/** Overlay context-first fields onto a layout runtime queue row record (additive). */
export function applyQueueRowContextToLayoutRecord(
    record: ProofRuntimeRecord,
    context?: QueueRowContext | null,
): ProofRuntimeRecord {
    const ctx = context ?? readQueueRowContextFromRow(record);
    if (!ctx) return record;

    const presentation = resolveQueueRowContextPresentation({ context: ctx, legacy: { record } });
    const mutable = record as Record<string, unknown>;
    mutable._queue_row_context = ctx;

    overlayContextHouseholdFields(mutable, presentation);

    if (presentation.statusLabel) {
        mutable._status_display = presentation.statusLabel;
        mutable["opportunity.status_label"] = presentation.statusLabel;
        mutable["opportunity.status_key"] = trimOrNull(ctx.row_status_key) ?? mutable["opportunity.status_key"];
        mutable.status_key = trimOrNull(ctx.row_status_key) ?? mutable.status_key;
    }

    if (presentation.placementSummary) {
        mutable["opportunity.location"] = presentation.placementSummary;
    }

    if (presentation.primaryContact) {
        const contact = presentation.primaryContact;
        if (trimOrNull(contact.display_name)) {
            mutable["person.primary_contact_name"] = contact.display_name;
        }
        if (trimOrNull(contact.phone)) {
            mutable["person.primary_phone"] = contact.phone;
            mutable["person.phone"] = contact.phone;
        }
        if (trimOrNull(contact.email)) {
            mutable["person.primary_email"] = contact.email;
            mutable["person.email"] = contact.email;
        }
    }

    if (presentation.stageLabel) {
        mutable["queue_row.stage_label"] = presentation.stageLabel;
    }

    const subjectLabel = trimOrNull(ctx.row_subject?.display_name);
    const caseLabel =
        trimOrNull(mutable["customer.display_name"])
        ?? trimOrNull(mutable.name)
        ?? trimOrNull(presentation.caseFamilyLabel);
    if (subjectLabel && !shouldSuppressDuplicateCaseSubjectLabel(caseLabel, subjectLabel)) {
        mutable["queue_row.subject_label"] = subjectLabel;
    }

    if (ctx.work_summary?.primary_open_label) {
        mutable["queue_row.work_summary"] = ctx.work_summary.primary_open_label;
    }

    if (ctx.next_best_action?.label) {
        mutable["queue_row.next_best_action_label"] = ctx.next_best_action.label;
    }

    if (presentation.attentionSummary?.primary_reason_label) {
        const reason = presentation.attentionSummary.primary_reason_label;
        mutable["opportunity.attention_reason"] = reason;
        mutable._attention = reason;
        mutable._attention_reason_label = reason;
    }

    if (presentation.relatedChildrenSummary.length > 0) {
        const existingChildren = mutable.children;
        if (!Array.isArray(existingChildren) || existingChildren.length === 0) {
            const childRows = presentation.relatedChildrenSummary.map((child, index) => {
                const subjectId = trimOrNull(child.subject_id);
                const programParts = [child.program_label, child.room_label].filter(Boolean) as string[];
                return {
                    id: subjectId ?? `context-child-${index}`,
                    person_id: subjectId ?? "",
                    "child.id": subjectId ?? "",
                    "child.name": child.display_name,
                    "child.display_name": child.display_name,
                    "child.program": programParts.join(" · "),
                    "child.status": child.status_label,
                };
            });
            mutable.children = childRows;
            mutable.enrollment_children = childRows;
        }
    }

    return suppressDuplicateQueueRowSubjectOnRecord(record);
}

function buildRelatedChipsFromPresentation(
    presentation: QueueRowContextPresentation,
    existingVm: OperationalQueueRecordViewModel,
): OperationalQueueRecordViewModel["relatedRecords"] {
    const summaries = presentation.relatedChildrenSummary;
    if (!summaries.length) return existingVm.relatedRecords;

    const chips = summaries.map((child) => {
        const secondaryParts = [
            child.status_label !== "—" ? child.status_label : null,
            child.program_label,
            child.room_label,
        ].filter(Boolean) as string[];
        const secondary = secondaryParts.length > 0 ? secondaryParts.join(" · ") : null;
        const subjectId = trimOrNull(child.subject_id);
        return {
            id: subjectId,
            display: child.display_name,
            secondary,
            adornment: {
                position: "left" as const,
                icon: "child" as const,
                action: { type: "open_drawer" as const, entity: "child" as const, idPath: "child.id" },
            },
            rowRecord: subjectId
                ? ({ id: subjectId, "child.id": subjectId } as ProofRuntimeRecord)
                : null,
        };
    });

    const count = chips.length;
    const label = count > 0 ? `Related (${count})` : existingVm.relatedRecords.label;

    return {
        ...existingVm.relatedRecords,
        label,
        chips,
        emptyLabel: existingVm.relatedRecords.emptyLabel,
    };
}

/** Merge context presentation into operational queue VM (layout-runtime / proof path). */
export function mergeOperationalVmWithQueueRowContext(
    vm: OperationalQueueRecordViewModel,
    record: ProofRuntimeRecord,
): OperationalQueueRecordViewModel {
    const ctx = readQueueRowContextFromRow(record);
    if (!ctx) return vm;

    const presentation = resolveQueueRowContextPresentation({ context: ctx, legacy: { record } });

    const contact = presentation.primaryContact;
    const statusLabel =
        presentation.stageLabel && presentation.statusLabel
            ? `${presentation.stageLabel} · ${presentation.statusLabel}`
            : presentation.statusLabel || presentation.stageLabel || vm.status.label;

    return {
        ...vm,
        identity: {
            ...vm.identity,
            title:
                trimOrNull(record["customer.display_name"])
                ?? trimOrNull(record.name)
                ?? (contextPrimaryLabelIsBoilerplate(presentation.primaryLabel) ?
                    vm.identity.title
                :   formatOpportunityOperatorDisplayLabel(presentation.primaryLabel) || vm.identity.title),
            contactName: contact?.display_name?.trim() || vm.identity.contactName,
            contactPhone: trimOrNull(contact?.phone) ?? vm.identity.contactPhone,
            contactEmail: trimOrNull(contact?.email) ?? vm.identity.contactEmail,
        },
        status: {
            label: statusLabel ?? vm.status.label,
            context: presentation.placementSummary ?? vm.status.context,
        },
        attention: {
            reason: presentation.attentionSummary?.primary_reason_label ?? vm.attention.reason,
            nextStep: vm.attention.nextStep,
        },
        relatedRecords: buildRelatedChipsFromPresentation(presentation, vm),
        hasAttention: presentation.attentionSummary?.needs_attention ?? vm.hasAttention,
    };
}

export function queueRowContextDebugDataAttributes(
    presentation: QueueRowContextPresentation,
): Record<string, string | undefined> {
    if (!presentation.debug.contextPresent) {
        return {
            "data-queue-row-context-present": "false",
        };
    }
    return {
        "data-queue-row-context-present": "true",
        "data-queue-row-context-version": presentation.debug.contractVersion ?? undefined,
        "data-queue-row-placement-present": presentation.debug.placementPresent ? "true" : "false",
        "data-queue-row-placement-omitted-mixed": presentation.debug.placementOmittedMixed ? "true" : "false",
    };
}
