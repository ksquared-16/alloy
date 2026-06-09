"use client";

import type { MouseEvent, ReactNode } from "react";
import AdornmentIcon from "@/components/layout/AdornmentIcon";
import QueueRecordAttentionWidget from "@/components/layout/queueRecord/QueueRecordAttentionWidget";
import QueueRecordTasksWidget from "@/components/layout/queueRecord/QueueRecordTasksWidget";
import QueueRowOpenZone from "@/components/layout/QueueRowOpenZone";
import { isQueueRowLinkQaEnabled, resolveQueueRowLinkQaLabel } from "@/lib/debug/queueRowLinkQa";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import type { QueueLayoutDrawerIconHandlers } from "@/lib/layout/runtime/buildQueueLayoutRuntimeAdornmentHandler";
import { openQueueRecordLinkedDrawer } from "@/lib/layout/runtime/openQueueRecordLinkedDrawer";
import { isQueueRecordLinkResolvable } from "@/lib/layout/runtime/resolveQueueRecordLinkTargetId";
import {
    linkTargetEntity,
    type QueueRecordResolvedField,
} from "@/lib/layout/runtime/queueRecordScopedResolve";
import {
    queueRecordFieldShowsLabel,
    type QueueRecordBlockConfig,
    type QueueRecordFieldConfig,
} from "@/lib/layout/queueRecordLayoutV3";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    queueRecordFieldModifierClass,
    queueRecordFieldTypographyClass,
} from "@/lib/layout/runtime/queueRecordFieldTypography";
import {
    queueRecordStatusPillToneClass,
    resolveQueueRecordStatusPillTone,
    type QueueRecordStatusPillTone,
} from "@/lib/layout/runtime/resolveQueueRecordStatusPillTone";

export type QueueRecordFieldRendererProps = {
    resolved: QueueRecordResolvedField;
    record: ProofRuntimeRecord;
    anchorRecord: ProofRuntimeRecord;
    drawerHandlers?: QueueLayoutDrawerIconHandlers;
    onOpen?: () => void;
};

function linkEntityAttr(entity: ReturnType<typeof linkTargetEntity>): string {
    if (entity === "child") return "child";
    if (entity === "person") return "person";
    return "opportunity";
}

export function QueueRecordLinkedField({
    field,
    item,
    record,
    anchorRecord,
    display,
    drawerHandlers,
    onOpenOpportunity,
}: {
    field: QueueRecordFieldConfig;
    item: LayoutItem;
    record: ProofRuntimeRecord;
    anchorRecord: ProofRuntimeRecord;
    display: string;
    drawerHandlers?: QueueLayoutDrawerIconHandlers;
    onOpenOpportunity?: () => void;
}) {
    const target = field.link?.target;
    const entity = target ? linkTargetEntity(target) : null;
    const adornment = item.adornment;
    const resolvable = isQueueRecordLinkResolvable(field, record, anchorRecord);
    const qaLabel = isQueueRowLinkQaEnabled()
        ? resolveQueueRowLinkQaLabel(field, record, anchorRecord)
        : null;

    const openLinked = (e: MouseEvent) => {
        if (!resolvable) return;
        openQueueRecordLinkedDrawer({
            field,
            item,
            record,
            anchorRecord,
            handlers: drawerHandlers,
            onOpenOpportunity,
            event: e,
        });
    };

    if (!resolvable) {
        const modifier = queueRecordFieldModifierClass(field);
        const typography = queueRecordFieldTypographyClass(field);
        return (
            <span
                className={`queue-record-field queue-record-field--unlinked${modifier ? ` ${modifier}` : ""}${typography ? ` ${typography}` : ""}`}
                data-queue-row-link-unresolved="true"
            >
                {adornment?.icon ?
                    <AdornmentIcon icon={adornment.icon} className="queue-record-field__icon queue-record-field__icon--muted" aria-hidden />
                :   null}
                <span className="queue-record-field__text">{display}</span>
                {qaLabel ?
                    <span className="queue-row-link-qa" aria-hidden>
                        {qaLabel}
                    </span>
                :   null}
            </span>
        );
    }

    const isTitle = field.emphasis === "title";
    const modifier = queueRecordFieldModifierClass(field);
    const typography = queueRecordFieldTypographyClass(field);
    const statusTone: QueueRecordStatusPillTone | null = isTitle ? resolveQueueRecordStatusPillTone(anchorRecord) : null;
    const iconToneClass =
        statusTone && statusTone !== "neutral" ? ` queue-record-field__icon-wrap--tone-${statusTone}` : "";
    return (
        <button
            type="button"
            className={`queue-record-field queue-record-field--link${isTitle ? " queue-record-field--title" : ""}${modifier ? ` ${modifier}` : ""}${typography ? ` ${typography}` : ""}`}
            title={entity ? `Open ${entity} record` : undefined}
            data-queue-row-link="true"
            data-queue-row-linked-field="true"
            data-queue-row-interactive="true"
            data-layout-runtime-adornment-link="true"
            data-layout-runtime-adornment-entity={entity ? linkEntityAttr(entity) : undefined}
            data-queue-status-tone={statusTone ?? undefined}
            onClick={openLinked}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {adornment?.icon ?
                <span className={`queue-record-field__icon-wrap${iconToneClass}`}>
                    <AdornmentIcon icon={adornment.icon} className="queue-record-field__icon" aria-hidden />
                </span>
            :   null}
            <span className="queue-record-field__text">{display}</span>
            {qaLabel ?
                <span className="queue-row-link-qa" aria-hidden>
                    {qaLabel}
                </span>
            :   null}
        </button>
    );
}

function isQueueStatusField(field: QueueRecordFieldConfig): boolean {
    return (
        /(?:^|\.)(?:status|lifecycle_status|stage)(?:_key|_label|_name)?$/i.test(field.fieldKey)
        && !/tour_status/i.test(field.fieldKey)
    );
}

function fieldSurfaceClass(field: QueueRecordFieldConfig): string {
    if (field.emphasis === "title") return "queue-record-field--title-surface";
    if (field.display === "email" || field.display === "phone") return "queue-record-field--contact-secondary";
    if (field.display === "muted") return "queue-record-field--muted-surface";
    if (field.display === "date") return "queue-record-field--date";
    return "queue-record-field--text";
}

function usesInlineLabelPair(field: QueueRecordFieldConfig, showLabel: boolean): boolean {
    if (!showLabel || !field.label?.trim()) return false;
    if (field.display === "date") return true;
    const key = field.fieldKey.toLowerCase();
    return /date_of_birth|\.dob$|tour_date/.test(key);
}

/** Single config-driven field renderer for operational queue rows. */
export default function QueueRecordFieldRenderer({
    resolved,
    record,
    anchorRecord,
    drawerHandlers,
    onOpen,
}: QueueRecordFieldRendererProps) {
    const { field, item, display, isPlaceholder } = resolved;
    const text = display?.trim() ?? "";
    const showEmpty = !text || isPlaceholder;
    if (showEmpty && field.visibleWhen?.type === "exists") {
        return null;
    }
    const link = field.link;
    const entity = link?.target ? linkTargetEntity(link.target) : null;
    const showLabel = queueRecordFieldShowsLabel(field);

    if (link?.target && link.target !== "none" && entity) {
        return (
            <QueueRecordLinkedField
                field={field}
                item={item}
                record={record}
                anchorRecord={anchorRecord}
                display={text}
                drawerHandlers={drawerHandlers}
                onOpenOpportunity={onOpen}
            />
        );
    }

    if (field.display === "pill" || field.display === "badge" || isQueueStatusField(field)) {
        const statusKey = String(
            anchorRecord["opportunity.status_key"]
            ?? anchorRecord.status_key
            ?? "",
        ).trim();
        const statusTone = resolveQueueRecordStatusPillTone(anchorRecord);
        return (
            <QueueRowOpenZone
                onOpen={onOpen}
                className={`queue-record-field queue-record-field--pill queue-record-field--status-pill ${queueRecordStatusPillToneClass(statusTone)}`}
                data-queue-status-pill="true"
                data-queue-field-key={field.fieldKey}
                data-queue-status-key={statusKey || undefined}
                data-queue-status-tone={statusTone}
            >
                <span className="queue-record-field__pill-label">{showEmpty ? "—" : text}</span>
            </QueueRowOpenZone>
        );
    }

    if (/attention/.test(field.fieldKey)) {
        if (showEmpty) return <span className="queue-record-field queue-record-field--empty">—</span>;
        return <QueueRecordAttentionWidget record={anchorRecord} title="Attention" />;
    }

    if (/next_step/.test(field.fieldKey)) {
        if (showEmpty) return <span className="queue-record-field queue-record-field--empty">—</span>;
        return (
            <QueueRowOpenZone onOpen={onOpen} className="queue-record-field queue-record-field--next-step">
                <span className="queue-record-field__prefix">Next:</span>
                <span className="queue-record-field__text">{text}</span>
            </QueueRowOpenZone>
        );
    }

    if (showEmpty) {
        return <span className="queue-record-field queue-record-field--empty">—</span>;
    }

    const modifier = queueRecordFieldModifierClass(field);
    const typography = queueRecordFieldTypographyClass(field);
    const inlineLabel = usesInlineLabelPair(field, showLabel);
    return (
        <QueueRowOpenZone
            onOpen={onOpen}
            className={`queue-record-field ${fieldSurfaceClass(field)}${inlineLabel ? " queue-record-field--inline-labeled" : ""}${modifier ? ` ${modifier}` : ""}${typography ? ` ${typography}` : ""}`}
        >
            {field.icon ?
                <AdornmentIcon icon={field.icon} className="queue-record-field__icon queue-record-field__icon--muted" aria-hidden />
            :   null}
            {inlineLabel ?
                <>
                    <span className="queue-record-field__inline-label">{field.label}:</span>
                    <span className="queue-record-field__inline-value">{text}</span>
                </>
            : showLabel && field.label ?
                <>
                    <span className="queue-record-field__label">{field.label}: </span>
                    <span className="queue-record-field__text">{text}</span>
                </>
            :   <span className="queue-record-field__text">{text}</span>}
        </QueueRowOpenZone>
    );
}

export function QueueRecordWidgetRenderer({
    block,
    record,
    onOpen,
}: {
    block: Extract<QueueRecordBlockConfig, { type: "widget" }>;
    record: ProofRuntimeRecord;
    onOpen?: () => void;
}): ReactNode {
    const key = block.widgetKey.toLowerCase();
    const nextStep = String(record["opportunity.next_step"] ?? record.next_step ?? "").trim();
    const widgetTitle = block.label?.trim() || undefined;

    if (key.includes("task")) {
        return <QueueRecordTasksWidget record={record} title={widgetTitle ?? "Tasks"} maxVisible={2} />;
    }

    if (key.includes("attention")) {
        return <QueueRecordAttentionWidget record={record} title={widgetTitle ?? "Attention"} />;
    }

    if ((key.includes("next") || key.includes("step")) && nextStep) {
        return (
            <QueueRowOpenZone onOpen={onOpen} className="queue-record-field queue-record-field--next-step">
                <span className="queue-record-field__prefix">Next:</span>
                <span className="queue-record-field__text">{nextStep}</span>
            </QueueRowOpenZone>
        );
    }

    if (nextStep) {
        return (
            <QueueRowOpenZone onOpen={onOpen} className="queue-record-field queue-record-field--next-step">
                <span className="queue-record-field__prefix">Next:</span>
                <span className="queue-record-field__text">{nextStep}</span>
            </QueueRowOpenZone>
        );
    }

    return null;
}
