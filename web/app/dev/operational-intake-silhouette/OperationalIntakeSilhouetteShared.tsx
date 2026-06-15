"use client";

import { Mail, MessageSquare } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
    BOS_SHELL_MIDNIGHT_FORGE,
    BOS_SHELL_TERRITORY_TAGLINE,
    BOS_WORKSPACE_PANEL_SHADOW,
    BOS_WORKSPACE_RADIUS,
} from "@/lib/admin/actions/bosWorkspaceShell";

import {
    INQUIRY_SNIPPET,
    OpFindingsColumn,
    OpIntakeLabel,
    PROGRESSIVE_FINDINGS,
    type LiveFinding,
} from "../operational-intake-workspace/OperationalIntakeShared";

export function SilMockupSection({
    mockupId,
    label,
    title,
    summary,
    children,
}: {
    mockupId: string;
    label: string;
    title: string;
    summary: string;
    children: ReactNode;
}) {
    return (
        <section data-mockup={mockupId} className="mb-20 scroll-mt-8">
            <div className="mb-4 max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                    {label}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-alloy-midnight">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-alloy-midnight/60">{summary}</p>
            </div>
            {children}
        </section>
    );
}

export function SilViewportFrame({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative overflow-hidden rounded-[1.75rem] border border-alloy-midnight/10"
            style={{ height: "min(78vh, 680px)" }}
        >
            <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
            <div
                className="pointer-events-none absolute inset-0 scale-105"
                style={BOS_AMBIENT_GLOW_STYLE}
                aria-hidden
            />
            <div className="relative flex h-full items-center justify-center p-5">{children}</div>
        </div>
    );
}

/** Single primary BOS lockup — only logo placement in silhouette mockups. */
export function SilWorkspaceHeader() {
    return (
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
            <BosHeader
                title="Create Lead"
                subtitle={BOS_SHELL_TERRITORY_TAGLINE}
                size="sm"
            />
            <div className="flex items-center gap-2">
                <span className="rounded-full border border-[#00A283]/20 bg-[#00A283]/[0.08] px-2.5 py-1 text-[10px] font-semibold text-[#007A63]">
                    Live analysis
                </span>
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-alloy-stone/15 text-alloy-midnight/35">
                    ×
                </div>
            </div>
        </div>
    );
}

/** Fixed Mockup 3 material stack — content frozen; silhouette varies around it. */
export function SilMaterialStackColumn() {
    return (
        <div className="flex min-h-0 flex-col bg-[#FAFBFC]">
            <OpIntakeLabel>Material stack</OpIntakeLabel>
            <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-4 py-3">
                <div className="rounded-xl border border-alloy-stone/12 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(15,35,52,0.03)]">
                    <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-alloy-midnight/40" />
                        <span className="text-[12px] font-semibold text-alloy-midnight">
                            Website form email
                        </span>
                        <span className="ml-auto text-[10px] font-medium text-[#007A63]">Read</span>
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
                        <span className="ml-auto text-[10px] font-medium text-[#007A63]">Reading…</span>
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
        </div>
    );
}

/** BOS column — text only; no mark (single lockup lives in header). */
export function SilBosColumn() {
    return (
        <aside
            className="flex min-h-0 flex-col gap-3 bg-[#F6F8FA] px-4 py-4"
            data-op-column="bos"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/40">
                BOS
            </p>
            <div className="rounded-xl border border-[#00A283]/12 bg-[#00A283]/[0.04] px-3 py-2.5">
                <p className="text-[12px] font-semibold text-alloy-midnight">Analyzing in place</p>
                <p className="mt-1 text-[11px] leading-relaxed text-alloy-midnight/55">
                    Reading material stack — 2 of 3 sources processed…
                </p>
            </div>
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-alloy-midnight/55">
                <li>Extract entities as material arrives</li>
                <li>Flag uncertain fields live</li>
                <li>Nothing created until you confirm</li>
            </ul>
            <div className="mt-auto space-y-1 border-t border-alloy-stone/10 pt-3">
                <button
                    type="button"
                    className="block w-full rounded-lg px-2 py-2 text-left text-[12px] font-medium text-alloy-midnight/55"
                >
                    Enter manually
                </button>
                <button
                    type="button"
                    className="block w-full rounded-lg px-2 py-2 text-left text-[12px] font-medium text-alloy-midnight/55"
                >
                    Clear material
                </button>
            </div>
        </aside>
    );
}

export function SilThreeColumns({
    material,
    findings = PROGRESSIVE_FINDINGS,
    className = "",
}: {
    material: ReactNode;
    findings?: LiveFinding[];
    className?: string;
}) {
    return (
        <div
            className={`grid min-h-0 flex-1 grid-cols-[minmax(188px,21%)_minmax(260px,36%)_1fr] ${className}`.trim()}
        >
            <SilBosColumn />
            <div className="min-h-0 border-x border-alloy-stone/8">{material}</div>
            <OpFindingsColumn findings={findings} />
        </div>
    );
}

export function SilThreeColumnsDefault() {
    return <SilThreeColumns material={<SilMaterialStackColumn />} />;
}

/** 1 · Carved — forge frame, white workspace recessed inward. */
export function SilCarvedShell({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative flex min-h-0 w-full max-w-[1240px] flex-col overflow-hidden p-[14px]"
            style={{
                height: "100%",
                maxHeight: "100%",
                borderRadius: 28,
                background: BOS_SHELL_MIDNIGHT_FORGE,
                boxShadow: [
                    "0 0 0 1px rgba(255,255,255,0.06) inset",
                    "0 24px 64px rgba(15,35,52,0.28)",
                    BOS_WORKSPACE_PANEL_SHADOW.boxShadow,
                ].join(", "),
            }}
            data-silhouette="carved"
        >
            <div className="bos-workspace-shell__perimeter opacity-70" aria-hidden />
            <div
                className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
                style={{
                    borderRadius: 18,
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.92), 0 0 0 1px rgba(0,162,131,0.08)",
                }}
            >
                <div className="bos-workspace-shell__atmosphere" aria-hidden />
                {children}
            </div>
        </div>
    );
}

/** 2 · Command well — recessed circular well, columns sink into depth. */
export function SilCommandWellShell({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative flex min-h-0 w-full max-w-[1180px] flex-col overflow-hidden"
            style={{
                height: "100%",
                maxHeight: "100%",
                borderRadius: "999px 999px 32px 32px",
                background: "linear-gradient(180deg, #1a2d3d 0%, #273F52 42%, #1e3344 100%)",
                boxShadow: [
                    "0 0 0 1px rgba(255,255,255,0.05)",
                    "0 32px 80px rgba(15,35,52,0.35)",
                    "inset 0 2px 0 rgba(255,255,255,0.06)",
                    "inset 0 -24px 48px rgba(0,0,0,0.22)",
                ].join(", "),
            }}
            data-silhouette="command-well"
        >
            <div
                className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-b-[50%] opacity-40"
                style={{
                    background:
                        "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0,162,131,0.18), transparent 70%)",
                }}
                aria-hidden
            />
            <div
                className="relative mx-3 mb-3 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F8FAFC]"
                style={{
                    borderRadius: "999px 999px 20px 20px",
                    boxShadow: "inset 0 8px 32px rgba(15,35,52,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
                }}
            >
                {children}
            </div>
        </div>
    );
}

/** 3 · Floating stack — material column elevated; BOS/findings in lower tray. */
export function SilFloatingStackShell({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative flex min-h-0 w-full max-w-[1240px] flex-col"
            style={{ height: "100%", maxHeight: "100%" }}
            data-silhouette="floating-stack"
        >
            <div
                className="pointer-events-none absolute inset-x-[18%] top-[8%] z-20 h-[58%] rounded-[1.75rem] border border-alloy-stone/10 bg-white/95 shadow-[0_20px_60px_rgba(15,35,52,0.16),0_0_0_1px_rgba(255,255,255,0.8)]"
                aria-hidden
            />
            <div
                className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.35rem] border border-alloy-stone/12 bg-[#EEF1F5]"
                style={{
                    marginTop: "12%",
                    boxShadow: "0 12px 40px rgba(15,35,52,0.1)",
                }}
            >
                {children}
            </div>
        </div>
    );
}

export function SilFloatingStackLayout() {
    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <SilWorkspaceHeader />
            <div className="relative min-h-0 flex-1">
                <div className="absolute inset-x-[16%] top-2 z-30 max-h-[52%] overflow-hidden rounded-[1.5rem] border border-alloy-stone/12 bg-white shadow-[0_16px_48px_rgba(15,35,52,0.14)]">
                    <SilMaterialStackColumn />
                </div>
                <div className="grid h-full min-h-0 grid-cols-[minmax(188px,24%)_1fr] pt-[46%]">
                    <SilBosColumn />
                    <OpFindingsColumn findings={PROGRESSIVE_FINDINGS} />
                </div>
            </div>
        </div>
    );
}

/** 4 · Cloud perimeter — soft asymmetric organic shell. */
export function SilCloudPerimeterShell({ children }: { children: ReactNode }) {
    const shellStyle: CSSProperties = {
        height: "100%",
        maxHeight: "100%",
        borderRadius: "2.5rem 1.25rem 2rem 1.75rem",
        background: "#FFFFFF",
        boxShadow: [
            "0 0 0 1px rgba(0,162,131,0.08)",
            "0 24px 56px rgba(39,63,82,0.12)",
            "0 8px 24px rgba(0,162,131,0.06)",
        ].join(", "),
    };

    return (
        <div
            className="bos-workspace-shell relative flex min-h-0 w-full max-w-[1240px] flex-col overflow-hidden"
            style={shellStyle}
            data-silhouette="cloud-perimeter"
        >
            <div
                className="bos-workspace-shell__perimeter"
                style={{ opacity: 1, borderRadius: "inherit" }}
                aria-hidden
            />
            <div
                className="bos-workspace-shell__atmosphere"
                style={{ borderRadius: "inherit" }}
                aria-hidden
            />
            <div
                className="pointer-events-none absolute -left-8 top-1/4 h-32 w-32 rounded-full opacity-50 blur-2xl"
                style={{ background: "rgba(0,162,131,0.12)" }}
                aria-hidden
            />
            <div
                className="pointer-events-none absolute -right-6 bottom-1/4 h-28 w-28 rounded-full opacity-40 blur-2xl"
                style={{ background: "rgba(39,63,82,0.08)" }}
                aria-hidden
            />
            <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] border border-[#00A283]/10"
                style={{
                    maskImage:
                        "radial-gradient(ellipse 90% 70% at 50% 50%, black 55%, transparent 100%)",
                    WebkitMaskImage:
                        "radial-gradient(ellipse 90% 70% at 50% 50%, black 55%, transparent 100%)",
                }}
                aria-hidden
            />
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
    );
}

export { BOS_WORKSPACE_RADIUS };
