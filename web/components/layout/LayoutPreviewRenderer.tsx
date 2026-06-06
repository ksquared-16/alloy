"use client";

/**
 * Layout V2 — Preview Renderer (Deliverable C).
 *
 * Renders a {@link LayoutDoc} as a visual preview of its Section → Row → Column
 * → Item structure. This is a PREVIEW renderer, not a production renderer:
 *  - It shows placeholder values, not live record data.
 *  - It performs NO data fetching and is not wired into any live drawer/queue.
 *  - It exists so admins can see the shape of a layout while configuring it.
 *
 * It reuses the existing admin visual language (borders, type colors, spacing)
 * so previews look like the product without introducing any custom CSS, color,
 * or theme customization (constraint compliance).
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
    LAYOUT_GRID_COLUMNS,
    type LayoutColumn,
    type LayoutDoc,
    type LayoutItem,
    type LayoutRow,
    type LayoutSection,
} from "@/lib/layout/layoutV2";
import AdornmentIcon from "@/components/layout/AdornmentIcon";

const BORDER = "#e6e8ec";
const TEXT = "#31394d";
const MUTED = "#59678b";

function HintChip({ hint }: { hint?: string }) {
    if (!hint) return null;
    return (
        <span className="ml-2 rounded bg-[#F4F6F9] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#59678b]">
            {hint}
        </span>
    );
}

/**
 * A `locked` item is a SYSTEM FIELD (part of the data model) — it cannot be
 * deleted from the field registry, but its layout placement is fully editable.
 * The badge communicates that, not that the layout is locked.
 */
function SystemFieldChip({ locked }: { locked?: boolean }) {
    if (!locked) return null;
    return (
        <span
            className="ml-2 rounded border border-[#e6e8ec] bg-[#f4f6f9] px-1.5 py-0.5 text-[10px] font-medium text-[#59678b]"
            title="System field — part of the data model. Placement is editable; it just can't be deleted from the field registry."
        >
            system field
        </span>
    );
}

function FieldPreview({ item }: { item: LayoutItem }) {
    return (
        <div className="rounded border border-dashed border-[#e6e8ec] bg-white px-2.5 py-1.5">
            <div className="flex items-center text-[11px] font-medium text-[#59678b]">
                {item.label || item.refKey}
                <HintChip hint={item.renderHint} />
                {item.editable ? (
                    <span className="ml-2 text-[10px] text-[#9aa4bf]">editable</span>
                ) : null}
                <SystemFieldChip locked={item.locked} />
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-sm text-[#31394d]">
                {item.adornment && item.adornment.position !== "right" ? (
                    <span className="inline-flex items-center text-[#00458C]" title={item.adornment.action ? `Opens ${item.adornment.action.entity} drawer` : undefined}>
                        <AdornmentIcon icon={item.adornment.icon} />
                    </span>
                ) : null}
                <span>
                    {item.template ? (
                        <span className="text-[#31394d]">{item.template}</span>
                    ) : item.renderHint === "status" || item.renderHint === "badge" ? (
                        <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-xs text-[#31394d]">Status</span>
                    ) : item.renderHint === "money" ? (
                        "$0.00"
                    ) : item.renderHint === "link" ? (
                        <span className="text-[#2f6df6] underline">Linked record →</span>
                    ) : (
                        "—"
                    )}
                </span>
                {item.adornment && item.adornment.position === "right" ? (
                    <span className="inline-flex items-center text-[#00458C]" title={item.adornment.action ? `Opens ${item.adornment.action.entity} drawer` : undefined}>
                        <AdornmentIcon icon={item.adornment.icon} />
                    </span>
                ) : null}
            </div>
        </div>
    );
}

function GroupPreview({ item }: { item: LayoutItem }) {
    const hasSubgrid = Array.isArray(item.rows) && item.rows.length > 0;
    return (
        <div className="rounded-md border border-[#e6e8ec] bg-[#fbfcfe] p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#59678b]">
                {item.label || item.refKey}
            </div>
            {hasSubgrid ? (
                <div className="flex flex-col gap-2">
                    {item.rows!.map((row) => (
                        <RowPreview key={row.id} row={row} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {(item.items ?? []).map((c) => (
                        <FieldPreview key={c.id} item={c} />
                    ))}
                </div>
            )}
        </div>
    );
}

function RelatedPreview({ item }: { item: LayoutItem }) {
    const cols = item.columns ?? [];
    const noun = item.related?.entityType ?? "row";
    return (
        <div className="rounded-md border border-[#dbe7ff] bg-[#f5f8ff] p-2.5">
            <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#4063b0]">
                    Related list{item.displayMode ? ` · ${item.displayMode}` : ""}
                </div>
                <div className="text-[10px] text-[#59678b]">each {noun} = one row</div>
            </div>
            <div className="mt-0.5 text-sm font-medium text-[#31394d]">
                {item.label || item.refKey}
                {item.related ? <span className="ml-1 text-xs text-[#59678b]">({item.related.entityType})</span> : null}
            </div>
            {cols.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                    {cols.map((c, i) => (
                        <span key={`${c.refKey}-${i}`} className="inline-flex items-center gap-1 rounded border border-[#cdd9f5] bg-white px-1.5 py-0.5 text-[10px] text-[#4063b0]">
                            {c.adornment ? <AdornmentIcon icon={c.adornment.icon} className="h-3 w-3" /> : null}
                            {c.label}
                            {c.width ? <span className="text-[#9aa4bf]">· {c.widthBehavior ?? c.width}</span> : null}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function WidgetPreview({ item }: { item: LayoutItem }) {
    return (
        <div className="rounded-md border-2 border-dashed border-[#cdd5e4] bg-[#fbfcfe] p-3 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#59678b]">Widget placeholder</div>
            <div className="mt-0.5 text-sm font-medium text-[#31394d]">{item.label || item.refKey}</div>
            {item.widget?.widgetKey ? (
                <div className="mt-0.5 font-mono text-[11px] text-[#9aa4bf]">{item.widget.widgetKey}</div>
            ) : null}
        </div>
    );
}

function ItemPreview({ item }: { item: LayoutItem }) {
    switch (item.kind) {
        case "field":
            return <FieldPreview item={item} />;
        case "field_group":
            return <GroupPreview item={item} />;
        case "related_list":
            return <RelatedPreview item={item} />;
        case "widget_placeholder":
            return <WidgetPreview item={item} />;
        default:
            return null;
    }
}

function ColumnPreview({ column }: { column: LayoutColumn }) {
    const span = Math.max(1, Math.min(LAYOUT_GRID_COLUMNS, column.width));
    return (
        <div style={{ gridColumn: `span ${span} / span ${span}` }} className="flex flex-col gap-2">
            {column.items.map((item) => (
                <ItemPreview key={item.id} item={item} />
            ))}
        </div>
    );
}

function RowPreview({ row }: { row: LayoutRow }) {
    return (
        <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${LAYOUT_GRID_COLUMNS}, minmax(0, 1fr))` }}
        >
            {row.columns.map((col) => (
                <ColumnPreview key={col.id} column={col} />
            ))}
        </div>
    );
}

function SectionPreview({ section }: { section: LayoutSection }) {
    // Honor defaultExpanded: collapsed sections show header only; toggle expands.
    const collapsible = section.collapsible !== false;
    const [open, setOpen] = useState<boolean>(section.defaultExpanded !== false);
    const showBody = !collapsible || open;
    return (
        <div className="rounded-lg border border-[#e6e8ec] bg-white">
            <button
                type="button"
                onClick={() => collapsible && setOpen((v) => !v)}
                aria-expanded={collapsible ? open : undefined}
                className={`flex w-full items-center justify-between border-b border-[#e6e8ec] px-3 py-2 text-left ${collapsible ? "hover:bg-[#f7f9fc]" : "cursor-default"}`}
            >
                <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: TEXT }}>
                    {collapsible ? (open ? <ChevronDown className="h-3.5 w-3.5 text-[#59678b]" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-[#59678b]" aria-hidden />) : null}
                    {section.title}
                </div>
                <div className="text-[11px]" style={{ color: MUTED }}>
                    {collapsible ? (open ? "expanded" : "collapsed (default)") : ""}
                </div>
            </button>
            {showBody ? (
                <div className="flex flex-col gap-3 p-3">
                    {section.rows.length === 0 ? (
                        <div className="text-sm" style={{ color: MUTED }}>
                            (no rows)
                        </div>
                    ) : (
                        section.rows.map((row) => <RowPreview key={row.id} row={row} />)
                    )}
                </div>
            ) : null}
        </div>
    );
}

/**
 * Queue surface preview. A card-style queue (`metadata.renderAs === "card"`)
 * renders its sections like a record card; otherwise it falls back to the
 * table-of-columns preview.
 */
function QueuePreview({ doc }: { doc: LayoutDoc }) {
    if ((doc.metadata as { renderAs?: string } | undefined)?.renderAs === "card") {
        return (
            <div className="flex flex-col gap-3">
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>Queue card preview</div>
                {doc.sections.map((section) => (
                    <SectionPreview key={section.id} section={section} />
                ))}
            </div>
        );
    }
    const items = doc.sections[0]?.rows[0]?.columns[0]?.items ?? [];
    return (
        <div className="overflow-x-auto rounded-lg border border-[#e6e8ec] bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                    <tr className="border-b border-[#e6e8ec]" style={{ color: MUTED }}>
                        {items.map((it) => (
                            <th key={it.id} className="px-3 py-2 font-semibold">
                                <span className="inline-flex items-center">
                                    {it.label || it.refKey}
                                    <HintChip hint={it.renderHint} />
                                    {it.metadata && (it.metadata as { sortable?: boolean }).sortable ? (
                                        <span className="ml-1 text-[10px] text-[#9aa4bf]">↕</span>
                                    ) : null}
                                    <SystemFieldChip locked={it.locked} />
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {[0, 1].map((r) => (
                        <tr key={r} className="border-b border-[#f0f2f6]">
                            {items.map((it) => (
                                <td key={it.id} className="px-3 py-2" style={{ color: TEXT }}>
                                    {it.renderHint === "status" ? (
                                        <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-xs">Status</span>
                                    ) : it.renderHint === "money" ? (
                                        "$0.00"
                                    ) : (
                                        "—"
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function LayoutPreviewRenderer({ doc }: { doc: LayoutDoc }) {
    if (!doc || !Array.isArray(doc.sections)) {
        return <div className="text-sm text-[#59678b]">No layout to preview.</div>;
    }

    return (
        <div className="flex flex-col gap-3" style={{ border: `0px solid ${BORDER}` }} data-layout-surface={doc.surface}>
            <div className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
                <span className="rounded bg-[#F4F6F9] px-2 py-0.5 font-medium uppercase tracking-wide">{doc.surface}</span>
                <span>{doc.entityType}</span>
                <span className="text-[#c3cad9]">·</span>
                <span>
                    {doc.sections.length} section{doc.sections.length === 1 ? "" : "s"}
                </span>
            </div>

            {doc.surface === "queue" ? (
                <QueuePreview doc={doc} />
            ) : (
                doc.sections.map((section) => <SectionPreview key={section.id} section={section} />)
            )}
        </div>
    );
}
