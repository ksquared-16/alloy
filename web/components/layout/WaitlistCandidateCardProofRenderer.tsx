"use client";

/**
 * Layout V2 proof — WAITLIST CANDIDATE CARD renderer (visual-parity pass).
 *
 * PROOF renderer only. Composes the candidate card FACE from a Layout V2 queue
 * doc (zone-placed field + widget items) resolved against a
 * {@link WaitlistCandidateCardVM}. Mirrors the live placement card structure:
 * header (identity + household + status pill + tier + position + location),
 * stacked body rows (child / program fit / availability / household / override
 * flags), attention styling, and a capability-gated action stack. Waitlist
 * widgets (position / tier / override / adjustment / capacity recommendation)
 * are placeable and rendered here as presentation chips/controls.
 *
 * It renders nothing it isn't given: tier/position/override come from the VM
 * (runtime-computed); it never ranks, groups, or mutates. Imports NO production
 * QueueBlock / placement panels. Missing optional data renders blank.
 */

import { type ReactNode } from "react";
import { type LayoutDoc, type LayoutItem } from "@/lib/layout/layoutV2";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import {
    waitlistCardVmToProofRecord,
    type WaitlistCandidateCardVM,
} from "@/lib/layout/waitlist/waitlistCandidateCardVm";
import AdornmentIcon from "@/components/layout/AdornmentIcon";

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

const DEFAULT_ACTIONS = ["Open", "Message", "Create Offer", "Override", "Ask BOS"];

function actionEnabled(vm: WaitlistCandidateCardVM, label: string): boolean {
    const a = vm.actions;
    if (/^open$/i.test(label)) return a.canOpen !== false;
    if (/message/i.test(label)) return a.canMessage !== false;
    if (/offer/i.test(label)) return a.canCreateOffer !== false;
    if (/override/i.test(label)) return a.canOverride !== false;
    if (/bos/i.test(label)) return a.canAskBos !== false;
    return true;
}

type ZoneBuckets = { fields: Record<string, LayoutItem[]>; widgets: Record<string, LayoutItem[]>; actionLabels: string[] };
function bucketize(doc: LayoutDoc): ZoneBuckets {
    const fields: Record<string, LayoutItem[]> = {};
    const widgets: Record<string, LayoutItem[]> = {};
    let actionLabels = DEFAULT_ACTIONS;
    for (const s of doc.sections) {
        for (const r of s.rows) {
            for (const c of r.columns) {
                for (const it of c.items) {
                    const z = (it.metadata as { zone?: string } | undefined)?.zone ?? "";
                    if (it.kind === "widget_placeholder") {
                        if (it.refKey === "actions") {
                            const labels = (it.metadata as { actions?: unknown } | undefined)?.actions;
                            if (Array.isArray(labels) && labels.length) actionLabels = labels.map((x) => String(x));
                            continue;
                        }
                        if (z) (widgets[z] ??= []).push(it);
                    } else if (z) {
                        (fields[z] ??= []).push(it);
                    }
                }
            }
        }
    }
    return { fields, widgets, actionLabels };
}

function fieldText(record: Record<string, unknown>, item: LayoutItem): { text: string; placeholder: boolean } {
    const r = resolveItemValue(record, item);
    return { text: r.isPlaceholder ? "" : (r.display ?? ""), placeholder: r.isPlaceholder };
}

function Pill({ children, tone = "pine" }: { children: ReactNode; tone?: "pine" | "ember" }) {
    const ember = tone === "ember";
    return (
        <span
            className="inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold leading-tight"
            style={{
                border: `1px solid ${ember ? "rgba(188,67,0,0.5)" : PILL_BORDER}`,
                background: ember ? "rgba(188,67,0,0.08)" : PILL_BG,
                color: ember ? "#5c2c0a" : MIDNIGHT,
                letterSpacing: "-0.01em",
            }}
        >
            {children}
        </span>
    );
}

/** Render a placed waitlist widget (presentation only; runtime owns behavior). */
function WaitlistWidget({ item, vm, onAction }: { item: LayoutItem; vm: WaitlistCandidateCardVM; onAction?: (label: string) => void }) {
    const key = item.refKey;
    if (key === "waitlist_position") {
        return vm.waitlist.positionLabel ? <Pill>{vm.waitlist.positionLabel}</Pill> : <span className="text-[10px] italic" style={{ color: "rgba(39,63,82,0.4)" }}>position · runtime</span>;
    }
    if (key === "waitlist_tier") {
        return vm.waitlist.tierLabel ? <Pill>{vm.waitlist.tierLabel}</Pill> : <span className="text-[10px] italic" style={{ color: "rgba(39,63,82,0.4)" }}>tier · runtime</span>;
    }
    if (key === "waitlist_override") {
        return vm.overrides.hasActive ? <Pill tone="ember">{vm.overrides.kinds.join(" · ") || "override"}</Pill> : null;
    }
    if (key === "waitlist_adjustment") {
        return (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAction?.("Adjust position"); }} title="Adjust waitlist position (simulated; runtime owns the mutation)" className="rounded-[5px] border px-2 py-0.5 text-[10px] font-medium" style={{ borderColor: ACTION_QUIET_BORDER, background: ACTION_QUIET_BG, color: ACTION_QUIET_TEXT }}>
                Adjust position
            </button>
        );
    }
    if (key === "capacity_recommendation") {
        return <span className="rounded-[5px] border border-dashed px-2 py-0.5 text-[10px]" style={{ borderColor: "rgba(39,63,82,0.2)", color: MUTED }}>Capacity recommendation · runtime</span>;
    }
    return <span className="rounded-[5px] border border-dashed px-2 py-0.5 text-[10px]" style={{ borderColor: "rgba(39,63,82,0.2)", color: MUTED }}>{item.label || key}</span>;
}

function ZoneContent({ zone, buckets, record, vm, asPills = false, onAction }: { zone: string; buckets: ZoneBuckets; record: Record<string, unknown>; vm: WaitlistCandidateCardVM; asPills?: boolean; onAction?: (label: string) => void }) {
    const fields = (buckets.fields[zone] ?? []).map((it) => ({ it, v: fieldText(record, it) })).filter((x) => !x.v.placeholder);
    const widgets = buckets.widgets[zone] ?? [];
    if (fields.length === 0 && widgets.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: MIDNIGHT }}>
            {fields.map(({ it, v }) =>
                asPills ? (
                    <Pill key={it.id} tone="ember">{v.text}</Pill>
                ) : (
                    <span key={it.id} className="inline-flex items-center gap-1">
                        {it.adornment ? <AdornmentIcon icon={it.adornment.icon} className="h-3 w-3 text-[rgba(39,63,82,0.5)]" /> : null}
                        <span style={{ color: MUTED }}>{v.text}</span>
                    </span>
                ),
            )}
            {widgets.map((it) => <WaitlistWidget key={it.id} item={it} vm={vm} onAction={onAction} />)}
        </div>
    );
}

export default function WaitlistCandidateCardProofRenderer({
    doc,
    vm,
    onOpen,
    onAction,
    showRuntimePosition = true,
}: {
    doc: LayoutDoc;
    vm: WaitlistCandidateCardVM;
    onOpen?: () => void;
    onAction?: (label: string) => void;
    /** Group-config display toggle (Goal 6); hides the header position chip. */
    showRuntimePosition?: boolean;
}) {
    const record = waitlistCardVmToProofRecord(vm);
    const buckets = bucketize(doc);

    const identity = buckets.fields["header.identity"] ?? [];
    const titleItem = identity[0];
    const titleVal = titleItem ? fieldText(record, titleItem) : { text: vm.child.name, placeholder: false };

    const tierItems = buckets.fields["header.priority"] ?? [];
    const accent = vm.overrides.hasActive || vm.overrides.manuallyAdjusted ? EMBER : PINE;
    const householdSub = vm.household.name || vm.household.primaryContactName;

    const bodyZones: { zone: string; pills?: boolean }[] = [
        { zone: "header.position", pills: false }, // position widgets can also live in body
        { zone: "body.child" },
        { zone: "body.program_fit" },
        { zone: "body.availability" },
        { zone: "body.household" },
        { zone: "body.override_flags", pills: true },
    ];

    return (
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
            data-waitlist-candidate-card
        >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {/* header: identity + tier + status + location + position */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex shrink-0 items-center text-[rgba(39,63,82,0.7)]">
                        <AdornmentIcon icon={titleItem?.adornment?.icon ?? "child"} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: MIDNIGHT }}>
                        {titleVal.placeholder ? vm.child.name || "Candidate" : titleVal.text}
                    </span>
                    {tierItems.map((it) => {
                        const v = fieldText(record, it);
                        return v.placeholder ? null : <Pill key={it.id}>{v.text}</Pill>;
                    })}
                    {vm.waitlist.status ? <Pill>{vm.waitlist.status}</Pill> : null}
                    {vm.household.locationName ? (
                        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }}>
                            <AdornmentIcon icon="location" className="h-3 w-3" /> {vm.household.locationName}
                        </span>
                    ) : null}
                    {showRuntimePosition ? (
                        vm.waitlist.positionLabel ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold" style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }} title={vm.waitlist.positionHelp}>
                                {vm.waitlist.positionLabel}{vm.waitlist.positionMode === "preview" ? " · preview" : ""}
                            </span>
                        ) : (
                            <span className="ml-auto text-[10px] italic" style={{ color: "rgba(39,63,82,0.4)" }}>position set by runtime</span>
                        )
                    ) : null}
                </div>

                {/* household subtitle */}
                {householdSub ? (
                    <div className="-mt-1 text-[11px]" style={{ color: MUTED }}>{householdSub} household</div>
                ) : null}

                {/* attention styling — override/manual adjustment */}
                {vm.overrides.hasActive || vm.overrides.manuallyAdjusted ? (
                    <div className="rounded-[5px] px-2 py-1 text-[11px] font-medium leading-snug" style={{ borderLeft: `3px solid ${EMBER}`, background: "rgba(188,67,0,0.07)", color: "#5c2c0a" }}>
                        {vm.overrides.manuallyAdjusted ? "Manually adjusted" : "Override active"}
                        {vm.overrides.reason ? ` — ${vm.overrides.reason}` : ""}
                    </div>
                ) : null}

                {/* body rows — each zone stacks as its own card row with a divider */}
                {bodyZones.map(({ zone, pills }) => {
                    const hasContent = (buckets.fields[zone]?.some((it) => !fieldText(record, it).placeholder)) || (buckets.widgets[zone]?.length ?? 0) > 0;
                    if (!hasContent) return null;
                    return (
                        <div key={zone} className="pt-1.5" style={{ borderTop: `1px solid ${ROW_DIVIDER}` }}>
                            <ZoneContent zone={zone} buckets={buckets} record={record} vm={vm} asPills={pills} onAction={onAction} />
                        </div>
                    );
                })}

                {vm.waitlist.siblingContextLines?.length ? (
                    <div className="pt-1.5 text-[10px]" style={{ borderTop: `1px solid ${ROW_DIVIDER}`, color: MUTED }}>
                        {vm.waitlist.siblingContextLines.join(" · ")}
                    </div>
                ) : null}
            </div>

            {/* right action stack */}
            <div className="flex shrink-0 flex-col items-stretch justify-start gap-1" role="group" aria-label="Actions">
                {buckets.actionLabels.filter((l) => actionEnabled(vm, l)).map((label, i) => {
                    const isOpen = /^open$/i.test(label);
                    return (
                        <button
                            key={`${label}-${i}`}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); if (isOpen) onOpen?.(); else onAction?.(label); }}
                            title={isOpen ? "Open candidate" : `${label} (simulated)`}
                            className="rounded-[5px] px-2.5 py-1 text-[10px] leading-tight"
                            style={
                                isOpen
                                    ? { background: ACTION_OPEN_BG, border: `1px solid ${ACTION_OPEN_BG}`, color: "#fff", fontWeight: 800, letterSpacing: "0.05em" }
                                    : { border: `1px solid ${ACTION_QUIET_BORDER}`, background: ACTION_QUIET_BG, color: ACTION_QUIET_TEXT, fontWeight: 650 }
                            }
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
