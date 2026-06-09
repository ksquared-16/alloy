"use client";

import type { ReactNode } from "react";
import { Home as HomeIcon } from "lucide-react";
import AdornmentIcon from "@/components/layout/AdornmentIcon";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { LayoutItem } from "@/lib/layout/layoutV2";
import type { QueueRecordLayoutColumn } from "@/lib/layout/queueRecordLayoutConfig";
import { evaluateLayoutCondition } from "@/lib/layout/runtime/evaluateLayoutCondition";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import { groupQueueRecordFieldsByRow, queueRecordFieldToLayoutItem } from "@/lib/layout/queueRecordLayoutFieldModel";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";

type AdornmentActionHandler = (
    item: LayoutItem,
    adornment: NonNullable<LayoutItem["adornment"]>,
    rowRecord?: ProofRuntimeRecord,
) => void;

type Props = {
    column: QueueRecordLayoutColumn;
    record: ProofRuntimeRecord;
    onAdorn?: AdornmentActionHandler;
    onOpen?: () => void;
    collapseToggle?: ReactNode;
};

function FieldValue({
    field,
    item,
    record,
    onAdorn,
}: {
    field: import("@/lib/layout/queueRecordLayoutConfig").QueueRecordLayoutField;
    item: LayoutItem;
    record: ProofRuntimeRecord;
    onAdorn?: AdornmentActionHandler;
}) {
    if (field.kind === "widget") {
        return (
            <span className="operational-queue-row__widget-badge" title={field.label}>
                {field.label}
            </span>
        );
    }

    if (field.type === "related-record-chips") {
        const rows = readLayoutRuntimeRepeaterRows(record, {
            id: "children",
            kind: "related_list",
            refKey: "children",
            source: "children",
        } as LayoutItem);
        if (!rows.length) return <span className="operational-queue-row__empty">—</span>;
        return (
            <div className="operational-queue-row__chip-wrap">
                {rows.map((row, i) => {
                    const display =
                        String(row["child.name"] ?? row["child.display_name"] ?? row.name ?? "—").trim() || "—";
                    const chipItem: LayoutItem = {
                        ...item,
                        id: `${item.id}-chip-${i}`,
                        adornment:
                            item.adornment ??
                            ({
                                position: "left",
                                icon: "child",
                                action: { type: "open_drawer", entity: "child", idPath: "child.id" },
                            } as LayoutItem["adornment"]),
                    };
                    return (
                        <LayoutRuntimeChildLinkSurface
                            key={`${display}-${i}`}
                            componentName="QueueRecordConfigColumn/Chip"
                            surface="queue"
                            item={chipItem}
                            rowRecord={row}
                            anchorRecord={record}
                            adornment={chipItem.adornment ?? null}
                            display={display}
                            onAction={onAdorn}
                            className="operational-queue-row__chip operational-queue-row__chip--clickable"
                        />
                    );
                })}
            </div>
        );
    }

    const resolved = resolveItemValue(record, item);
    if (!resolved.display?.trim()) return null;

    const display = resolved.display.trim();
    const shouldLinkPerson =
        field.linkBehavior === "open-drawer" ||
        item.renderHint === "link" ||
        /person\.(primary_contact|first_name|full_name|name)/.test(item.refKey);

    if (shouldLinkPerson && onAdorn) {
        const personId =
            String(record["opportunity.primary_person_id"] ?? record["person.id"] ?? record.person_id ?? "").trim() ||
            null;
        const adornment =
            item.adornment ??
            ({
                position: "left",
                icon: "person",
                action: { type: "open_drawer", entity: "person", idPath: "opportunity.primary_person_id" },
            } as NonNullable<LayoutItem["adornment"]>);
        return (
            <LayoutRuntimePersonLinkSurface
                componentName="QueueRecordConfigColumn/Contact"
                surface="queue"
                item={{ ...item, adornment }}
                personId={personId}
                adornment={adornment}
                display={display}
                onAction={onAdorn}
                anchorRecord={record}
                className="operational-queue-row__contact-link"
            />
        );
    }

    if (field.type === "status" || resolved.renderHint === "status" || field.display === "pill") {
        return <span className="operational-queue-row__status-pill">{display}</span>;
    }

    if (item.adornment?.icon) {
        return (
            <span className="operational-queue-row__field-with-icon inline-flex items-center gap-1">
                <AdornmentIcon icon={item.adornment.icon} className="h-3 w-3 shrink-0" aria-hidden />
                <span className={field.display === "muted" ? "operational-queue-row__contact-meta" : ""}>{display}</span>
            </span>
        );
    }

    return (
        <span
            className={
                field.display === "muted" ? "operational-queue-row__contact-meta"
                : field.type === "date" ? "operational-queue-row__date-value"
                : "operational-queue-row__field-value"
            }
        >
            {display}
        </span>
    );
}

export default function QueueRecordConfigColumn({ column, record, onAdorn, onOpen, collapseToggle }: Props) {
    const fields = column.fields ?? [];
    const rowGroups = groupQueueRecordFieldsByRow(fields);
    const role = column.role ?? column.key;
    const isIdentity = role === "identity";
    const titleField = fields.find((f) => /title|household|identity|customer/.test(f.refKey ?? f.fieldPath ?? ""));

    return (
        <div
            className={`operational-queue-row__column operational-queue-row__column--${role}`}
            data-queue-col={column.key}
            data-queue-col-config="true"
        >
            {isIdentity && titleField ?
                <div
                    className={`operational-queue-row__identity-title${onOpen ? " operational-queue-row__identity-title--openable" : ""}`}
                    data-queue-row-identity-open={onOpen ? "true" : undefined}
                    role={onOpen ? "button" : undefined}
                    tabIndex={onOpen ? 0 : undefined}
                    onClick={(e) => {
                        if (!onOpen) return;
                        if ((e.target as Element).closest(".operational-queue-row__collapse-toggle")) return;
                        e.stopPropagation();
                        onOpen();
                    }}
                >
                    {collapseToggle}
                    <span className="operational-queue-row__household-icon" aria-hidden>
                        <HomeIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="operational-queue-row__title min-w-0 truncate">
                        <FieldValue
                            field={titleField}
                            item={queueRecordFieldToLayoutItem(titleField)}
                            record={record}
                            onAdorn={onAdorn}
                        />
                    </span>
                </div>
            :   column.label ?
                <div className="operational-queue-row__col-label">{column.label}</div>
            :   null}

            {rowGroups.map((row) => {
                const visibleFields = row.fields.filter((f) => {
                    if (isIdentity && f.id === titleField?.id) return false;
                    const item = queueRecordFieldToLayoutItem(f);
                    return evaluateLayoutCondition(record, item.visibleWhen);
                });
                if (!visibleFields.length) return null;
                return (
                    <div
                        key={row.rowId}
                        className={
                            row.layout === "inline" ?
                                "operational-queue-row__field-row operational-queue-row__field-row--inline"
                            :   "operational-queue-row__field-row"
                        }
                        data-queue-row-interactive="true"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        {visibleFields.map((field) => {
                            const item = queueRecordFieldToLayoutItem(field);
                            return (
                                <FieldValue
                                    key={field.id}
                                    field={field}
                                    item={item}
                                    record={record}
                                    onAdorn={onAdorn}
                                />
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}
