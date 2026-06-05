"use client";

/**
 * PROOF-ONLY drawer shell. Visually mirrors the staging opportunity (Lead)
 * drawer chrome — right-side panel, sticky header with title/status/actions,
 * tab strip, lifecycle rail, scrollable body — using only Alloy design tokens
 * and lucide icons. It imports NO live drawer/VM/runtime components (those pull
 * data + behavior); everything here is static chrome around a Layout V2 body.
 *
 * Mutation affordances (status select, actions) are present but disabled /
 * clearly simulated. This is not the live drawer and performs no fetches.
 */

import { useState, type ReactNode } from "react";
import { MoreHorizontal, X } from "lucide-react";
import ProofLifecycleRail from "./ProofLifecycleRail";

const BORDER = "rgba(39,63,82,0.18)";
const TEXT = "#273F52";
const MUTED = "rgba(39,63,82,0.65)";
const SURFACE = "#FFFFFF";
const BODY_BG = "#F6F8FC";
const MIDNIGHT = "#273F52";

export const PROOF_DRAWER_TABS = ["overview", "communications", "notes", "documents", "activity"] as const;
export type ProofDrawerTab = (typeof PROOF_DRAWER_TABS)[number];
const TAB_LABELS: Record<ProofDrawerTab, string> = {
    overview: "Overview",
    communications: "Communications",
    notes: "Notes",
    documents: "Documents",
    activity: "Activity",
};

export default function ProofDrawerShell({
    open,
    onClose,
    title,
    subtitle,
    statusLabel,
    attention,
    lifecycleStatusKey,
    children,
    footer,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    statusLabel?: string;
    attention?: string | null;
    lifecycleStatusKey?: string | null;
    /** Overview body (Layout V2 rendered content). */
    children: ReactNode;
    footer?: ReactNode;
}) {
    const [tab, setTab] = useState<ProofDrawerTab>("overview");
    if (!open) return null;

    return (
        <>
            {/* backdrop */}
            <div className="fixed inset-0 bg-black/50" style={{ zIndex: 40 }} aria-hidden onClick={onClose} />
            {/* panel */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="fixed right-0 left-auto top-0 flex h-screen w-[min(100vw,42rem)] max-w-2xl flex-col border border-solid shadow-xl"
                style={{
                    zIndex: 50,
                    backgroundColor: SURFACE,
                    color: TEXT,
                    borderColor: BORDER,
                    borderLeftColor: MIDNIGHT,
                    borderLeftWidth: 4,
                    borderLeftStyle: "solid",
                }}
            >
                {/* sticky header */}
                <div className="sticky top-0 z-20 shrink-0 border-b border-solid" style={{ backgroundColor: SURFACE, borderColor: BORDER }}>
                    {/* row 1: title + status + actions */}
                    <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-4">
                        <div className="min-w-0 flex-1">
                            <h2 className="break-words text-xl font-bold leading-snug" style={{ color: TEXT }}>
                                {title}
                            </h2>
                            {subtitle && (
                                <p className="mt-1 text-sm font-medium leading-snug" style={{ color: MUTED }}>
                                    {subtitle}
                                </p>
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {/* status affordance (disabled — simulated) */}
                            <label className="inline-flex min-w-0 items-center gap-1.5" title="Status (simulated — read-only in proof)">
                                <select
                                    disabled
                                    value="cur"
                                    className="max-w-[10rem] truncate rounded-md border border-[rgba(0,0,0,0.14)] bg-white px-2 py-1 text-xs font-medium text-[rgba(39,63,82,0.85)] disabled:opacity-80"
                                >
                                    <option value="cur">{statusLabel || "—"}</option>
                                </select>
                            </label>
                            <button type="button" disabled title="Actions (simulated)" className="rounded-md border border-[rgba(0,0,0,0.14)] bg-white p-1.5 text-[rgba(39,63,82,0.6)] disabled:opacity-70">
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                            </button>
                            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-[rgba(39,63,82,0.7)] hover:bg-[rgba(0,0,0,0.05)]">
                                <X className="h-4 w-4" aria-hidden />
                            </button>
                        </div>
                    </div>

                    {/* row 2: attention card */}
                    {attention ? (
                        <div className="px-6 pb-2">
                            <div className="w-full rounded-xl border-l-[3px] border-l-[rgba(0,69,140,0.5)] bg-gradient-to-br from-white via-white to-[rgba(0,0,0,0.06)] px-2.5 py-1.5 ring-1 ring-[rgba(39,63,82,0.06)]">
                                <p className="line-clamp-2 text-left text-[11px] font-medium leading-snug" style={{ color: TEXT }}>
                                    {attention}
                                </p>
                            </div>
                        </div>
                    ) : null}

                    {/* row 3: tabs */}
                    <div className="px-6 pb-1">
                        <div className="flex min-h-0 flex-wrap gap-0.5 rounded-lg border border-[rgba(0,0,0,0.14)] bg-white px-1.5 py-1.5">
                            {PROOF_DRAWER_TABS.map((t) => {
                                const active = tab === t;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setTab(t)}
                                        className={`rounded-md px-3 py-1.5 text-xs font-medium leading-snug transition-colors ${
                                            active ? "text-white shadow-sm" : "text-[#273F52]/80 hover:bg-[rgba(0,0,0,0.05)]"
                                        }`}
                                        style={active ? { backgroundColor: MIDNIGHT, borderBottom: "2px solid rgba(0,162,131,0.45)" } : undefined}
                                    >
                                        {TAB_LABELS[t]}
                                        {t !== "overview" && <span className="ml-1 text-[9px] opacity-60">·</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* row 4: lifecycle rail */}
                    <div className="px-6 pb-2 pt-0">
                        <ProofLifecycleRail statusKey={lifecycleStatusKey} />
                    </div>
                </div>

                {/* body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6" style={{ backgroundColor: BODY_BG }}>
                    {tab === "overview" ? (
                        children
                    ) : (
                        <div className="rounded-lg border border-dashed border-[rgba(39,63,82,0.2)] bg-white p-6 text-center text-sm" style={{ color: MUTED }}>
                            <div className="font-medium" style={{ color: TEXT }}>
                                {TAB_LABELS[tab]}
                            </div>
                            <p className="mt-1">Not part of this layout proof. Layout V2 configures the Overview body; other tabs are live-runtime only.</p>
                        </div>
                    )}
                </div>

                {footer ? (
                    <div className="shrink-0 border-t px-6 py-2 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
                        {footer}
                    </div>
                ) : null}
            </div>
        </>
    );
}
