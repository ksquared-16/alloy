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
} from "@/lib/admin/actions/bosWorkspaceShell";

import {
    INQUIRY_SNIPPET,
    PROGRESSIVE_FINDINGS,
    type LiveFinding,
} from "../operational-intake-workspace/OperationalIntakeShared";

export function WsMockupSection({
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
        <section data-mockup={mockupId} className="mb-24 scroll-mt-8">
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

export function WsViewport({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative overflow-hidden rounded-[1.75rem] border border-alloy-midnight/10"
            style={{ height: "min(80vh, 720px)" }}
        >
            <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
            <div
                className="pointer-events-none absolute inset-0 scale-105"
                style={BOS_AMBIENT_GLOW_STYLE}
                aria-hidden
            />
            <div className="relative flex h-full items-center justify-center p-6">{children}</div>
        </div>
    );
}

/** Single BOS lockup — workstation title band only. */
export function WsTitleBand({ compact = false }: { compact?: boolean }) {
    if (compact) {
        return (
            <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/45">
                    Create Lead · Intake Machine
                </p>
                <span className="text-alloy-midnight/30">×</span>
            </div>
        );
    }
    return (
        <div className="mb-3 flex items-center justify-between gap-4">
            <BosHeader title="Create Lead" subtitle={BOS_SHELL_TERRITORY_TAGLINE} size="sm" />
            <span className="rounded-full border border-[#00A283]/20 bg-[#00A283]/[0.08] px-2.5 py-1 text-[10px] font-semibold text-[#007A63]">
                Live
            </span>
        </div>
    );
}

export function WsMaterialStack({ className = "" }: { className?: string }) {
    return (
        <div className={className} data-workstation-zone="material">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#007A63]">
                Material · center of gravity
            </p>
            <div className="space-y-2">
                <div className="rounded-xl border border-alloy-stone/12 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-alloy-midnight/40" />
                        <span className="text-[12px] font-semibold text-alloy-midnight">
                            Website form email
                        </span>
                        <span className="ml-auto text-[10px] text-[#007A63]">Read</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-[11px] text-alloy-midnight/50">
                        Jordan Lee · toddler room inquiry…
                    </p>
                </div>
                <div className="rounded-xl border border-[#00A283]/22 bg-[#00A283]/[0.05] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-[#007A63]" />
                        <span className="text-[12px] font-semibold text-alloy-midnight">
                            Pasted inquiry
                        </span>
                        <span className="ml-auto text-[10px] text-[#007A63]">Reading…</span>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[11px] text-alloy-midnight/60">
                        {INQUIRY_SNIPPET.slice(0, 100)}…
                    </p>
                </div>
                <button
                    type="button"
                    className="w-full rounded-lg border border-dashed border-alloy-stone/15 py-2 text-[11px] font-medium text-alloy-midnight/38"
                >
                    + Add material
                </button>
            </div>
        </div>
    );
}

export function WsBosPeripheral({ style }: { style?: CSSProperties }) {
    return (
        <aside
            className="flex flex-col gap-2 text-[11px] leading-relaxed text-alloy-midnight/55"
            style={style}
            data-workstation-zone="bos"
        >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/35">
                BOS · peripheral
            </p>
            <p className="font-medium text-alloy-midnight/70">Analyzing as material docks…</p>
            <ul className="space-y-1">
                <li>Extract on arrival</li>
                <li>Flag uncertainty live</li>
            </ul>
            <div className="mt-auto space-y-1 pt-2 text-[10px]">
                <button type="button" className="block text-alloy-midnight/45">
                    Enter manually
                </button>
                <button type="button" className="block text-alloy-midnight/45">
                    Clear
                </button>
            </div>
        </aside>
    );
}

export function WsFindingsOrbit({
    findings = PROGRESSIVE_FINDINGS.slice(0, 4),
    compact = false,
    style,
}: {
    findings?: LiveFinding[];
    compact?: boolean;
    style?: CSSProperties;
}) {
    return (
        <div style={style} data-workstation-zone="findings">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#007A63]">
                Findings · {compact ? "emerging" : "supporting orbit"}
            </p>
            <div className={`space-y-1.5 ${compact ? "" : "max-h-[220px] overflow-hidden"}`}>
                {findings.map((f) => (
                    <div
                        key={f.id}
                        className={
                            f.status === "streaming" ?
                                "rounded-lg border border-[#00A283]/20 bg-[#00A283]/[0.06] px-2.5 py-1.5"
                            : f.status === "pending" ?
                                "rounded-lg border border-dashed border-alloy-stone/12 px-2.5 py-1.5 opacity-40"
                            :   "rounded-lg border border-alloy-stone/10 bg-white px-2.5 py-1.5"
                        }
                    >
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                {f.entity}
                            </span>
                            {f.status === "streaming" ?
                                <span className="text-[9px] text-[#007A63]">…</span>
                            : f.status === "confirmed" ?
                                <span className="text-[9px] text-[#007A63]">✓</span>
                            :   null}
                        </div>
                        <p className="text-[12px] font-semibold text-alloy-midnight">
                            {f.value || "—"}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function WsConduit({ vertical = true }: { vertical?: boolean }) {
    return (
        <div
            className={
                vertical ?
                    "mx-auto h-6 w-px bg-gradient-to-b from-[#00A283]/40 to-[#00A283]/10"
                :   "my-auto h-px flex-1 bg-gradient-to-r from-[#00A283]/10 via-[#00A283]/35 to-[#00A283]/10"
            }
            aria-hidden
        />
    );
}

export const FORGE_PANEL: CSSProperties = {
    background: BOS_SHELL_MIDNIGHT_FORGE,
    boxShadow: "0 24px 64px rgba(15,35,52,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
};

export const MATERIAL_PANEL: CSSProperties = {
    background: "#FFFFFF",
    boxShadow: "0 8px 32px rgba(15,35,52,0.08), inset 0 0 0 1px rgba(0,162,131,0.1)",
};

export const FINDINGS_PANEL: CSSProperties = {
    background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
};

export const BOS_PANEL: CSSProperties = {
    background: "linear-gradient(135deg, #EEF2F6 0%, #F6F8FA 100%)",
};
