"use client";

/**
 * Layout V2 proof — WORK-UNIT QUEUE CARD renderer.
 *
 * PROOF renderer only. Renders a Layout V2 `queue` doc in the visual style of
 * the production work-unit queue card, WITHOUT importing any production code.
 * The visual target is:
 *   web/app/adminV2/components/workspace/blocks/QueueBlock.tsx
 *   web/app/adminV2/components/workspace/blocks/QueueRowOperationalBands.tsx
 * (audited; styles mirrored here with concrete Alloy token values so the proof
 * renders correctly outside the workspace.css `[data-ws-surface]` scope).
 *
 * Placement is config-driven: each item's bounded `metadata.zone`
 * (header.title/status/attention/location, body.contact/children/tour,
 * actions.stack) decides where it renders; a heuristic infers the zone when
 * none is set. The right-side action stack (Open / Message / Update Status /
 * Ask BOS) is operational and simulated — reserved by the layout, not a field.
 */

import { createContext, useContext } from "react";
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

// --- Alloy tokens (concrete; mirrors workspace.css color-mix values) ---------
const MIDNIGHT = "#273F52";
const PINE = "#00A283";
const EMBER = "#bc4300";
const MUTED = "rgba(39,63,82,0.6)";
const CARD_BORDER = "rgba(0,162,131,0.22)";
const PILL_BORDER = "rgba(0,162,131,0.38)";
const PILL_BG = "rgba(0,162,131,0.12)";
const ROW_DIVIDER = "rgba(39,63,82,0.08)";
// Action chips — mirror workspace.css: Open = dark pine/teal primary; the rest
// are quiet neutral secondaries (NOT the alloy-blue used elsewhere).
const ACTION_OPEN_BG = "#0a8f78"; // color-mix(d-pine 92%, #0f172a)
const ACTION_OPEN_BORDER = "#0a8f78";
const ACTION_QUIET_BG = "#f5f8fc";
const ACTION_QUIET_BORDER = "rgba(39,63,82,0.16)";
const ACTION_QUIET_TEXT = "#39485a";

type AdornmentActionHandler = (item: LayoutItem, adornment: LayoutFieldAdornment) => void;
const QueueAdornCtx = createContext<{ onAdorn?: AdornmentActionHandler }>({});

/** Default operational actions when the layout doesn't specify labels. */
const DEFAULT_ACTIONS = ["Open", "Message", "Update Status", "Ask BOS"];

// --- zone extraction ---------------------------------------------------------

type QueueZones = {
    title?: LayoutItem;
    status?: LayoutItem;
    attention?: LayoutItem;
    location?: LayoutItem;
    contact: LayoutItem[];
    children?: LayoutItem;
    tour?: LayoutItem;
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

/**
 * Infer a queue zone for an item that has no explicit `metadata.zone`. Returns
 * null for items that don't clearly belong to a zone (e.g. a stray opportunity
 * name/title) — those are NOT rendered, so the card never surfaces a record
 * name/title unless the layout explicitly places it. (Prevents the
 * "Family inquiry — Nguyen / North Campus" leak from generic table columns.)
 */
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
    // A computed display template (other than household) is still a title candidate.
    if (typeof item.template === "string") return "header.title";
    // Unknown plain fields (name/title/etc.) are intentionally skipped.
    return null;
}

function extractZones(doc: LayoutDoc): QueueZones {
    const z: QueueZones = { contact: [], actionLabels: DEFAULT_ACTIONS };
    for (const item of flattenItems(doc)) {
        const explicit = (item.metadata as { zone?: string } | undefined)?.zone as LayoutQueueZone | undefined;
        const zoneKey = explicit ?? inferZone(item);
        if (!zoneKey) continue;
        switch (zoneKey) {
            case "header.title": z.title = item; break;
            case "header.status": z.status = item; break;
            case "header.attention": z.attention = item; break;
            case "header.location": z.location = item; break;
            case "body.contact": z.contact.push(item); break;
            case "body.children": z.children = item; break;
            case "body.tour": z.tour = item; break;
            case "actions.stack": {
                z.actions = item;
                const labels = (item.metadata as { actions?: unknown } | undefined)?.actions;
                if (Array.isArray(labels) && labels.length) z.actionLabels = labels.map((a) => String(a));
                break;
            }
        }
    }
    return z;
}

// --- shared cells ------------------------------------------------------------

function Adorn({ item }: { item: LayoutItem }) {
    const { onAdorn } = useContext(QueueAdornCtx);
    const ad = item.adornment;
    if (!ad) return null;
    if (ad.action && onAdorn) {
        return (
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAdorn(item, ad); }}
                title={`Open ${ad.action.entity} drawer`}
                className="inline-flex shrink-0 items-center rounded p-0.5 text-[#00458C] hover:bg-[#eef3fb]"
            >
                <AdornmentIcon icon={ad.icon} className="h-3 w-3" />
            </button>
        );
    }
    return (
        <span className="inline-flex shrink-0 items-center" style={{ color: MUTED }}>
            <AdornmentIcon icon={ad.icon} className="h-3 w-3" />
        </span>
    );
}

function StatusPill({ item, record }: { item: LayoutItem; record: Rec }) {
    const r = resolveItemValue(record, item);
    const label = r.isPlaceholder ? "—" : r.display;
    return (
        <span
            className="inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold leading-tight"
            style={{ border: `1px solid ${PILL_BORDER}`, background: PILL_BG, color: MIDNIGHT, letterSpacing: "-0.01em" }}
        >
            {label}
        </span>
    );
}

/** Resolve a field/template/column value to a plain display string. */
function valueOf(record: Rec, refKey: string, opts?: { renderHint?: string; template?: string }): { text: string; placeholder: boolean } {
    const synthetic: LayoutItem = { id: refKey, kind: "field", refKey, renderHint: opts?.renderHint as LayoutItem["renderHint"], template: opts?.template };
    const r = resolveItemValue(record, synthetic);
    return { text: r.isPlaceholder ? "" : (r.display ?? ""), placeholder: r.isPlaceholder };
}

// --- children rows -----------------------------------------------------------

function ChildRows({ item, record }: { item: LayoutItem; record: Rec }) {
    const cols = (item.columns ?? []) as LayoutCollectionColumn[];
    const raw = record[item.source ?? item.refKey];
    const rows: Rec[] = Array.isArray(raw) ? (raw as Rec[]) : [];
    const noun = item.related?.entityType ?? "child";

    // First column = primary identity (name [+ age via a small col]); the rest
    // render as muted context. Each child is its own row.
    const primary = cols[0];
    const ageCol = cols.find((c) => /age/i.test(c.label) || /age/i.test(c.refKey));
    const contextCols = cols.filter((c) => c !== primary && c !== ageCol);

    if (rows.length === 0) {
        return (
            <div className="rounded-[5px] border border-dashed px-2 py-1.5 text-[11px]" style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }}>
                No {noun}ren on this record yet — each {noun} would appear on its own row.
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-0.5">
            {rows.map((rw, i) => {
                const name = primary ? valueOf(rw, primary.refKey, { template: primary.template }).text : "";
                const age = ageCol ? valueOf(rw, ageCol.refKey).text : "";
                return (
                    <div key={(rw.id as string) ?? i} className="flex items-center gap-1.5 text-[11px]" style={{ color: MIDNIGHT }}>
                        {primary?.adornment ? <Adorn item={{ id: "c", kind: "field", refKey: primary.refKey, adornment: { ...primary.adornment, action: primary.adornment.action ? { ...primary.adornment.action } : undefined } }} /> : <AdornmentIcon icon="child" className="h-3 w-3 text-[rgba(39,63,82,0.5)]" />}
                        <span className="truncate font-medium">{name || "—"}{age ? <span className="font-normal" style={{ color: MUTED }}> · {age}</span> : null}</span>
                        {contextCols.map((c) => {
                            const v = valueOf(rw, c.refKey, { renderHint: c.renderHint, template: c.template });
                            if (v.placeholder) return null;
                            if (c.renderHint === "status" || c.renderHint === "badge") {
                                return <span key={c.refKey} className="rounded-[4px] px-1 py-0.5 text-[9px] font-semibold" style={{ border: `1px solid ${PILL_BORDER}`, background: PILL_BG, color: MIDNIGHT }}>{v.text}</span>;
                            }
                            return <span key={c.refKey} className="truncate" style={{ color: MUTED }}>{v.text}</span>;
                        })}
                    </div>
                );
            })}
        </div>
    );
}

// --- contact row -------------------------------------------------------------

function ContactRow({ items, record }: { items: LayoutItem[]; record: Rec }) {
    if (items.length === 0) return null;
    // Primary = the name-ish item (person.* name or first), rest = phone/email.
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
                if (r.isPlaceholder) return null;
                return (
                    <span key={it.id} className="inline-flex items-center gap-1" style={{ color: MUTED }}>
                        {it.adornment ? <Adorn item={it} /> : null}
                        {r.display}
                    </span>
                );
            })}
        </div>
    );
}

// --- the card ----------------------------------------------------------------

export default function QueueCardProofRenderer({
    doc,
    record,
    onOpen,
    onAction,
    onAdornmentAction,
}: {
    doc: LayoutDoc;
    record: Rec;
    /** Card click / "Open" action (opens the proof drawer). */
    onOpen?: () => void;
    /** Non-open simulated action (Message / Update Status / Ask BOS). */
    onAction?: (label: string) => void;
    onAdornmentAction?: AdornmentActionHandler;
}) {
    const z = extractZones(doc);

    const titleText = z.title ? resolveItemValue(record, z.title) : null;
    const attentionText = z.attention ? resolveItemValue(record, z.attention) : null;
    const locationText = z.location ? resolveItemValue(record, z.location) : null;
    const tourText = z.tour ? resolveItemValue(record, z.tour) : null;

    const hasAttention = attentionText && !attentionText.isPlaceholder && attentionText.display;
    // urgency accent: attention present → amber/ember left rail.
    const accent = hasAttention ? EMBER : PINE;

    return (
        <QueueAdornCtx.Provider value={{ onAdorn: onAdornmentAction }}>
            <div
                role="button"
                tabIndex={0}
                onClick={() => onOpen?.()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen?.(); } }}
                className="flex w-full cursor-pointer items-stretch justify-between gap-3 rounded-lg p-2.5 text-left transition-shadow hover:shadow-md"
                style={{
                    border: `1px solid ${CARD_BORDER}`,
                    borderLeft: `3px solid ${accent}`,
                    background: "linear-gradient(172deg,#ffffff 0%, rgba(0,162,131,0.045) 100%)",
                    boxShadow: "0 1px 2px rgba(39,63,82,0.06), inset 0 1px 0 rgba(255,255,255,0.75)",
                }}
                data-queue-card
            >
                {/* main content */}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {/* header row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="inline-flex shrink-0 items-center text-[rgba(39,63,82,0.7)]">
                            {z.title?.adornment ? <AdornmentIcon icon={z.title.adornment.icon} className="h-3.5 w-3.5" /> : <HomeIcon className="h-3.5 w-3.5" aria-hidden />}
                        </span>
                        <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: MIDNIGHT }}>
                            {titleText && !titleText.isPlaceholder ? titleText.display : "Household"}
                        </span>
                        {z.status ? <StatusPill item={z.status} record={record} /> : null}
                        {locationText && !locationText.isPlaceholder ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }}>
                                <AdornmentIcon icon="location" className="h-3 w-3" /> {locationText.display}
                            </span>
                        ) : null}
                    </div>

                    {/* attention / urgent line */}
                    {hasAttention ? (
                        <div
                            className="rounded-[5px] px-2 py-1 text-[11px] font-medium leading-snug"
                            style={{ borderLeft: `3px solid ${EMBER}`, background: "rgba(188,67,0,0.07)", color: "#5c2c0a" }}
                        >
                            {attentionText!.display}
                        </div>
                    ) : null}

                    {/* body rows — each zone stacks as its own card row with a divider */}
                    {z.contact.length > 0 ? (
                        <div className="pt-1.5" style={{ borderTop: `1px solid ${ROW_DIVIDER}` }}>
                            <ContactRow items={z.contact} record={record} />
                        </div>
                    ) : null}

                    {z.children ? (
                        <div className="pt-1.5" style={{ borderTop: `1px solid ${ROW_DIVIDER}` }}>
                            <ChildRows item={z.children} record={record} />
                        </div>
                    ) : null}

                    {z.tour ? (
                        <div className="flex items-center gap-1.5 pt-1.5 text-[11px]" style={{ color: MIDNIGHT, borderTop: `1px solid ${ROW_DIVIDER}` }}>
                            <AdornmentIcon icon="calendar" className="h-3 w-3 text-[rgba(39,63,82,0.5)]" />
                            <span className="font-medium">{z.tour.label || "Tour"}</span>
                            <span style={{ color: MUTED }}>{tourText && !tourText.isPlaceholder ? tourText.display : "—"}</span>
                        </div>
                    ) : null}
                </div>

                {/* right action stack */}
                <div className="flex shrink-0 flex-col items-stretch justify-start gap-1" role="group" aria-label="Actions">
                    {z.actionLabels.map((label, i) => {
                        const isOpen = /^open$/i.test(label);
                        return (
                            <button
                                key={`${label}-${i}`}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isOpen) onOpen?.();
                                    else onAction?.(label);
                                }}
                                title={isOpen ? "Open record" : `${label} (simulated)`}
                                className="rounded-[5px] px-2.5 py-1 text-[10px] leading-tight"
                                style={
                                    isOpen
                                        ? { background: ACTION_OPEN_BG, border: `1px solid ${ACTION_OPEN_BORDER}`, color: "#fff", fontWeight: 800, letterSpacing: "0.05em" }
                                        : { border: `1px solid ${ACTION_QUIET_BORDER}`, background: ACTION_QUIET_BG, color: ACTION_QUIET_TEXT, fontWeight: 650 }
                                }
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </QueueAdornCtx.Provider>
    );
}
