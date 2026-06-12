"use client";

import { FileText, Globe, Inbox, Mail, MessageSquare, Paperclip, Upload } from "lucide-react";

import {
    INQUIRY_SNIPPET,
    OpCompactPasteInput,
    OpIntakeLabel,
    OpMockupSection,
    OpShell,
    OpThreeColumnWorkspace,
    OpTopBar,
    OpWorkspaceFrame,
} from "./OperationalIntakeShared";

/**
 * Operational Intake Workspace — three-column exploration.
 * BOS guidance · intake surface · live findings. Mockups only.
 */
export default function OperationalIntakeWorkspaceGallery() {
    return (
        <div className="min-h-screen bg-[#dfe2e8] px-6 py-8 text-alloy-midnight">
            <div className="mx-auto max-w-[1480px]">
                <header className="mb-10 border-b border-alloy-midnight/10 pb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                        Exploration · mockups only · not production
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold text-alloy-midnight">
                        Operational Intake Workspace
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm text-alloy-muted">
                        Three-column operational layout: BOS guidance · intake surface · live findings.
                        Analysis happens in-place — no Analyze button, no wizard, no review screen after
                        intake. No giant textarea or document canvas.
                    </p>
                    <p className="mt-2 font-mono text-xs text-alloy-muted/60">/dev/operational-intake-workspace</p>
                </header>

                {/* 1 — Floating intake card */}
                <OpMockupSection
                    mockupId="floating-intake-card"
                    label="Mockup 1"
                    title="Floating intake card"
                    summary="Compact card accepts paste, type, or upload. Material stays contained — findings stream in column 3 as BOS reads."
                >
                    <OpWorkspaceFrame>
                        <OpShell>
                            <OpTopBar />
                            <OpThreeColumnWorkspace
                                intake={
                                    <>
                                        <OpIntakeLabel>Intake surface</OpIntakeLabel>
                                        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-6 pt-2">
                                            <div className="w-full max-w-sm rounded-2xl border border-alloy-stone/12 bg-white p-4 shadow-[0_8px_32px_rgba(15,35,52,0.08)]">
                                                <p className="text-[13px] font-semibold text-alloy-midnight">
                                                    Add inquiry material
                                                </p>
                                                <p className="mt-1 text-[12px] text-alloy-midnight/45">
                                                    Paste, type a line, or drop a file — BOS analyzes immediately.
                                                </p>
                                                <div className="mt-3 flex items-center gap-2 rounded-xl border border-alloy-stone/15 bg-[#FAFBFC] px-3 py-2.5">
                                                    <MessageSquare className="h-4 w-4 shrink-0 text-alloy-midnight/30" />
                                                    <span className="text-[13px] text-alloy-midnight/35">
                                                        Type or paste here…
                                                    </span>
                                                </div>
                                                <OpCompactPasteInput value={INQUIRY_SNIPPET.slice(0, 120) + "…"} />
                                                <div className="mt-3 flex gap-2">
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-stone/12 px-2.5 py-1.5 text-[11px] font-medium text-alloy-midnight/55"
                                                    >
                                                        <Paperclip className="h-3.5 w-3.5" />
                                                        Upload
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-stone/12 px-2.5 py-1.5 text-[11px] font-medium text-alloy-midnight/55"
                                                    >
                                                        <Mail className="h-3.5 w-3.5" />
                                                        Drop email
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                }
                            />
                        </OpShell>
                    </OpWorkspaceFrame>
                </OpMockupSection>

                {/* 2 — Drop zone */}
                <OpMockupSection
                    mockupId="drop-zone-intake"
                    label="Mockup 2"
                    title="Drop zone intake"
                    summary="Center column is a calm drop target. Pasted content appears as a compact snippet — not a full-height field. Findings populate live on the right."
                >
                    <OpWorkspaceFrame>
                        <OpShell>
                            <OpTopBar />
                            <OpThreeColumnWorkspace
                                bosStatus="Processing dropped material — extracting entities…"
                                intake={
                                    <>
                                        <OpIntakeLabel>Drop zone</OpIntakeLabel>
                                        <div className="flex min-h-0 flex-1 flex-col px-4 pb-5 pt-2">
                                            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-alloy-stone/18 bg-white/80 px-6 py-8">
                                                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-[#00A283]/25 bg-[#00A283]/[0.04]">
                                                    <Upload className="h-6 w-6 text-[#007A63]/60" strokeWidth={1.75} />
                                                </div>
                                                <p className="mt-4 text-[14px] font-medium text-alloy-midnight/65">
                                                    Drop email or note
                                                </p>
                                                <p className="mt-1 text-[12px] text-alloy-midnight/40">
                                                    or paste below — analysis starts automatically
                                                </p>
                                            </div>
                                            <div className="mt-3 rounded-xl border border-[#00A283]/15 bg-[#00A283]/[0.04] px-3 py-2.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#007A63]">
                                                    Received
                                                </p>
                                                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-alloy-midnight/70">
                                                    {INQUIRY_SNIPPET}
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                }
                            />
                        </OpShell>
                    </OpWorkspaceFrame>
                </OpMockupSection>

                {/* 3 — Stacked material cards */}
                <OpMockupSection
                    mockupId="stacked-material-cards"
                    label="Mockup 3"
                    title="Stacked material cards"
                    summary="Each piece of material is a card — email thread, call note, pasted text. BOS reads the stack and findings update per card. No monolithic input."
                >
                    <OpWorkspaceFrame>
                        <OpShell>
                            <OpTopBar />
                            <OpThreeColumnWorkspace
                                bosStatus="Reading material stack — 2 of 3 sources processed…"
                                intake={
                                    <>
                                        <OpIntakeLabel>Material stack</OpIntakeLabel>
                                        <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-4 py-3">
                                            <div className="rounded-xl border border-alloy-stone/12 bg-white px-3 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="h-3.5 w-3.5 text-alloy-midnight/40" />
                                                    <span className="text-[12px] font-semibold text-alloy-midnight">
                                                        Website form email
                                                    </span>
                                                    <span className="ml-auto text-[10px] text-[#007A63]">Read</span>
                                                </div>
                                                <p className="mt-1.5 line-clamp-2 text-[12px] text-alloy-midnight/55">
                                                    Jordan Lee inquired about toddler room availability…
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-[#00A283]/20 bg-[#00A283]/[0.04] px-3 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <MessageSquare className="h-3.5 w-3.5 text-[#007A63]" />
                                                    <span className="text-[12px] font-semibold text-alloy-midnight">
                                                        Pasted inquiry
                                                    </span>
                                                    <span className="ml-auto flex items-center gap-1 text-[10px] text-[#007A63]">
                                                        Reading…
                                                    </span>
                                                </div>
                                                <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12px] text-alloy-midnight/65">
                                                    {INQUIRY_SNIPPET}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-alloy-stone/15 py-3 text-[12px] font-medium text-alloy-midnight/40"
                                            >
                                                + Add material
                                            </button>
                                        </div>
                                    </>
                                }
                            />
                        </OpShell>
                    </OpWorkspaceFrame>
                </OpMockupSection>

                {/* 4 — Inbox / command-center */}
                <OpMockupSection
                    mockupId="inbox-command-center"
                    label="Mockup 4"
                    title="Inbox + command-center intake"
                    summary="Source list above, command-style input below. Feels like operational software — material arrives, BOS processes, findings stream live."
                >
                    <OpWorkspaceFrame>
                        <OpShell>
                            <OpTopBar />
                            <OpThreeColumnWorkspace
                                intake={
                                    <>
                                        <OpIntakeLabel>Inbox · command center</OpIntakeLabel>
                                        <div className="flex min-h-0 flex-1 flex-col">
                                            <div className="min-h-0 flex-1 space-y-1.5 overflow-hidden px-4 py-3">
                                                <div className="flex items-center gap-2 rounded-lg border border-[#00A283]/20 bg-[#00A283]/[0.06] px-3 py-2">
                                                    <Inbox className="h-3.5 w-3.5 text-[#007A63]" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[13px] font-semibold text-alloy-midnight">
                                                            Jordan Lee · Website Inquiry
                                                        </p>
                                                        <p className="text-[11px] text-alloy-midnight/45">
                                                            Received today · analyzing
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="rounded-lg border border-alloy-stone/10 bg-white px-3 py-2 opacity-60">
                                                    <p className="text-[12px] font-medium text-alloy-midnight/50">
                                                        No other sources
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 border-t border-alloy-stone/10 bg-white px-4 py-3">
                                                <div className="flex items-center gap-2 rounded-xl border border-alloy-stone/12 bg-[#FAFBFC] px-3 py-2.5">
                                                    <Globe className="h-4 w-4 shrink-0 text-alloy-midnight/30" />
                                                    <span className="flex-1 text-[13px] text-alloy-midnight/80">
                                                        Parent: Jordan Lee, Email: jordan@…
                                                    </span>
                                                    <span className="text-[10px] font-medium text-[#007A63]">↵</span>
                                                </div>
                                                <div className="mt-2 flex gap-2">
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-alloy-midnight/45"
                                                    >
                                                        <Mail className="h-3 w-3" /> Email
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-alloy-midnight/45"
                                                    >
                                                        <FileText className="h-3 w-3" /> Note
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-alloy-midnight/45"
                                                    >
                                                        <Upload className="h-3 w-3" /> Upload
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                }
                            />
                        </OpShell>
                    </OpWorkspaceFrame>
                </OpMockupSection>

                <footer className="rounded-xl border border-alloy-midnight/10 bg-white/70 px-5 py-4 text-sm text-alloy-midnight/65">
                    <p className="font-semibold text-alloy-midnight">Rejected patterns</p>
                    <p className="mt-1">
                        Giant textarea · giant document · wizard steps · Analyze-then-review screen ·
                        document-form layouts.
                    </p>
                </footer>
            </div>
        </div>
    );
}
