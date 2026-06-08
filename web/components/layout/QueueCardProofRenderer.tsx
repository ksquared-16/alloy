"use client";

/**
 * Layout V2 proof — UNIFIED QUEUE CARD engine.
 *
 * ONE proof renderer for every queue card (Lead pipeline, Waitlist candidate,
 * and future Billing/Collections). It renders a Layout V2 `queue` doc in the
 * work-unit card style, WITHOUT importing production code. Cards differ only by
 * their FIELDS, WIDGETS, and GROUP DISPLAY — not by rendering architecture.
 *
 * Card areas (config-driven via bounded `metadata.zone`):
 *   HEADER   — identity/title · status · priority · position · location
 *   CONTEXT  — the configurable contextual band (lead: next step; waitlist:
 *              position / waitlisted-since / sibling / adjust) — fields + widgets
 *   BODY     — contact · children · tour · + any field zones, stacked as rows
 *   ACTIONS  — Open / Message / … (simulated; reserved by the layout)
 *
 * Values are resolved from the supplied `record` (for waitlist this is the
 * flattened candidate VM). Tier/position/override are runtime-computed; the
 * engine renders them, it never ranks. Missing optional data renders blank.
 */

import { createContext, useContext, type ReactNode } from "react";
import { Home as HomeIcon } from "lucide-react";
import {
    type LayoutCollectionColumn,
    type LayoutDoc,
    type LayoutFieldAdornment,
    type LayoutItem,
    type LayoutQueueZone,
} from "@/lib/layout/layoutV2";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import AdornmentIcon from "@/components/layout/AdornmentIcon";

type Rec = Record<string, unknown>;

const MIDNIGHT = "#273F52";
const PINE = "#00A283";
const EMBER = "#bc4300";
const MUTED = "rgba(39,63,82,0.6)";
const CARD_BORDER = "rgba(0,162,131,0.22)";
const PILL_BORDER = "rgba(0,162,131,0.38)";
const PILL_BG = "rgba(0,162,131,0.12)";
const ROW_DIVIDER = "rgba(39,63,82,0.08)";
const ACTION_OPEN_BG = "#0a8f78";
const ACTION_QUIET_BG = "#f5f8fc";
const ACTION_QUIET_BORDER = "rgba(39,63,82,0.16)";
const ACTION_QUIET_TEXT = "#39485a";

type AdornmentActionHandler = (item: LayoutItem, adornment: LayoutFieldAdornment) => void;
const QueueAdornCtx = createContext<{ onAdorn?: AdornmentActionHandler; onAction?: (label: string) => void }>({});

const DEFAULT_ACTIONS = ["Open", "Message", "Update Status", "Ask BOS"];

// Body zones rendered as generic stacked field rows (after the dedicated ones).
const GENERIC_BODY_ZONES = ["body.child", "body.household", "body.program_fit", "body.availability", "body.override_flags"];

// --- zone extraction ---------------------------------------------------------

type Buckets = {
    fields: Record<string, LayoutItem[]>;
    widgets: Record<string, LayoutItem[]>;
    actions?: LayoutItem;
    actionLabels: string[];
};

function flattenItems(doc: LayoutDoc): LayoutItem[] {
    const out: LayoutItem[] = [];
    const walk = (items: LayoutItem[]) => {
        for (const it of items) {
            out.push(it);
            if (it.items) walk(it.items);
            if (it.rows) it.rows.forEach((r) => r.columns.forEach((c) => walk(c.items)));
        }
    };
    doc.sections.forEach((s) => s.rows.forEach((r) => r.columns.forEach((c) => walk(c.items))));
    return out;
}

/** Infer a zone for an item without explicit `metadata.zone` (lead heuristics). */
function inferZone(item: LayoutItem): LayoutQueueZone | null {
    if (item.kind === "widget_placeholder" && item.refKey === "actions") return "actions.stack";
    if (item.kind === "related_list") return "body.children";
    const ref = item.refKey;
    if (typeof item.template === "string" && /household/i.test(item.template)) return "header.title";
    if (item.renderHint === "status" || ref === "opportunity.status_key") return "header.status";
    if (ref.includes("attention") || (typeof item.template === "string" && item.template.includes("_attention"))) return "header.attention";
    if (ref === "opportunity.location" || item.adornment?.icon === "location") return "header.location";
    if (ref.includes("tour")) return "body.tour";
    if (ref.startsWith("person.") || ["phone", "mail", "person"].includes(item.adornment?.icon ?? "")) return "body.contact";
    if (typeof item.template === "string") return "header.title";
    return null;
}

function bucketize(doc: LayoutDoc): Buckets {
    const fields: Record<string, LayoutItem[]> = {};
    const widgets: Record<string, LayoutItem[]> = {};
    let actions: LayoutItem | undefined;
    let actionLabels = DEFAULT_ACTIONS;
    for (const item of flattenItems(doc)) {
        const explicit = (item.metadata as { zone?: string } | undefined)?.zone as string | undefined;
        const zone = explicit ?? inferZone(item) ?? "";
        if (item.kind === "widget_placeholder") {
            if (item.refKey === "actions") {
                actions = item;
                const labels = (item.metadata as { actions?: unknown } | undefined)?.actions;
                if (Array.isArray(labels) && labels.length) actionLabels = labels.map((a) => String(a));
                continue;
            }
            if (zone) (widgets[zone] ??= []).push(item);
        } else if (zone) {
            (fields[zone] ??= []).push(item);
        }
    }
    return { fields, widgets, actions, actionLabels };
}

const first = (b: Buckets, zone: string): LayoutItem | undefined => b.fields[zone]?.[0];
const all = (b: Buckets, ...zones: string[]): LayoutItem[] => zones.flatMap((z) => b.fields[z] ?? []);
const widgetsIn = (b: Buckets, ...zones: string[]): LayoutItem[] => zones.flatMap((z) => b.widgets[z] ?? []);

// --- shared cells ------------------------------------------------------------

function Adorn({ item }: { item: LayoutItem }) {
    const { onAdorn } = useContext(QueueAdornCtx);
    const ad = item.adornment;
    if (!ad) return null;
    if (ad.action && onAdorn) {
        return (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAdorn(item, ad); }} title={`Open ${ad.action.entity} drawer`} className="inline-flex shrink-0 items-center rounded p-0.5 text-[#00458C] hover:bg-[#eef3fb]">
                <AdornmentIcon icon={ad.icon} className="h-3 w-3" />
            </button>
        );
    }
    return <span className="inline-flex shrink-0 items-center" style={{ color: MUTED }}><AdornmentIcon icon={ad.icon} className="h-3 w-3" /></span>;
}

function Pill({ children, tone = "pine" }: { children: ReactNode; tone?: "pine" | "ember" }) {
    const ember = tone === "ember";
    return (
        <span className="inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold leading-tight" style={{ border: `1px solid ${ember ? "rgba(188,67,0,0.5)" : PILL_BORDER}`, background: ember ? "rgba(188,67,0,0.08)" : PILL_BG, color: ember ? "#5c2c0a" : MIDNIGHT, letterSpacing: "-0.01em" }}>
            {children}
        </span>
    );
}

function txt(record: Rec, item: LayoutItem): { text: string; placeholder: boolean } {
    const r = resolveItemValue(record, item);
    return { text: r.isPlaceholder ? "" : (r.display ?? ""), placeholder: r.isPlaceholder };
}
function valueOf(record: Rec, refKey: string, opts?: { renderHint?: string; template?: string }): { text: string; placeholder: boolean } {
    return txt(record, { id: refKey, kind: "field", refKey, renderHint: opts?.renderHint as LayoutItem["renderHint"], template: opts?.template });
}

/** A context/body widget rendered by key from the record (presentation only). */
function CardWidget({ item, record }: { item: LayoutItem; record: Rec }) {
    const { onAction } = useContext(QueueAdornCtx);
    const key = item.refKey;
    const v = (k: string) => { const raw = record[k]; return raw == null || raw === "" ? "" : String(raw); };
    if (key === "waitlist_position") { const t = v("waitlist.positionLabel"); return t ? <Pill>{t}</Pill> : <span className="text-[10px] italic" style={{ color: "rgba(39,63,82,0.4)" }}>position · runtime</span>; }
    if (key === "waitlist_tier") { const t = v("waitlist.tierLabel"); return t ? <Pill>{t}</Pill> : <span className="text-[10px] italic" style={{ color: "rgba(39,63,82,0.4)" }}>tier · runtime</span>; }
    if (key === "waitlisted_since") { const t = v("waitlist.waitSince"); return t ? <span style={{ color: MUTED }}>Waitlisted since {t}</span> : null; }
    if (key === "waitlist_override") { const t = v("overrides.flags"); return t ? <Pill tone="ember">{t}</Pill> : null; }
    if (key === "sibling_context") { const t = v("waitlist.siblingContext"); return t ? <span style={{ color: MUTED }}>{t}</span> : null; }
    if (key === "waitlist_adjustment") {
        return <button type="button" onClick={(e) => { e.stopPropagation(); onAction?.("Adjust position"); }} title="Adjust waitlist position (simulated; runtime owns the mutation)" className="rounded-[5px] border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: ACTION_QUIET_BORDER, background: ACTION_QUIET_BG, color: ACTION_QUIET_TEXT }}>Adjust position</button>;
    }
    if (key === "capacity_recommendation") return <span className="rounded-[5px] border border-dashed px-2 py-0.5 text-[10px]" style={{ borderColor: "rgba(39,63,82,0.2)", color: MUTED }}>Capacity recommendation · runtime</span>;
    return <span className="rounded-[5px] border border-dashed px-2 py-0.5 text-[10px]" style={{ borderColor: "rgba(39,63,82,0.2)", color: MUTED }}>{item.label || key}</span>;
}

/** Inline row of configured field items + widgets for a zone (shows labels + placeholders). */
function FieldRow({ fields, widgets, record, asPills = false }: { fields: LayoutItem[]; widgets: LayoutItem[]; record: Rec; asPills?: boolean }) {
    if (fields.length === 0 && widgets.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: MIDNIGHT }}>
            {fields.map((it) => {
                const v = txt(record, it);
                const label = it.label?.trim();
                if (asPills) {
                    return v.placeholder ?
                            <span key={it.id} className="inline-flex items-center gap-1" style={{ color: MUTED }}>{label ? `${label}: ` : ""}—</span>
                        :   <Pill key={it.id} tone="ember">{v.text}</Pill>;
                }
                return (
                    <span key={it.id} className="inline-flex items-center gap-1">
                        {it.adornment ? <Adorn item={it} /> : null}
                        {label ? <span style={{ color: MUTED }}>{label}:</span> : null}
                        <span style={{ color: v.placeholder ? MUTED : MIDNIGHT }}>{v.placeholder ? "—" : v.text}</span>
                    </span>
                );
            })}
            {widgets.map((it) => <CardWidget key={it.id} item={it} record={record} />)}
        </div>
    );
}

function ChildRows({ item, record }: { item: LayoutItem; record: Rec }) {
    const cols = (item.columns ?? []) as LayoutCollectionColumn[];
    const raw = record[item.source ?? item.refKey];
    const rows: Rec[] = Array.isArray(raw) ? (raw as Rec[]) : [];
    const noun = item.related?.entityType ?? "child";
    const primary = cols[0];
    const ageCol = cols.find((c) => /age/i.test(c.label) || /age/i.test(c.refKey));
    const contextCols = cols.filter((c) => c !== primary && c !== ageCol);
    if (rows.length === 0) {
        return <div className="rounded-[5px] border border-dashed px-2 py-1.5 text-[11px]" style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }}>No {noun}ren on this record yet — each {noun} would appear on its own row.</div>;
    }
    return (
        <div className="flex flex-col gap-0.5">
            {rows.map((rw, i) => {
                const name = primary ? valueOf(rw, primary.refKey, { template: primary.template }).text : "";
                const age = ageCol ? valueOf(rw, ageCol.refKey).text : "";
                return (
                    <div key={(rw.id as string) ?? i} className="flex items-center gap-1.5 text-[11px]" style={{ color: MIDNIGHT }}>
                        {primary?.adornment ? <Adorn item={{ id: "c", kind: "field", refKey: primary.refKey, adornment: primary.adornment }} /> : <AdornmentIcon icon="child" className="h-3 w-3 text-[rgba(39,63,82,0.5)]" />}
                        <span className="truncate font-medium">{name || "—"}{age ? <span className="font-normal" style={{ color: MUTED }}> · {age}</span> : null}</span>
                        {contextCols.map((c) => {
                            const v = valueOf(rw, c.refKey, { renderHint: c.renderHint, template: c.template });
                            if (v.placeholder) return null;
                            if (c.renderHint === "status" || c.renderHint === "badge") return <span key={c.refKey} className="rounded-[4px] px-1 py-0.5 text-[9px] font-semibold" style={{ border: `1px solid ${PILL_BORDER}`, background: PILL_BG, color: MIDNIGHT }}>{v.text}</span>;
                            return <span key={c.refKey} className="truncate" style={{ color: MUTED }}>{v.text}</span>;
                        })}
                    </div>
                );
            })}
        </div>
    );
}

function ContactRow({ items, record }: { items: LayoutItem[]; record: Rec }) {
    if (items.length === 0) return null;
    const nameItem = items.find((i) => i.refKey.includes("name")) ?? items[0];
    const rest = items.filter((i) => i !== nameItem);
    const name = resolveItemValue(record, nameItem);
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: MIDNIGHT }}>
            <span className="inline-flex items-center gap-1">
                {nameItem.adornment ? <Adorn item={nameItem} /> : <AdornmentIcon icon="person" className="h-3 w-3 text-[rgba(39,63,82,0.5)]" />}
                <span className="font-medium">{name.isPlaceholder ? "—" : name.display}</span>
            </span>
            {rest.map((it) => {
                const r = resolveItemValue(record, it);
                return (
                    <span key={it.id} className="inline-flex items-center gap-1" style={{ color: MUTED }}>
                        {it.adornment ? <Adorn item={it} /> : null}
                        {r.isPlaceholder ? "—" : r.display}
                    </span>
                );
            })}
        </div>
    );
}

function Divider({ children }: { children: ReactNode }) {
    return <div className="pt-1.5" style={{ borderTop: `1px solid ${ROW_DIVIDER}` }}>{children}</div>;
}

// --- the card ----------------------------------------------------------------

export default function QueueCardProofRenderer({
    doc,
    record,
    onOpen,
    onAction,
    onAdornmentAction,
    showRuntimePosition = true,
}: {
    doc: LayoutDoc;
    record: Rec;
    onOpen?: () => void;
    onAction?: (label: string) => void;
    onAdornmentAction?: AdornmentActionHandler;
    /** Group-config toggle: hide the header position chip when false. */
    showRuntimePosition?: boolean;
}) {
    const b = bucketize(doc);

    const titleItem = first(b, "header.title") ?? first(b, "header.identity");
    const titleText = titleItem ? resolveItemValue(record, titleItem) : null;
    const statusItem = first(b, "header.status");
    const priorityItems = b.fields["header.priority"] ?? [];
    const positionItem = first(b, "header.position");
    const positionText = positionItem ? txt(record, positionItem) : { text: "", placeholder: true };
    const locationItem = first(b, "header.location");
    const locationText = locationItem ? resolveItemValue(record, locationItem) : null;
    const attentionItem = first(b, "header.attention");
    const attentionText = attentionItem ? resolveItemValue(record, attentionItem) : null;
    const hasAttention = attentionText && !attentionText.isPlaceholder && attentionText.display;

    const contextFields = all(b, "context.primary", "context.secondary");
    const contextWidgets = widgetsIn(b, "context.primary", "context.secondary");
    const hasContext = contextFields.length > 0 || contextWidgets.length > 0;

    const tourItem = first(b, "body.tour");
    const tourText = tourItem ? resolveItemValue(record, tourItem) : null;
    const childrenItem = first(b, "body.children");

    const accent = hasAttention ? EMBER : PINE;

    return (
        <QueueAdornCtx.Provider value={{ onAdorn: onAdornmentAction, onAction }}>
            <div
                role="button"
                tabIndex={0}
                onClick={() => onOpen?.()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
                className="flex w-full cursor-pointer items-stretch justify-between gap-3 rounded-lg p-2.5 text-left transition-shadow hover:shadow-md"
                style={{ border: `1px solid ${CARD_BORDER}`, borderLeft: `3px solid ${accent}`, background: "linear-gradient(172deg,#ffffff 0%, rgba(0,162,131,0.045) 100%)", boxShadow: "0 1px 2px rgba(39,63,82,0.06), inset 0 1px 0 rgba(255,255,255,0.75)" }}
                data-queue-card
            >
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {/* HEADER */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="inline-flex shrink-0 items-center text-[rgba(39,63,82,0.7)]">
                            {titleItem?.adornment ? <AdornmentIcon icon={titleItem.adornment.icon} className="h-3.5 w-3.5" /> : <HomeIcon className="h-3.5 w-3.5" aria-hidden />}
                        </span>
                        <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: MIDNIGHT }}>
                            {titleText && !titleText.isPlaceholder ?
                                titleText.display
                            :   (() => {
                                    const fallbackName = [record.name, record.last_name, record.title]
                                        .map((v) => (v == null ? "" : String(v).trim()))
                                        .find((v) => v.length > 0);
                                    return fallbackName || "Record";
                                })()}
                        </span>
                        {statusItem ? (() => {
                            const v = txt(record, statusItem);
                            return <Pill key={statusItem.id}>{v.placeholder ? "—" : v.text}</Pill>;
                        })() : null}
                        {priorityItems.map((it) => { const v = txt(record, it); return v.placeholder ? null : <Pill key={it.id}>{v.text}</Pill>; })}
                        {locationText && !locationText.isPlaceholder ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }}>
                                <AdornmentIcon icon="location" className="h-3 w-3" /> {locationText.display}
                            </span>
                        ) : null}
                        {showRuntimePosition && !positionText.placeholder ? (
                            <span className={`${locationText && !locationText.isPlaceholder ? "" : "ml-auto"} inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold`} style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }}>{positionText.text}</span>
                        ) : null}
                    </div>

                    {/* CONTEXT */}
                    {hasContext ? <Divider><FieldRow fields={contextFields} widgets={contextWidgets} record={record} /></Divider> : null}

                    {/* attention line (lead) */}
                    {hasAttention ? (
                        <div className="rounded-[5px] px-2 py-1 text-[11px] font-medium leading-snug" style={{ borderLeft: `3px solid ${EMBER}`, background: "rgba(188,67,0,0.07)", color: "#5c2c0a" }}>{attentionText!.display}</div>
                    ) : null}

                    {/* BODY */}
                    {b.fields["body.contact"]?.length ? <Divider><ContactRow items={b.fields["body.contact"]} record={record} /></Divider> : null}
                    {childrenItem ? <Divider><ChildRows item={childrenItem} record={record} /></Divider> : null}
                    {GENERIC_BODY_ZONES.map((zone) => {
                        const f = b.fields[zone] ?? [];
                        const w = b.widgets[zone] ?? [];
                        if (f.length === 0 && w.length === 0) return null;
                        return <Divider key={zone}><FieldRow fields={f} widgets={w} record={record} asPills={zone === "body.override_flags"} /></Divider>;
                    })}
                    {tourItem ? (
                        <div className="flex items-center gap-1.5 pt-1.5 text-[11px]" style={{ color: MIDNIGHT, borderTop: `1px solid ${ROW_DIVIDER}` }}>
                            <AdornmentIcon icon="calendar" className="h-3 w-3 text-[rgba(39,63,82,0.5)]" />
                            <span className="font-medium">{tourItem.label || "Tour"}</span>
                            <span style={{ color: MUTED }}>{tourText && !tourText.isPlaceholder ? tourText.display : "—"}</span>
                        </div>
                    ) : null}
                </div>

                {/* ACTIONS */}
                <div className="flex shrink-0 flex-col items-stretch justify-start gap-1" role="group" aria-label="Actions">
                    {b.actionLabels.map((label, i) => {
                        const isOpen = /^open$/i.test(label);
                        return (
                            <button key={`${label}-${i}`} type="button" onClick={(e) => { e.stopPropagation(); if (isOpen) onOpen?.(); else onAction?.(label); }} title={isOpen ? "Open record" : `${label} (simulated)`} className="rounded-[5px] px-2.5 py-1 text-[10px] leading-tight" style={isOpen ? { background: ACTION_OPEN_BG, border: `1px solid ${ACTION_OPEN_BG}`, color: "#fff", fontWeight: 800, letterSpacing: "0.05em" } : { border: `1px solid ${ACTION_QUIET_BORDER}`, background: ACTION_QUIET_BG, color: ACTION_QUIET_TEXT, fontWeight: 650 }}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </QueueAdornCtx.Provider>
    );
}
