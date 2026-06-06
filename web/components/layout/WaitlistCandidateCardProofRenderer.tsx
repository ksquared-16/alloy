"use client";

/**
 * Layout V2 proof — WAITLIST CANDIDATE CARD renderer (Phase 1).
 *
 * PROOF renderer only. Composes the candidate card FACE from a Layout V2 queue
 * doc (zone-placed items) resolved against a {@link WaitlistCandidateCardVM}.
 * It renders nothing it isn't given: tier, position, and override values come
 * from the VM (runtime-computed); it never ranks, groups, or mutates. Imports
 * NO production QueueBlock / placement panels. Mirrors the live placement card
 * visual with concrete Alloy tokens so it renders outside workspace.css scope.
 *
 * Missing optional data (age, phone, email, location, etc.) renders as blank —
 * never a UUID or a fabricated value.
 */

import { type ReactNode } from "react";
import {
    type LayoutDoc,
    type LayoutItem,
} from "@/lib/layout/layoutV2";
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

/** Map an action label to the capability flag that gates it. */
function actionEnabled(vm: WaitlistCandidateCardVM, label: string): boolean {
    const a = vm.actions;
    if (/^open$/i.test(label)) return a.canOpen !== false;
    if (/message/i.test(label)) return a.canMessage !== false;
    if (/offer/i.test(label)) return a.canCreateOffer !== false;
    if (/override/i.test(label)) return a.canOverride !== false;
    if (/bos/i.test(label)) return a.canAskBos !== false;
    return true;
}

type Zoned = Record<string, LayoutItem[]>;
function zonesOf(doc: LayoutDoc): { zones: Zoned; actionLabels: string[] } {
    const zones: Zoned = {};
    let actionLabels = DEFAULT_ACTIONS;
    const push = (z: string, it: LayoutItem) => {
        (zones[z] ??= []).push(it);
    };
    for (const s of doc.sections) {
        for (const r of s.rows) {
            for (const c of r.columns) {
                for (const it of c.items) {
                    const z = (it.metadata as { zone?: string } | undefined)?.zone;
                    if (it.kind === "widget_placeholder" && it.refKey === "actions") {
                        const labels = (it.metadata as { actions?: unknown } | undefined)?.actions;
                        if (Array.isArray(labels) && labels.length) actionLabels = labels.map((x) => String(x));
                        continue;
                    }
                    if (z) push(z, it);
                }
            }
        }
    }
    return { zones, actionLabels };
}

function fieldText(record: Record<string, unknown>, item: LayoutItem): { text: string; placeholder: boolean } {
    const r = resolveItemValue(record, item);
    return { text: r.isPlaceholder ? "" : (r.display ?? ""), placeholder: r.isPlaceholder };
}

function Pill({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex shrink-0 items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold leading-tight" style={{ border: `1px solid ${PILL_BORDER}`, background: PILL_BG, color: MIDNIGHT, letterSpacing: "-0.01em" }}>
            {children}
        </span>
    );
}

/** Render the value items of a zone as an inline icon+value row (skips blanks). */
function ZoneRow({ items, record, asPills = false }: { items: LayoutItem[]; record: Record<string, unknown>; asPills?: boolean }) {
    const rendered = items
        .map((it) => ({ it, v: fieldText(record, it) }))
        .filter((x) => !x.v.placeholder);
    if (rendered.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]" style={{ color: MIDNIGHT }}>
            {rendered.map(({ it, v }) =>
                asPills ? (
                    <Pill key={it.id}>{v.text}</Pill>
                ) : (
                    <span key={it.id} className="inline-flex items-center gap-1">
                        {it.adornment ? <AdornmentIcon icon={it.adornment.icon} className="h-3 w-3 text-[rgba(39,63,82,0.5)]" /> : null}
                        <span style={{ color: MUTED }}>{v.text}</span>
                    </span>
                ),
            )}
        </div>
    );
}

export default function WaitlistCandidateCardProofRenderer({
    doc,
    vm,
    onOpen,
    onAction,
}: {
    doc: LayoutDoc;
    vm: WaitlistCandidateCardVM;
    onOpen?: () => void;
    onAction?: (label: string) => void;
}) {
    const record = waitlistCardVmToProofRecord(vm);
    const { zones, actionLabels } = zonesOf(doc);

    const identity = zones["header.identity"] ?? [];
    const priority = zones["header.priority"] ?? [];
    const positionItems = zones["header.position"] ?? [];
    const positionText = positionItems.length ? fieldText(record, positionItems[0]) : { text: "", placeholder: true };

    const accent = vm.overrides.hasActive || vm.overrides.manuallyAdjusted ? EMBER : PINE;
    const titleItem = identity[0];
    const titleVal = titleItem ? fieldText(record, titleItem) : { text: vm.child.name, placeholder: false };

    const bodyZoneKeys = ["body.child", "body.program_fit", "body.availability", "body.household", "body.override_flags"];

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
                {/* header: identity + priority tier + position */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex shrink-0 items-center text-[rgba(39,63,82,0.7)]">
                        <AdornmentIcon icon={titleItem?.adornment?.icon ?? "child"} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: MIDNIGHT }}>
                        {titleVal.placeholder ? vm.child.name || "Candidate" : titleVal.text}
                    </span>
                    {priority.map((it) => {
                        const v = fieldText(record, it);
                        return v.placeholder ? null : <Pill key={it.id}>{v.text}</Pill>;
                    })}
                    {!positionText.placeholder ? (
                        <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold" style={{ borderColor: "rgba(39,63,82,0.18)", color: MUTED }} title={vm.waitlist.positionHelp}>
                            {positionText.text}{vm.waitlist.positionMode === "preview" ? " · preview" : ""}
                        </span>
                    ) : (
                        <span className="ml-auto text-[10px] italic" style={{ color: "rgba(39,63,82,0.4)" }}>position set by runtime</span>
                    )}
                </div>

                {/* body zones — each renders as its own card row when it has data */}
                {bodyZoneKeys.map((zk) => {
                    const items = zones[zk] ?? [];
                    if (items.length === 0) return null;
                    const asPills = zk === "body.override_flags";
                    return (
                        <div key={zk} className="pt-1.5" style={{ borderTop: `1px solid ${ROW_DIVIDER}` }}>
                            <ZoneRow items={items} record={record} asPills={asPills} />
                        </div>
                    );
                })}

                {/* sibling/link context (informational, from the VM) */}
                {vm.waitlist.siblingContextLines?.length ? (
                    <div className="pt-1.5 text-[10px]" style={{ borderTop: `1px solid ${ROW_DIVIDER}`, color: MUTED }}>
                        {vm.waitlist.siblingContextLines.join(" · ")}
                    </div>
                ) : null}
            </div>

            {/* right action stack — capability-gated; Open = pine primary */}
            <div className="flex shrink-0 flex-col items-stretch justify-start gap-1" role="group" aria-label="Actions">
                {actionLabels.filter((l) => actionEnabled(vm, l)).map((label, i) => {
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
