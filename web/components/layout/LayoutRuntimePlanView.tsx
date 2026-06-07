"use client";

/**
 * Layout runtime plan proof renderer (Phase 2).
 *
 * Renders Resolved LayoutDoc + LayoutRuntimePlan for opportunity drawer proof.
 * Binding-aware: relationship/reference handles, computed read-only fields,
 * repeaters, widgets. NOT wired to AdminEntityDrawer or VM.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
    LAYOUT_GRID_COLUMNS,
    type LayoutCollectionColumn,
    type LayoutColumn,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutRow,
    type LayoutSection,
} from "@/lib/layout/layoutV2";
import { buildLayoutRuntimePlan, type LayoutRuntimePlan } from "@/lib/layout/runtime/layoutRuntimePlan";
import { classifyLayoutItemBinding } from "@/lib/layout/runtime/classifyLayoutItemBinding";
import {
    resolveProofBindingValue,
    shouldRenderProofItem,
    type ProofBindingResolution,
} from "@/lib/layout/runtime/resolveProofBindingValue";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import AdornmentIcon from "@/components/layout/AdornmentIcon";

const TEXT = "#31394d";
const MUTED = "#59678b";
const BORDER = "#e6e8ec";

export type AdornmentActionHandler = (item: LayoutItem, adornment: LayoutFieldAdornment) => void;
const AdornmentActionContext = createContext<AdornmentActionHandler | undefined>(undefined);

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
        <span className="inline-flex items-center text-[rgba(39,63,82,0.55)]">
            <AdornmentIcon icon={ad.icon} />
        </span>
    );
}

function BindingBadge({ resolution }: { resolution: ProofBindingResolution }) {
    if (resolution.isComputed) {
        return (
            <span className="ml-1 rounded bg-[#f4f3ff] px-1 text-[9px] text-[#5925dc]" title="Lifecycle-owned computed projection">
                computed
            </span>
        );
    }
    if (resolution.bindingClass === "relationship_field" || resolution.bindingClass === "reference_field") {
        return (
            <span className="ml-1 rounded bg-[#eff8ff] px-1 text-[9px] text-[#175cd3]" title="Related record">
                relation
            </span>
        );
    }
    return null;
}

function ValueCell({
    record,
    item,
    anchorEntity,
}: {
    record: ProofRuntimeRecord;
    item: LayoutItem;
    anchorEntity: string;
}) {
    const binding = classifyLayoutItemBinding(item, anchorEntity);
    const r = resolveProofBindingValue(record, item, anchorEntity, binding);

    return (
        <div className="rounded border border-[#eef0f4] bg-white px-2.5 py-1.5">
            <div className="flex flex-wrap items-center gap-1 text-[11px] font-medium" style={{ color: MUTED }}>
                {item.label || item.refKey}
                <BindingBadge resolution={r} />
                {r.relationHandle ? (
                    <span className="truncate text-[10px] font-normal text-[#4063b0]" title="Related entity handle">
                        · {r.relationHandle}
                    </span>
                ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-sm" style={{ color: r.isPlaceholder ? "#9aa4bf" : TEXT }}>
                {item.adornment && item.adornment.position !== "right" ? <Adorn item={item} /> : null}
                <span>
                    {r.isPlaceholder ? (
                        <span title={r.reason ?? "Value unavailable in proof context"}>—</span>
                    ) : r.renderHint === "status" ? (
                        <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-xs">{r.display}</span>
                    ) : r.renderHint === "primary_yes_no" ? (
                        <span>{r.display}</span>
                    ) : (
                        r.display
                    )}
                </span>
                {item.adornment && item.adornment.position === "right" ? <Adorn item={item} /> : null}
            </div>
        </div>
    );
}

function GroupCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    const hasSubgrid = Array.isArray(item.rows) && item.rows.length > 0;
    return (
        <div className="rounded-md border border-[#e6e8ec] bg-[#fbfcfe] p-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                {item.label || item.refKey}
            </div>
            {hasSubgrid ? (
                <div className="flex flex-col gap-2">
                    {item.rows!.map((row) => (
                        <RowView key={row.id} record={record} row={row} anchorEntity={anchorEntity} />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2">
                    {(item.items ?? []).map((child) => (
                        <ValueCell key={child.id} record={record} item={child} anchorEntity={anchorEntity} />
                    ))}
                </div>
            )}
        </div>
    );
}

function RepeaterCellContent({ row, col }: { row: ProofRuntimeRecord; col: LayoutCollectionColumn }) {
    const synthetic: LayoutItem = {
        id: col.refKey,
        kind: "field",
        refKey: col.refKey,
        renderHint: col.renderHint,
        adornment: col.adornment,
    };
    // Row objects carry namespaced child.* / inquiry_child.* values in enrollment context.
    const r = resolveItemValue(row, synthetic);
    return (
        <span className="inline-flex items-center gap-1">
            {col.adornment && col.adornment.position !== "right" ? <Adorn item={synthetic} /> : null}
            <span style={{ color: r.isPlaceholder ? "#9aa4bf" : TEXT }}>
                {r.isPlaceholder ? "—" : col.renderHint === "status" ? (
                    <span className="inline-block rounded-full bg-[#eef1f6] px-2 py-0.5 text-[11px]">{r.display}</span>
                ) : (
                    r.display
                )}
            </span>
            {col.adornment && col.adornment.position === "right" ? <Adorn item={synthetic} /> : null}
        </span>
    );
}

function RelatedCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    const binding = classifyLayoutItemBinding(item, anchorEntity);
    const isTable = item.displayMode === "table" && Array.isArray(item.columns) && item.columns.length > 0;

    if (!isTable) {
        return (
            <div className="rounded-md border border-[#dbe7ff] bg-[#f5f8ff] px-2.5 py-2 text-xs text-[#9aa4bf]">
                Repeater preview unavailable
            </div>
        );
    }

    const columns = item.columns as LayoutCollectionColumn[];
    const raw = record[item.source ?? item.refKey];
    const rows: ProofRuntimeRecord[] = Array.isArray(raw) ? (raw as ProofRuntimeRecord[]) : [];
    const isEnrollmentChild = binding.relationKey === "enrollment_children";

    return (
        <div className="overflow-hidden rounded-md border border-[#e6e8ec] bg-white">
            <div className="flex items-center justify-between border-b border-[#eef0f4] px-2.5 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                    {item.label || item.refKey}
                </span>
                <span className="text-[10px]" style={{ color: MUTED }}>
                    {rows.length} row{rows.length === 1 ? "" : "s"}
                    {isEnrollmentChild ? " · enrollment context" : ""}
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                        <tr className="border-b border-[#eef0f4]" style={{ color: MUTED }}>
                            {columns.map((c) => (
                                <th key={c.refKey} className="px-2 py-1.5 font-semibold">{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-2 py-3 text-[#9aa4bf]">
                                    No rows in proof context.
                                </td>
                            </tr>
                        ) : (
                            rows.map((rw, i) => (
                                <tr key={(rw.id as string) ?? i} className="border-b border-[#f5f6f9]">
                                    {columns.map((c) => (
                                        <td key={c.refKey} className="px-2 py-1.5" style={{ color: TEXT }}>
                                            <RepeaterCellContent row={rw} col={c} />
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

function WidgetChrome({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-md border border-[#e6e8ec] bg-white">
            <div className="border-b border-[#eef0f4] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{title}</div>
            <div className="px-2.5 py-2">{children}</div>
        </div>
    );
}

function widgetRows(record: ProofRuntimeRecord, key: string): { label: string; meta?: string }[] {
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

function WidgetCell({ record, item }: { record: ProofRuntimeRecord; item: LayoutItem }) {
    const key = item.refKey;
    const title = item.label || key;
    const empty = <span className="text-xs text-[#9aa4bf]">No {title.toLowerCase()} in proof context</span>;

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
        return (
            <WidgetChrome title={title}>
                <div className="flex flex-wrap gap-1.5">
                    {["Call", "Email", "Schedule tour"].map((a) => (
                        <button key={a} type="button" disabled className="rounded-md border border-[#dbe7ff] bg-[#f5f8ff] px-2 py-1 text-[11px] font-medium text-[#00458C] disabled:opacity-90">
                            {a}
                        </button>
                    ))}
                    <span className="self-center text-[10px]" style={{ color: MUTED }}>(simulated)</span>
                </div>
            </WidgetChrome>
        );
    }
    return <WidgetChrome title={title}>{empty}</WidgetChrome>;
}

function ItemCell({ record, item, anchorEntity }: { record: ProofRuntimeRecord; item: LayoutItem; anchorEntity: string }) {
    if (!shouldRenderProofItem(item)) return null;

    switch (item.kind) {
        case "field":
            return <ValueCell record={record} item={item} anchorEntity={anchorEntity} />;
        case "field_group":
            return <GroupCell record={record} item={item} anchorEntity={anchorEntity} />;
        case "related_list":
            return <RelatedCell record={record} item={item} anchorEntity={anchorEntity} />;
        case "widget_placeholder":
            return <WidgetCell record={record} item={item} />;
        default:
            return null;
    }
}

function ColumnView({ record, column, anchorEntity }: { record: ProofRuntimeRecord; column: LayoutColumn; anchorEntity: string }) {
    const span = Math.max(1, Math.min(LAYOUT_GRID_COLUMNS, column.width));
    return (
        <div style={{ gridColumn: `span ${span} / span ${span}` }} className="flex flex-col gap-2">
            {column.items.map((item) => (
                <ItemCell key={item.id} record={record} item={item} anchorEntity={anchorEntity} />
            ))}
        </div>
    );
}

function RowView({ record, row, anchorEntity }: { record: ProofRuntimeRecord; row: LayoutRow; anchorEntity: string }) {
    return (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${LAYOUT_GRID_COLUMNS}, minmax(0, 1fr))` }}>
            {row.columns.map((col) => (
                <ColumnView key={col.id} record={record} column={col} anchorEntity={anchorEntity} />
            ))}
        </div>
    );
}

function SectionView({ record, section, anchorEntity }: { record: ProofRuntimeRecord; section: LayoutSection; anchorEntity: string }) {
    return (
        <div className="overflow-hidden rounded-lg border border-[rgba(0,0,0,0.08)] border-l-[3px] border-l-[#00A283] bg-white shadow-sm ring-1 ring-[rgba(0,0,0,0.06)]">
            <div className="border-b border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.025)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(39,63,82,0.8)" }}>
                {section.title}
            </div>
            <div className="flex flex-col gap-3 p-3">
                {section.rows.map((row) => (
                    <RowView key={row.id} record={record} row={row} anchorEntity={anchorEntity} />
                ))}
            </div>
        </div>
    );
}

export type LayoutRuntimePlanViewProps = {
    doc: LayoutDoc;
    record: ProofRuntimeRecord;
    plan?: LayoutRuntimePlan;
    onAdornmentAction?: AdornmentActionHandler;
};

export default function LayoutRuntimePlanView({ doc, record, plan: planProp, onAdornmentAction }: LayoutRuntimePlanViewProps) {
    const plan = useMemo(() => planProp ?? buildLayoutRuntimePlan(doc), [planProp, doc]);
    const anchorEntity = plan.entityType;

    if (!doc?.sections?.length) {
        return <div className="text-sm" style={{ color: MUTED }}>No drawer layout.</div>;
    }

    return (
        <AdornmentActionContext.Provider value={onAdornmentAction}>
            <div className="flex flex-col gap-3" style={{ border: `0 solid ${BORDER}` }}>
                <div className="rounded-md border border-[#e6e8ec] bg-[#fbfcfe] px-3 py-2 text-[11px]" style={{ color: MUTED }}>
                    Runtime plan · {plan.layoutKey ?? "default"} · bindings:{" "}
                    {Object.entries(plan.bindingClassCounts)
                        .filter(([, n]) => n > 0)
                        .map(([k, n]) => `${k}=${n}`)
                        .join(", ")}
                </div>
                {doc.sections.map((section) => (
                    <SectionView key={section.id} record={record} section={section} anchorEntity={anchorEntity} />
                ))}
            </div>
        </AdornmentActionContext.Provider>
    );
}

/** Parity helper: resolve base field the legacy proof path would show. */
export function resolveLegacyProofValue(record: ProofRuntimeRecord, item: LayoutItem) {
    return resolveItemValue(record, item);
}
