/**
 * Build normalized operational queue row view model from layout doc + record or CRM slots.
 */

import type { LayoutCollectionColumn, LayoutDoc, LayoutFieldAdornment, LayoutItem } from "@/lib/layout/layoutV2";
import { ensureLayoutRuntimeChildLinkAdornment } from "@/lib/layout/runtime/layoutRuntimeLinkHarness";
import type { QueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import { resolveQueueRecordLayoutConfig } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import {
    queueBodyChildrenScalarFieldsExcludingRepeater,
    queueBodyChildrenZoneItems,
    resolveQueueCardChildrenRepeaterItem,
} from "@/lib/layout/runtime/resolveQueueCardChildrenLayoutItem";
import { layoutRuntimeRepeaterFieldDisplay } from "@/lib/layout/runtime/resolveLayoutRuntimeRepeaterFieldValue";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    bucketizeQueueCardLayout,
    queueCardAll,
    queueCardFirst,
} from "@/lib/layout/runtime/queueCardLayoutBuckets";
import type { CrmCompactChildLineVm, CrmCompactRowSemanticSlots } from "@/lib/ui-v2/workspace-types";
import { mergeOperationalVmWithQueueRowContext } from "@/lib/layout/runtime/applyQueueRowContextToLayoutRuntime";
import { buildEnrollmentHeaderAttentionInline } from "@/lib/ui-v2/workUnitQueueRowHeaderPresentation";

export type OperationalQueueRelatedChipVm = {
    id: string | null;
    display: string;
    secondary: string | null;
    adornment: LayoutFieldAdornment | null;
    rowRecord: ProofRuntimeRecord | null;
};

export type OperationalQueueRecordViewModel = {
    identity: {
        title: string;
        contactName: string | null;
        contactPhone: string | null;
        contactEmail: string | null;
        contactAdornment: LayoutFieldAdornment | null;
        contactItem: LayoutItem | null;
    };
    relatedRecords: {
        label: string;
        entityType: string;
        chips: OperationalQueueRelatedChipVm[];
        emptyLabel: string;
    };
    status: {
        label: string | null;
        context: string | null;
    };
    attention: {
        reason: string | null;
        nextStep: string | null;
    };
    date: {
        label: string;
        value: string | null;
        missingLabel: string;
    };
    actionLabels: string[];
    hasAttention: boolean;
};

function pickDisplay(record: ProofRuntimeRecord, item: LayoutItem | undefined): string | null {
    if (!item) return null;
    const r = resolveItemValue(record, item);
    return r.isPlaceholder ? null : (r.display ?? null);
}

function isNameRefKey(refKey: string): boolean {
    return /full_name|\.name$|first_name|display_name/i.test(refKey);
}

function resolveChipDisplay(
    row: ProofRuntimeRecord,
    cols: LayoutCollectionColumn[],
): { display: string; secondary: string | null; adornment: LayoutFieldAdornment | null } {
    const nameCol =
        cols.find((c) => isNameRefKey(c.refKey)) ??
        cols.find((c) => !c.renderHint || c.renderHint === "text") ??
        cols[0];
    const secondaryCol = cols.find(
        (c) => c !== nameCol && (c.refKey.includes("program") || c.refKey.includes("age")),
    );

    const nameVal = nameCol
        ? layoutRuntimeRepeaterFieldDisplay(row, nameCol.refKey, {
              renderHint: nameCol.renderHint,
              template: nameCol.template,
          })
        : null;
    const secondaryVal = secondaryCol
        ? layoutRuntimeRepeaterFieldDisplay(row, secondaryCol.refKey, {
              renderHint: secondaryCol.renderHint,
              template: secondaryCol.template,
          })
        : null;

    const display = nameVal && !nameVal.placeholder ? nameVal.text : "—";
    const secondary =
        secondaryVal && !secondaryVal.placeholder && secondaryVal.text !== "—" ? secondaryVal.text : null;

    return {
        display,
        secondary,
        adornment: ensureLayoutRuntimeChildLinkAdornment(
            nameCol?.adornment ?? cols.find((c) => c.adornment)?.adornment,
            nameCol?.refKey,
        ),
    };
}

function resolveRelatedId(row: ProofRuntimeRecord): string | null {
    const raw = row["child.id"] ?? row.person_id ?? row.id;
    if (raw == null || raw === "") return null;
    return String(raw).trim() || null;
}

function pluralizeEntityLabel(entityType: string, count: number): string {
    const base = entityType.trim() || "Related";
    const normalized = base.charAt(0).toUpperCase() + base.slice(1);
    if (count === 1) return normalized;
    if (normalized.endsWith("s")) return `${normalized} (${count})`;
    if (normalized.endsWith("child")) return `Children (${count})`;
    return `${normalized}s (${count})`;
}

function buildRelatedFromLayout(
    record: ProofRuntimeRecord,
    buckets: ReturnType<typeof bucketizeQueueCardLayout>,
): OperationalQueueRecordViewModel["relatedRecords"] {
    const bodyChildrenZone = queueBodyChildrenZoneItems(buckets.fields);
    const childrenRepeaterItem = resolveQueueCardChildrenRepeaterItem(bodyChildrenZone, record);
    const entityType = childrenRepeaterItem?.related?.entityType ?? "related";
    const cols = (childrenRepeaterItem?.columns ?? []) as LayoutCollectionColumn[];
    const rows = childrenRepeaterItem ? readLayoutRuntimeRepeaterRows(record, childrenRepeaterItem) : [];

    const chips: OperationalQueueRelatedChipVm[] = rows.map((row) => {
        const { display, secondary, adornment } = resolveChipDisplay(row, cols);
        return {
            id: resolveRelatedId(row),
            display,
            secondary,
            adornment,
            rowRecord: row,
        };
    });

    const scalarFields = queueBodyChildrenScalarFieldsExcludingRepeater(
        bodyChildrenZone,
        childrenRepeaterItem,
    );
    if (chips.length === 0 && scalarFields.length > 0) {
        for (const field of scalarFields) {
            const text = pickDisplay(record, field);
            if (text) {
                chips.push({
                    id: null,
                    display: text,
                    secondary: null,
                    adornment: field.adornment ?? null,
                    rowRecord: null,
                });
            }
        }
    }

    const count = chips.length;
    const configuredLabel = childrenRepeaterItem?.label?.trim();
    const label =
        count > 0
            ? configuredLabel
                ? `${configuredLabel} (${count})`
                : pluralizeEntityLabel(entityType, count)
            : configuredLabel || "Related";

    return {
        label,
        entityType,
        chips,
        emptyLabel: `No ${entityType === "child" ? "children" : `${entityType} records`} yet`,
    };
}

export function buildOperationalQueueRecordViewModelFromLayout(
    doc: LayoutDoc,
    record: ProofRuntimeRecord,
    config?: QueueRecordLayoutConfig,
): OperationalQueueRecordViewModel {
    void (config ?? resolveQueueRecordLayoutConfig(doc));
    const buckets = bucketizeQueueCardLayout(doc);

    const titleItem = queueCardFirst(buckets, "header.title") ?? queueCardFirst(buckets, "header.identity");
    const title =
        pickDisplay(record, titleItem) ??
        [record.name, record.last_name, record.title]
            .map((v) => (v == null ? "" : String(v).trim()))
            .find((v) => v.length > 0) ??
        "Record";

    const contactItems = buckets.fields["body.contact"] ?? [];
    const contactNameItem = contactItems.find((i) => i.refKey.includes("name")) ?? contactItems[0];
    const contactPhoneItem = contactItems.find((i) => i.refKey.includes("phone") || i.adornment?.icon === "phone");
    const contactEmailItem = contactItems.find((i) => i.refKey.includes("email") || i.adornment?.icon === "mail");

    const statusItem = queueCardFirst(buckets, "header.status");
    const locationItem = queueCardFirst(buckets, "header.location");
    const attentionItem = queueCardFirst(buckets, "header.attention");
    const contextFields = queueCardAll(buckets, "context.primary", "context.secondary");
    const tourItem = queueCardFirst(buckets, "body.tour");

    const attentionFromContext = contextFields
        .map((f) => pickDisplay(record, f))
        .find((v) => v && v.trim());
    const attentionReason = pickDisplay(record, attentionItem) ?? attentionFromContext ?? null;
    const nextStepRaw = pickDisplay(record, { id: "next", kind: "field", refKey: "next_step" } as LayoutItem);
    const nextStep = nextStepRaw ?? pickDisplay(record, queueCardFirst(buckets, "context.primary")) ?? null;

    const tourValue = pickDisplay(record, tourItem);
    const dateLabel = tourItem?.label?.trim() || "Tour";

    const vm: OperationalQueueRecordViewModel = {
        identity: {
            title,
            contactName: pickDisplay(record, contactNameItem),
            contactPhone: pickDisplay(record, contactPhoneItem),
            contactEmail: pickDisplay(record, contactEmailItem),
            contactAdornment: contactNameItem?.adornment ?? null,
            contactItem: contactNameItem ?? null,
        },
        relatedRecords: buildRelatedFromLayout(record, buckets),
        status: {
            label: pickDisplay(record, statusItem),
            context: pickDisplay(record, locationItem),
        },
        attention: {
            reason: attentionReason,
            nextStep: nextStep,
        },
        date: {
            label: dateLabel,
            value: tourValue,
            missingLabel: "Not scheduled",
        },
        actionLabels: buckets.actionLabels,
        hasAttention: Boolean(attentionReason?.trim()),
    };

    return mergeOperationalVmWithQueueRowContext(vm, record);
}

function buildRelatedFromCrmSlots(slots: CrmCompactRowSemanticSlots): OperationalQueueRecordViewModel["relatedRecords"] {
    const lines: CrmCompactChildLineVm[] =
        slots.childrenLines && slots.childrenLines.length > 0
            ? slots.childrenLines
            : slots.childName?.trim()
              ? [{ primary: slots.childName.trim(), secondary: slots.programContext, personId: slots.childPersonId }]
              : [];

    const entityType = "related";
    const chips: OperationalQueueRelatedChipVm[] = lines.map((line) => ({
        id: line.personId ?? null,
        display: line.primary,
        secondary: line.programInline?.trim() || line.secondary?.trim() || null,
        adornment: {
            position: "left",
            icon: "child",
            action: { type: "open_drawer", entity: "child", idPath: "child.id" },
        },
        rowRecord: line.personId
            ? ({ id: line.personId, "child.id": line.personId } as ProofRuntimeRecord)
            : null,
    }));

    const count = chips.length;
    const label = count > 0 ? `Related (${count})` : "Related";

    return {
        label,
        entityType,
        chips,
        emptyLabel: "No related records",
    };
}

export type BuildOperationalQueueRecordViewModelFromCrmOpts = {
    config?: QueueRecordLayoutConfig;
    waitlistStatusLabel?: string | null;
    waitlistPlacementLabel?: string | null;
    waitlistCandidateChildName?: string | null;
    waitlistCandidateChildPersonId?: string | null;
    waitlistCandidateProgram?: string | null;
};

export function buildOperationalQueueRecordViewModelFromCrmSlots(
    slots: CrmCompactRowSemanticSlots,
    opts?: BuildOperationalQueueRecordViewModelFromCrmOpts,
): OperationalQueueRecordViewModel {
    const stageStatus =
        opts?.waitlistStatusLabel?.trim() ||
        (slots.stageLabel && slots.statusLabel && slots.stageLabel !== slots.statusLabel
            ? `${slots.stageLabel} · ${slots.statusLabel}`
            : slots.stageLabel || slots.statusLabel || null);

    const enrollmentAttention = buildEnrollmentHeaderAttentionInline(slots);
    const attentionReason =
        slots.attentionReason?.trim() ||
        slots.queuePriorityExplanation?.trim() ||
        enrollmentAttention?.inline?.trim() ||
        null;
    const nextStep = slots.operationalNextHint?.trim() || slots.nextStep?.trim() || null;

    const tourValue = slots.tourContext?.trim();

    const relatedFromWaitlistCandidate =
        opts?.waitlistCandidateChildName?.trim() ?
            [
                {
                    id: opts.waitlistCandidateChildPersonId ?? null,
                    display: opts.waitlistCandidateChildName.trim(),
                    secondary: opts.waitlistCandidateProgram?.trim() || null,
                    adornment: {
                        position: "left" as const,
                        icon: "child" as const,
                        action: { type: "open_drawer" as const, entity: "child" as const, idPath: "child.id" },
                    },
                    rowRecord: opts.waitlistCandidateChildPersonId
                        ? ({ id: opts.waitlistCandidateChildPersonId, "child.id": opts.waitlistCandidateChildPersonId } as ProofRuntimeRecord)
                        : null,
                },
            ]
        :   null;

    const baseRelated = buildRelatedFromCrmSlots(slots);
    const relatedRecords =
        relatedFromWaitlistCandidate ?
            {
                ...baseRelated,
                chips: relatedFromWaitlistCandidate,
                label: `Related (${relatedFromWaitlistCandidate.length})`,
            }
        :   baseRelated;

    return {
        identity: {
            title: slots.primaryIdentity?.trim() || "Record",
            contactName: slots.contactDisplayName?.trim() || null,
            contactPhone: slots.contactPhoneDisplay?.trim() || null,
            contactEmail: slots.contactEmail?.trim() || null,
            contactAdornment: {
                position: "left",
                icon: "person",
                action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" },
            },
            contactItem: null,
        },
        relatedRecords,
        status: {
            label: stageStatus,
            context:
                opts?.waitlistPlacementLabel?.trim() ||
                slots.waitlistHouseholdContext?.trim() ||
                slots.locationContext?.trim() ||
                slots.programContext?.trim() ||
                slots.roomContext?.trim() ||
                null,
        },
        attention: {
            reason: attentionReason,
            nextStep,
        },
        date: {
            label: slots.rowPreviewLabelTourDate?.trim() || "Tour",
            value: tourValue && tourValue !== "—" ? tourValue : null,
            missingLabel: "Not scheduled",
        },
        actionLabels: [],
        hasAttention: Boolean(attentionReason?.trim()),
    };
}
