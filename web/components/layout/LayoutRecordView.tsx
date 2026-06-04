"use client";

/**
 * Layout V2 proof — config-driven record view (drawer surface).
 *
 * PROOF renderer only. Renders a record's drawer from a resolved Layout V2 doc
 * (Section → Row → Column → Item), pulling ACTUAL field values from the record
 * via resolveItemValue() and showing a clearly-marked placeholder when a
 * configured field is not present on the sample record.
 *
 * This is intentionally separate from the production AdminEntityDrawer (which is
 * NOT touched). It performs no data fetching of its own — the caller supplies
 * both the layout doc and the record.
 */

import {
    LAYOUT_GRID_COLUMNS,
    type LayoutColumn,
    type LayoutDoc,
    type LayoutItem,
    type LayoutRow,
    type LayoutSection,
} from "@/lib/layout/layoutV2";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";

const TEXT = "#31394d";
const MUTED = "#59678b";
const BORDER = "#e6e8ec";

type Rec = Record<string, unknown>;

function ValueCell({ record, item }: { record: Rec; item: LayoutItem }) {
    const r = resolveItemValue(record, item);
    return (
        <div className="rounded border border-[#eef0f4] bg-white px-2.5 py-1.5">
            <div className="flex items-center gap-1 text-[11px] font-medium" style={{ color: MUTED }}>
                {item.label || item.refKey}
                {item.locked ? (
                    <span
                        className="text-[10px] text-[#9aa4bf]"
                        title="System field — part of the data model. Placement is editable."
                    >
                        · system field
                    </span>
                ) : null}
                {item.visibleWhen ? (
                    <span
                        className="ml-1 rounded bg-[#fff7ed] px-1 text-[9px] text-[#b54708]"
                        title={`Shown when ${item.visibleWhen.path}${item.visibleWhen.type === "equals" ? ` = ${item.visibleWhen.value}` : " exists"}`}
                    >
                        conditional
                    </span>
                ) : null}
            </div>
            <div className="mt-0.5 text-sm" style={{ color: r.isPlaceholder ? "#9aa4bf" : TEXT }}>
                {r.isPlaceholder ? (
                    <span title="Configured field not present on this record">— (placeholder)</span>
                ) : r.renderHint === "status" ? (
                    <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-xs">{r.display}</span>
                ) : r.renderHint === "link" ? (
                    <span className="text-[#2f6df6]">{r.display}</span>
                ) : (
                    r.display
                )}
            </div>
        </div>
    );
}

function GroupCell({ record, item }: { record: Rec; item: LayoutItem }) {
    return (
        <div className="rounded-md border border-[#e6e8ec] bg-[#fbfcfe] p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                {item.label || item.refKey}
            </div>
            <div className="grid grid-cols-2 gap-2">
                {(item.items ?? []).map((child) => (
                    <ValueCell key={child.id} record={record} item={child} />
                ))}
            </div>
        </div>
    );
}

function RelatedCell({ item }: { item: LayoutItem }) {
    return (
        <div className="rounded-md border border-[#dbe7ff] bg-[#f5f8ff] px-2.5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#4063b0]">Related</span>{" "}
            <span className="text-sm font-medium" style={{ color: TEXT }}>
                {item.label || item.refKey}
            </span>
            {item.related ? <span className="ml-1 text-xs text-[#59678b]">({item.related.entityType})</span> : null}
        </div>
    );
}

function WidgetCell({ item }: { item: LayoutItem }) {
    return (
        <div className="rounded-md border-2 border-dashed border-[#cdd5e4] bg-[#fbfcfe] px-2.5 py-2 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                Widget
            </span>{" "}
            <span className="text-sm" style={{ color: TEXT }}>
                {item.label || item.refKey}
            </span>
        </div>
    );
}

function ItemCell({ record, item }: { record: Rec; item: LayoutItem }) {
    switch (item.kind) {
        case "field":
            return <ValueCell record={record} item={item} />;
        case "field_group":
            return <GroupCell record={record} item={item} />;
        case "related_list":
            return <RelatedCell item={item} />;
        case "widget_placeholder":
            return <WidgetCell item={item} />;
        default:
            return null;
    }
}

function ColumnView({ record, column }: { record: Rec; column: LayoutColumn }) {
    const span = Math.max(1, Math.min(LAYOUT_GRID_COLUMNS, column.width));
    return (
        <div style={{ gridColumn: `span ${span} / span ${span}` }} className="flex flex-col gap-2">
            {column.items.map((item) => (
                <ItemCell key={item.id} record={record} item={item} />
            ))}
        </div>
    );
}

function RowView({ record, row }: { record: Rec; row: LayoutRow }) {
    return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${LAYOUT_GRID_COLUMNS}, minmax(0, 1fr))` }}>
            {row.columns.map((col) => (
                <ColumnView key={col.id} record={record} column={col} />
            ))}
        </div>
    );
}

function SectionView({ record, section }: { record: Rec; section: LayoutSection }) {
    return (
        <div className="rounded-lg border border-[#e6e8ec] bg-white">
            <div className="border-b border-[#e6e8ec] px-3 py-2 text-sm font-semibold" style={{ color: TEXT }}>
                {section.title}
            </div>
            <div className="flex flex-col gap-3 p-3">
                {section.rows.map((row) => (
                    <RowView key={row.id} record={record} row={row} />
                ))}
            </div>
        </div>
    );
}

export default function LayoutRecordView({ doc, record }: { doc: LayoutDoc; record: Rec }) {
    if (!doc || !Array.isArray(doc.sections)) {
        return <div className="text-sm" style={{ color: MUTED }}>No drawer layout.</div>;
    }
    return (
        <div className="flex flex-col gap-3" style={{ border: `0 solid ${BORDER}` }}>
            {doc.sections.map((section) => (
                <SectionView key={section.id} record={record} section={section} />
            ))}
        </div>
    );
}
