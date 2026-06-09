"use client";

import type { ReactNode } from "react";
import QueueRecordFieldRenderer, { QueueRecordWidgetRenderer } from "@/components/layout/QueueRecordFieldRenderer";
import type { QueueLayoutDrawerIconHandlers } from "@/lib/layout/runtime/buildQueueLayoutRuntimeAdornmentHandler";
import type {
    QueueRecordBlockConfig,
    QueueRecordColumnConfig,
    QueueRecordFieldConfig,
} from "@/lib/layout/queueRecordLayoutV3";
import {
    groupResolvedFieldsInline,
    resolvePrimaryRelatedRecord,
    resolveQueueRecordFieldsForRecord,
    resolveRepeatedRelatedRows,
} from "@/lib/layout/runtime/queueRecordScopedResolve";
import { resolveQueueRecordRepeatedRowKey } from "@/lib/layout/runtime/queueRecordRepeatedRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    column: QueueRecordColumnConfig;
    mainRecord: ProofRuntimeRecord;
    drawerHandlers?: QueueLayoutDrawerIconHandlers;
    collapseToggle?: ReactNode;
    onOpen?: () => void;
    hideColumnLabel?: boolean;
};

const DEFAULT_CHILDREN_VISIBLE_MAX = 5;

function collectColumnFieldKeys(column: QueueRecordColumnConfig): string[] {
    return column.blocks.flatMap((block) => {
        if (block.type === "widget") return [];
        return block.fields.map((field) => field.fieldKey);
    });
}

function resolveQueueColumnPresentation(column: QueueRecordColumnConfig): string {
    if (column.scope.type === "repeated_related") {
        return "operational-queue-row__column--children";
    }
    if (column.scope.type === "lifecycle_context") {
        return "operational-queue-row__column--context";
    }
    const keys = collectColumnFieldKeys(column);
    const dateHeavy =
        keys.length > 0
        && keys.every((key) => /date|tour|appointment|created_at|updated_at/i.test(key));
    if (dateHeavy) return "operational-queue-row__column--date";
    return "operational-queue-row__column--identity";
}

function FieldRows({
    fields,
    record,
    anchorRecord,
    drawerHandlers,
    onOpen,
    collapseToggle,
}: {
    fields: QueueRecordFieldConfig[];
    record: ProofRuntimeRecord;
    anchorRecord: ProofRuntimeRecord;
    drawerHandlers?: QueueLayoutDrawerIconHandlers;
    onOpen?: () => void;
    collapseToggle?: ReactNode;
}) {
    const resolved = resolveQueueRecordFieldsForRecord(fields, record);
    const groups = groupResolvedFieldsInline(resolved);
    if (!groups.length) return <span className="queue-record-field queue-record-field--empty">—</span>;

    let collapsePlaced = false;

    return (
        <div className="operational-queue-row__field-stack">
            {groups.map((group, gi) => (
                <div
                    key={gi}
                    className={
                        group.length > 1 ?
                            "operational-queue-row__field-line operational-queue-row__field-line--inline"
                        :   "operational-queue-row__field-line"
                    }
                >
                    {group.map((r) => {
                        const showCollapse =
                            collapseToggle
                            && !collapsePlaced
                            && r.field.emphasis === "title";
                        if (showCollapse) collapsePlaced = true;
                        return (
                            <div
                                key={r.field.id}
                                className={
                                    showCollapse
                                        ? "operational-queue-row__household-line"
                                        : "contents"
                                }
                            >
                                {showCollapse ? collapseToggle : null}
                                <QueueRecordFieldRenderer
                                    resolved={r}
                                    record={record}
                                    anchorRecord={anchorRecord}
                                    drawerHandlers={drawerHandlers}
                                    onOpen={onOpen}
                                />
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

function RenderBlock({
    block,
    column,
    mainRecord,
    drawerHandlers,
    onOpen,
    collapseToggle,
}: {
    block: QueueRecordBlockConfig;
    column: QueueRecordColumnConfig;
    mainRecord: ProofRuntimeRecord;
    drawerHandlers?: QueueLayoutDrawerIconHandlers;
    onOpen?: () => void;
    collapseToggle?: ReactNode;
}) {
    if (block.type === "widget") {
        const scopeRecord =
            column.scope.type === "lifecycle_context" ? mainRecord : resolvePrimaryRelatedRecord(mainRecord);
        return <QueueRecordWidgetRenderer block={block} record={scopeRecord} onOpen={onOpen} />;
    }

    if (block.type === "repeated_record_block") {
        const allRows = resolveRepeatedRelatedRows(block.relationshipKey, mainRecord);
        if (!allRows.length) {
            return <span className="queue-record-field queue-record-field--empty">{block.emptyState ?? "—"}</span>;
        }
        const maxVisible = block.maxItems ?? DEFAULT_CHILDREN_VISIBLE_MAX;
        const rows = allRows.slice(0, maxVisible);
        const overflowCount = Math.max(0, allRows.length - rows.length);
        return (
            <div
                className="operational-queue-row__children operational-queue-row__child-list"
                data-queue-repeat={block.relationshipKey}
                data-queue-repeat-max={maxVisible}
                data-queue-repeat-total={allRows.length}
                data-queue-children-visible={String(rows.length)}
            >
                {rows.map((row, ri) => (
                    <div
                        key={resolveQueueRecordRepeatedRowKey(block.relationshipKey, row, ri)}
                        className="operational-queue-row__child-row operational-queue-row__repeated-row"
                        data-queue-child-row="true"
                    >
                        <FieldRows
                            fields={block.fields}
                            record={row}
                            anchorRecord={mainRecord}
                            drawerHandlers={drawerHandlers}
                            onOpen={onOpen}
                        />
                    </div>
                ))}
                {overflowCount > 0 ?
                    <span
                        className="operational-queue-row__children-more"
                        data-queue-children-overflow="true"
                        title={`${allRows.length} children total; showing ${rows.length}`}
                    >
                        +{overflowCount} more
                    </span>
                :   null}
            </div>
        );
    }

    const scopeRecord =
        column.scope.type === "primary_related" ? resolvePrimaryRelatedRecord(mainRecord) : mainRecord;

    return (
        <FieldRows
            fields={block.fields}
            record={scopeRecord}
            anchorRecord={mainRecord}
            drawerHandlers={drawerHandlers}
            onOpen={onOpen}
            collapseToggle={collapseToggle}
        />
    );
}

export default function QueueRecordScopedColumn({
    column,
    mainRecord,
    drawerHandlers,
    collapseToggle,
    onOpen,
    hideColumnLabel,
}: Props) {
    const presentation = resolveQueueColumnPresentation(column);

    return (
        <div
            className={`operational-queue-row__column operational-queue-row__column--scoped ${presentation}`}
            data-queue-col={column.id}
            data-queue-col-scope={column.scope.type}
        >
            {column.label && !hideColumnLabel ?
                <div className="operational-queue-row__col-label">{column.label}</div>
            :   null}
            {column.blocks.map((block, blockIndex) => (
                <RenderBlock
                    key={block.id}
                    block={block}
                    column={column}
                    mainRecord={mainRecord}
                    drawerHandlers={drawerHandlers}
                    onOpen={onOpen}
                    collapseToggle={blockIndex === 0 ? collapseToggle : undefined}
                />
            ))}
        </div>
    );
}
