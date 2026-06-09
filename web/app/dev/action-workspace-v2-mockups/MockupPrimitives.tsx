"use client";

import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import type { ReactNode } from "react";
import type { FindingGroup, FindingStatus } from "./fixtures";

const PHASES = ["Intake", "Findings", "Fill Gaps", "Ready To Create"] as const;
export type MockupPhase = (typeof PHASES)[number];

const STATUS_STYLES: Record<
    FindingStatus,
    { rail: string; badge: string; badgeLabel: string; panel: string }
> = {
    confirmed: {
        rail: "border-l-alloy-juniper",
        badge: "bg-alloy-juniper/12 text-alloy-juniper border-alloy-juniper/25",
        badgeLabel: "Confirmed",
        panel: "bg-white border-alloy-stone/15",
    },
    review: {
        rail: "border-l-amber-400",
        badge: "bg-amber-50 text-amber-950 border-amber-200",
        badgeLabel: "Needs review",
        panel: "bg-amber-50/60 border-amber-200/80",
    },
    uncertain: {
        rail: "border-l-red-500",
        badge: "bg-red-50 text-red-900 border-red-200",
        badgeLabel: "Uncertain",
        panel: "bg-red-50/50 border-red-200/70",
    },
};

export function MockupDeck({
    mockupId,
    activePhase,
    sourceText,
    rightHeader,
    rightChildren,
    footer,
    rightFooterNote,
}: {
    mockupId: string;
    activePhase: MockupPhase;
    sourceText: string;
    rightHeader: ReactNode;
    rightChildren: ReactNode;
    footer: ReactNode;
    rightFooterNote?: string;
}) {
    return (
        <section data-mockup={mockupId} className="mb-20 scroll-mt-6">
            <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-alloy-muted">
                    {activePhase}
                </h2>
                <span className="font-mono text-[11px] text-alloy-muted/70">Concept B+</span>
            </div>

            {/* Action Deck — workstation, not modal */}
            <div
                className="overflow-hidden rounded-2xl border border-alloy-midnight/12 bg-admin-page"
                style={{ height: "min(78vh, 720px)" }}
            >
                {/* Dark Alloy header */}
                <header className="shrink-0 bg-alloy-midnight px-5 py-3.5 text-white">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <h3 className="text-[17px] font-semibold tracking-tight">
                                Tell BOS about the family
                            </h3>
                            <p className="mt-0.5 text-[12px] text-white/55">
                                BOS reads your source material and drafts the lead — you approve every detail.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-white/50 hover:bg-white/10 hover:text-white/80"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Phase timeline — not wizard pills */}
                    <div className="mt-3 flex items-center gap-1">
                        {PHASES.map((phase, i) => {
                            const active = phase === activePhase;
                            const past = PHASES.indexOf(activePhase) > i;
                            return (
                                <div key={phase} className="flex items-center gap-1">
                                    {i > 0 ?
                                        <ChevronRight className="h-3 w-3 text-white/25" aria-hidden />
                                    :   null}
                                    <div
                                        className={
                                            active ?
                                                "flex items-center gap-1.5 rounded-full bg-alloy-gold/20 px-2.5 py-1 text-[11px] font-semibold text-alloy-gold"
                                            : past ?
                                                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-alloy-juniper/90"
                                            :   "rounded-full px-2 py-0.5 text-[11px] text-white/35"
                                        }
                                    >
                                        {past && !active ?
                                            <Check className="h-3 w-3" strokeWidth={2.5} />
                                        :   null}
                                        {phase}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </header>

                {/* Split pane body */}
                <div className="flex min-h-0 flex-1" style={{ height: "calc(100% - 108px - 52px)" }}>
                    {/* Source Material — always visible */}
                    <aside className="flex w-[38%] min-w-0 flex-col border-r-2 border-alloy-gold/40 bg-[#eceef2]">
                        <div className="flex items-center justify-between border-b border-alloy-midnight/8 bg-alloy-midnight/[0.04] px-4 py-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-alloy-muted">
                                Source Material
                            </span>
                            <span className="text-[10px] text-alloy-muted/70">Always visible</span>
                        </div>
                        <pre className="min-h-0 flex-1 overflow-hidden whitespace-pre-wrap p-4 font-sans text-[13px] leading-relaxed text-alloy-forge/90">
                            {sourceText}
                        </pre>
                        {activePhase === "Intake" ?
                            <div className="shrink-0 border-t border-alloy-midnight/8 bg-white/60 px-4 py-3">
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-gold-dark/50 bg-alloy-gold/90 px-3.5 py-2 text-[13px] font-semibold text-alloy-midnight"
                                >
                                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                                    Analyze with BOS
                                </button>
                            </div>
                        :   null}
                    </aside>

                    {/* BOS Findings */}
                    <main className="flex min-w-0 flex-1 flex-col bg-alloy-stone/50">
                        <div className="flex items-center gap-2 border-b border-alloy-gold/25 bg-gradient-to-r from-alloy-gold/12 via-white to-alloy-gold/6 px-4 py-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-alloy-gold/35 text-alloy-midnight">
                                <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">{rightHeader}</div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden p-3">{rightChildren}</div>
                        {rightFooterNote ?
                            <p className="shrink-0 border-t border-alloy-midnight/6 px-4 py-2 text-[11px] text-alloy-muted">
                                {rightFooterNote}
                            </p>
                        :   null}
                    </main>
                </div>

                {/* Footer rail */}
                <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-alloy-midnight/8 bg-white px-4 py-2.5">
                    {footer}
                </footer>
            </div>
        </section>
    );
}

export function FindingCard({ finding }: { finding: FindingGroup }) {
    const style = STATUS_STYLES[finding.status];
    const expanded = finding.expanded ?? finding.status !== "confirmed";

    return (
        <article
            className={`rounded-xl border border-l-[3px] ${style.rail} ${style.panel} px-3 py-2.5`}
            data-finding={finding.id}
        >
            <div className="flex items-start gap-2">
                {finding.status === "confirmed" ?
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-alloy-juniper" strokeWidth={2.5} />
                : finding.status === "review" ?
                    <span className="mt-0.5 text-[13px] font-bold text-amber-600">!</span>
                :   <span className="mt-0.5 text-[13px] font-bold text-red-600">?</span>
                }
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-[14px] font-semibold text-alloy-midnight">{finding.headline}</h4>
                        <span
                            className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${style.badge}`}
                        >
                            {style.badgeLabel}
                        </span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-alloy-muted">{finding.bosLine}</p>

                    {expanded ?
                        <div className="mt-2 space-y-1.5 rounded-lg border border-alloy-midnight/6 bg-white/80 px-2.5 py-2">
                            {finding.details.map((d) => (
                                <div key={d.label} className="flex gap-2 text-[12px]">
                                    <span className="w-24 shrink-0 text-alloy-muted/80">{d.label}</span>
                                    <span className="font-medium text-alloy-midnight">{d.value}</span>
                                </div>
                            ))}
                            {finding.status === "review" ?
                                <div className="mt-1 flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        className="rounded-md border border-alloy-midnight/12 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/75"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded-md border border-alloy-juniper/30 bg-alloy-juniper/10 px-2 py-0.5 text-[11px] font-medium text-alloy-juniper"
                                    >
                                        Confirm
                                    </button>
                                </div>
                            :   null}
                        </div>
                    :   <p className="mt-1 text-[11px] text-alloy-juniper">
                            {finding.details.map((d) => d.value).join(" · ")}
                        </p>
                    }
                </div>
                {finding.status !== "uncertain" ?
                    <input
                        type="checkbox"
                        defaultChecked={finding.included !== false}
                        className="mt-1 shrink-0"
                        aria-label={`Include ${finding.headline}`}
                    />
                :   null}
            </div>
        </article>
    );
}

export function FooterBtn({
    children,
    variant = "ghost",
}: {
    children: ReactNode;
    variant?: "ghost" | "gold" | "juniper" | "blue";
}) {
    const cls =
        variant === "juniper" ?
            "rounded-lg bg-alloy-juniper px-4 py-2 text-[13px] font-semibold text-white"
        : variant === "gold" ?
            "rounded-lg border border-alloy-gold-dark/45 bg-alloy-gold px-4 py-2 text-[13px] font-semibold text-alloy-midnight"
        : variant === "blue" ?
            "rounded-lg bg-alloy-blue px-4 py-2 text-[13px] font-semibold text-white"
        :   "rounded-lg px-3 py-2 text-[13px] font-semibold text-alloy-muted hover:text-alloy-midnight";
    return (
        <button type="button" className={cls}>
            {children}
        </button>
    );
}
