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

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { Calendar, ChevronDown, ChevronRight } from "lucide-react";
import {
    LAYOUT_GRID_COLUMNS,
    type LayoutCollectionColumn,
    type LayoutColumn,
    type LayoutColumnWidth,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutRow,
    type LayoutSection,
    type LayoutWidthBehavior,
} from "@/lib/layout/layoutV2";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import AdornmentIcon from "@/components/layout/AdornmentIcon";

const TEXT = "#31394d";
const MUTED = "#59678b";
const BORDER = "#e6e8ec";

type Rec = Record<string, unknown>;

/**
 * Map a closed width bucket (presentation only; no raw CSS) to a table-cell
 * style. `flexible` grows to fill; the rest are proportional min-widths.
 */
function columnWidthStyle(width?: LayoutColumnWidth, behavior?: LayoutWidthBehavior): CSSProperties {
    const b = behavior ?? width;
    switch (b) {
        case "small":
            return { width: "1%", minWidth: 64, whiteSpace: "nowrap" };
        case "content":
            return { width: "1%", whiteSpace: "nowrap" };
        case "large":
            return { minWidth: 200 };
        case "flexible":
            return { width: "auto" };
        case "equal":
            return {};
        case "medium":
        default:
            return { minWidth: 120 };
    }
}

/** Render a status/badge value as a pill (shared by field + collection cells). */
function isPillHint(hint?: string): boolean {
    return hint === "status" || hint === "badge";
}

export type AdornmentActionHandler = (item: LayoutItem, adornment: LayoutFieldAdornment) => void;
const AdornmentActionContext = createContext<AdornmentActionHandler | undefined>(undefined);

/** The field action icon: clickable when it has an action and a handler is provided. */
function Adorn({ item }: { item: LayoutItem }) {
    const onAction = useContext(AdornmentActionContext);
    const ad = item.adornment;
    if (!ad) return null;
    if (ad.action && onAction) {
        const title = `Open ${ad.action.entity} drawer`;
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onAction(item, ad);
                }}
                title={title}
                aria-label={title}
                className="inline-flex items-center rounded p-0.5 text-[#00458C] hover:bg-[#eef3fb]"
            >
                <AdornmentIcon icon={ad.icon} />
            </button>
        );
    }
    return (
        <span className="inline-flex items-center text-[rgba(39,63,82,0.55)]" title={ad.action ? `Opens ${ad.action.entity} drawer` : undefined}>
            <AdornmentIcon icon={ad.icon} />
        </span>
    );
}

function ValueCell({ record, item }: { record: Rec; item: LayoutItem }) {
    const r = resolveItemValue(record, item);
    return (
        <div className="px-0.5 py-0.5">
            <div className="flex items-center gap-1 text-xs font-medium text-alloy-midnight/80">
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
            <div className="mt-0.5 flex items-center gap-1 text-sm" style={{ color: r.isPlaceholder ? "#9aa4bf" : TEXT }}>
                {item.adornment && item.adornment.position !== "right" ? <Adorn item={item} /> : null}
                <span>
                    {r.isPlaceholder ? (
                        <span title="Configured field not present on this record">— (placeholder)</span>
                    ) : isPillHint(r.renderHint) ? (
                        <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-xs">{r.display}</span>
                    ) : r.renderHint === "link" ? (
                        <span className="text-[#2f6df6]">{r.display}</span>
                    ) : (
                        r.display
                    )}
                </span>
                {item.adornment && item.adornment.position === "right" ? <Adorn item={item} /> : null}
            </div>
        </div>
    );
}

function GroupCell({ record, item }: { record: Rec; item: LayoutItem }) {
    const hasSubgrid = Array.isArray(item.rows) && item.rows.length > 0;
    return (
        <div className="rounded-md border border-[#e6e8ec] bg-[#fbfcfe] p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                {item.label || item.refKey}
            </div>
            {hasSubgrid ? (
                <div className="flex flex-col gap-2">
                    {item.rows!.map((row) => (
                        <RowView key={row.id} record={record} row={row} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {(item.items ?? []).map((child) => (
                        <ValueCell key={child.id} record={record} item={child} />
                    ))}
                </div>
            )}
        </div>
    );
}

/** Resolve + render one collection-table cell (value + optional action icon). */
function CellContent({ row, col }: { row: Rec; col: LayoutCollectionColumn }) {
    const synthetic: LayoutItem = { id: col.refKey, kind: "field", refKey: col.refKey, renderHint: col.renderHint, adornment: col.adornment, template: col.template };
    const r = resolveItemValue(row, synthetic);
    return (
        <span className="inline-flex items-center gap-1">
            {col.adornment && col.adornment.position !== "right" ? <Adorn item={synthetic} /> : null}
            <span style={{ color: r.isPlaceholder ? "#9aa4bf" : TEXT }}>
                {r.isPlaceholder ? "—" : isPillHint(col.renderHint) ? (
                    <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-[11px]">{r.display}</span>
                ) : (
                    r.display
                )}
            </span>
            {col.adornment && col.adornment.position === "right" ? <Adorn item={synthetic} /> : null}
        </span>
    );
}

function RelatedCell({ record, item }: { record: Rec; item: LayoutItem }) {
    const hasColumns = Array.isArray(item.columns) && item.columns.length > 0;
    const mode = item.displayMode ?? "table";
    const columns = (item.columns ?? []) as LayoutCollectionColumn[];
    const raw = record[item.source ?? item.refKey];
    const rows: Rec[] = Array.isArray(raw) ? (raw as Rec[]) : [];
    const entityNoun = item.related?.entityType ?? "row";

    // Compact "rows"/"list" mode — each child renders as its OWN stacked row
    // (no table header). Used by the queue card children list.
    if (hasColumns && (mode === "rows" || mode === "list")) {
        return (
            <div className="overflow-hidden rounded-md border border-[#e6e8ec] bg-white">
                <div className="flex items-center justify-between border-b border-[#eef0f4] px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{item.label || item.refKey}</span>
                    <span className="text-[10px]" style={{ color: MUTED }}>{rows.length} {entityNoun}{rows.length === 1 ? "" : "s"} · one row each</span>
                </div>
                {rows.length === 0 ? (
                    <div className="px-2.5 py-2 text-xs text-[#9aa4bf]">No {entityNoun}s on this record.</div>
                ) : (
                    <ul className="divide-y divide-[#f5f6f9]">
                        {rows.map((rw, i) => (
                            <li key={(rw.id as string) ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-xs">
                                {columns.map((c) => (
                                    <span key={c.refKey} className="inline-flex items-center gap-1">
                                        <CellContent row={rw} col={c} />
                                    </span>
                                ))}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }

    if (hasColumns) {
        return (
            <div className="overflow-hidden rounded-md border border-[#e6e8ec] bg-white">
                <div className="flex items-center justify-between border-b border-[#eef0f4] px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{item.label || item.refKey}</span>
                    <span className="text-[10px]" style={{ color: MUTED }}>{rows.length} {entityNoun}{rows.length === 1 ? "" : "s"} · one row each</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-xs">
                        <thead>
                            <tr className="border-b border-[#eef0f4]" style={{ color: MUTED }}>
                                {columns.map((c) => (
                                    <th key={c.refKey} className="px-2 py-1.5 font-semibold" style={columnWidthStyle(c.width, c.widthBehavior)}>{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="px-2 py-3 text-[#9aa4bf]">
                                        No {entityNoun}s on this record.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((rw, i) => (
                                    <tr key={(rw.id as string) ?? i} className="border-b border-[#f5f6f9]">
                                        {columns.map((c) => (
                                            <td key={c.refKey} className="px-2 py-1.5" style={{ color: TEXT, ...columnWidthStyle(c.width, c.widthBehavior) }}>
                                                <CellContent row={rw} col={c} />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }
    return (
        <div className="rounded-md border border-[#dbe7ff] bg-[#f5f8ff] px-2.5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#4063b0]">Related</span>{" "}
            <span className="text-sm font-medium" style={{ color: TEXT }}>{item.label || item.refKey}</span>
            {item.related ? <span className="ml-1 text-xs text-[#59678b]">({item.related.entityType})</span> : null}
        </div>
    );
}

function WidgetChrome({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-md border border-[#e6e8ec] bg-white">
            <div className="border-b border-[#eef0f4] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{title}</div>
            <div className="px-2.5 py-2">{children}</div>
        </div>
    );
}
function widgetRows(record: Rec, key: string): { label: string; meta?: string }[] {
    const raw = record[key];
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[]).map((r) => {
        if (r && typeof r === "object") {
            const o = r as Record<string, unknown>;
            return { label: String(o.label ?? o.title ?? o.name ?? o.body ?? ""), meta: o.due || o.when || o.at ? String(o.due ?? o.when ?? o.at) : undefined };
        }
        return { label: String(r) };
    });
}

function WidgetCell({ record, item }: { record: Rec; item: LayoutItem }) {
    const key = item.refKey;
    const title = item.label || key;
    const empty = <span className="text-xs text-[#9aa4bf]">No {title.toLowerCase()} yet</span>;

    if (key === "tasks" || key === "reminders") {
        const rows = widgetRows(record, key);
        return (
            <WidgetChrome title={title}>
                {rows.length === 0 ? empty : (
                    <ul className="flex flex-col gap-1">
                        {rows.map((r, i) => (
                            <li key={i} className="flex items-center justify-between rounded bg-[#f7f9fc] px-2 py-1 text-xs" style={{ color: TEXT }}>
                                <span className="truncate">{r.label}</span>
                                {r.meta ? <span className="ml-2 shrink-0 text-[10px]" style={{ color: MUTED }}>{r.meta}</span> : null}
                            </li>
                        ))}
                    </ul>
                )}
            </WidgetChrome>
        );
    }
    if (key === "actions") {
        const meta = (item.metadata ?? {}) as { actions?: unknown; layout?: unknown };
        const configured = Array.isArray(meta.actions) ? (meta.actions as unknown[]).map((a) => String(a)) : null;
        const actions = configured && configured.length ? configured : ["Call", "Email", "Schedule tour", "Update status"];
        const stack = meta.layout === "stack";
        return (
            <WidgetChrome title={title}>
                <div className={stack ? "flex flex-col items-stretch gap-1.5" : "flex flex-wrap gap-1.5"}>
                    {actions.map((a) => (
                        <button key={a} type="button" disabled title="Simulated — no live mutation" className={`rounded-md border border-[#dbe7ff] bg-[#f5f8ff] px-2 py-1 text-[11px] font-medium text-[#00458C] disabled:opacity-90 ${stack ? "text-left" : ""}`}>
                            {a}
                        </button>
                    ))}
                    <span className={`text-[10px] ${stack ? "" : "self-center"}`} style={{ color: MUTED }}>(simulated)</span>
                </div>
            </WidgetChrome>
        );
    }
    if (key === "tour_summary") {
        const date = record["opportunity.tour_date"] ?? record["tour_date"] ?? null;
        const status = record["opportunity.tour_status"] ?? record["tour_status"] ?? null;
        return (
            <WidgetChrome title={title}>
                {date || status ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: TEXT }}>
                        {date ? <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5 text-[rgba(39,63,82,0.55)]" aria-hidden /> {String(date)}</span> : null}
                        {status ? <span className="rounded-full bg-[#eef1f6] px-2 py-0.5 text-[11px]">{String(status)}</span> : null}
                        <button type="button" disabled className="rounded-md border border-[#dbe7ff] bg-[#f5f8ff] px-2 py-1 text-[11px] font-medium text-[#00458C] disabled:opacity-90">Reschedule</button>
                    </div>
                ) : (
                    empty
                )}
            </WidgetChrome>
        );
    }
    // recent_communication / notes / children_list / other → styled (data not available)
    return <WidgetChrome title={title}>{empty}</WidgetChrome>;
}

function ItemCell({ record, item }: { record: Rec; item: LayoutItem }) {
    switch (item.kind) {
        case "field":
            return <ValueCell record={record} item={item} />;
        case "field_group":
            return <GroupCell record={record} item={item} />;
        case "related_list":
            return <RelatedCell record={record} item={item} />;
        case "widget_placeholder":
            return <WidgetCell record={record} item={item} />;
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
    // Mirrors the staging drawer "premium" section exactly (EntityDrawerSection):
    // bend-pine left accent, alloy-stone ring, emerald-tinted header, no uppercase.
    //
    // Honors defaultExpanded: a collapsible section that is not expanded by
    // default renders the header/title only; the body mounts only when expanded.
    const collapsible = section.collapsible !== false && section.defaultExpanded === false;
    const [open, setOpen] = useState<boolean>(section.defaultExpanded !== false);
    const showBody = !collapsible || open;
    return (
        <div className="overflow-hidden rounded-lg border border-alloy-stone/[0.1] border-l-[3px] border-l-[rgb(0,162,131)] bg-white/[0.97] shadow-sm ring-1 ring-alloy-stone/[0.06]">
            {collapsible ? (
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 border-b border-alloy-stone/10 bg-emerald-50/20 px-2.5 py-1.5 text-left hover:bg-emerald-50/40"
                >
                    {open ? <ChevronDown className="h-3.5 w-3.5 text-alloy-forge/70" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-alloy-forge/70" aria-hidden />}
                    <span className="min-w-0 truncate text-[10px] font-semibold tracking-[0.1em] text-alloy-forge/80">{section.title}</span>
                </button>
            ) : (
                <div className="flex items-center gap-2 border-b border-alloy-stone/10 bg-emerald-50/20 px-2.5 py-1.5">
                    <span className="min-w-0 truncate text-[10px] font-semibold tracking-[0.1em] text-alloy-forge/80">{section.title}</span>
                </div>
            )}
            {showBody ? (
                <div className="flex flex-col gap-2.5 px-3 py-2.5">
                    {section.rows.map((row) => (
                        <RowView key={row.id} record={record} row={row} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

export default function LayoutRecordView({
    doc,
    record,
    onAdornmentAction,
}: {
    doc: LayoutDoc;
    record: Rec;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    if (!doc || !Array.isArray(doc.sections)) {
        return <div className="text-sm" style={{ color: MUTED }}>No drawer layout.</div>;
    }
    return (
        <AdornmentActionContext.Provider value={onAdornmentAction}>
            <div className="flex flex-col gap-3" style={{ border: `0 solid ${BORDER}` }}>
                {doc.sections.map((section) => (
                    <SectionView key={section.id} record={record} section={section} />
                ))}
            </div>
        </AdornmentActionContext.Provider>
    );
}
