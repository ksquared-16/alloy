"use client";

import { FileText, Globe, Inbox, Mail, MessageSquare, Phone, Plus } from "lucide-react";
import type { LucideIcon, ReactNode } from "react";

import { BosButton } from "@/app/adminV2/components/bos/identity/BosButton";
import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import { ActionWorkspaceStepRail } from "@/components/admin/actions/ActionWorkspaceStepRail";
import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
    BOS_SHELL_MIDNIGHT_FORGE,
    BOS_SHELL_TERRITORY_TAGLINE,
    BOS_WORKSPACE_PANEL_SHADOW,
    BOS_WORKSPACE_RADIUS,
} from "@/lib/admin/actions/bosWorkspaceShell";

export function V3MockupSection({
    mockupId,
    conceptLabel,
    title,
    summary,
    children,
}: {
    mockupId: string;
    conceptLabel: string;
    title: string;
    summary: string;
    children: ReactNode;
}) {
    return (
        <section data-mockup={mockupId} className="mb-20 scroll-mt-8">
            <div className="mb-4 max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                    {conceptLabel}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-alloy-midnight">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-alloy-midnight/60">{summary}</p>
            </div>
            {children}
        </section>
    );
}

export function V3WorkspaceFrame({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative overflow-hidden rounded-[1.75rem] border border-alloy-midnight/10"
            style={{ height: "min(72vh, 620px)" }}
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

export function V3BosShell({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative flex min-h-0 w-full max-w-[1040px] flex-col overflow-hidden"
            style={{
                height: "100%",
                maxHeight: "100%",
                borderRadius: BOS_WORKSPACE_RADIUS,
                background: BOS_SHELL_MIDNIGHT_FORGE,
                ...BOS_WORKSPACE_PANEL_SHADOW,
            }}
            data-v3-bos-shell="true"
        >
            <div className="bos-workspace-shell__atmosphere opacity-40" aria-hidden />
            <div className="bos-workspace-shell__perimeter opacity-60" aria-hidden />
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col p-3">
                <div className="bos-workspace-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.05rem] bg-white">
                    <div className="bos-workspace-shell__perimeter" aria-hidden />
                    <div className="bos-workspace-shell__atmosphere" aria-hidden />
                    <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
                </div>
            </div>
        </div>
    );
}

export function V3ShellChrome({
    title = "Tell BOS about the family",
    subtitle = BOS_SHELL_TERRITORY_TAGLINE,
    showStepRail = true,
}: {
    title?: string;
    subtitle?: string;
    showStepRail?: boolean;
}) {
    return (
        <div className="shrink-0 border-b border-alloy-stone/8 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <BosHeader title={title} subtitle={subtitle} size="md" />
                    {showStepRail ?
                        <div className="mt-3">
                            <ActionWorkspaceStepRail activeStep="gather" />
                        </div>
                    :   null}
                </div>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-alloy-stone/15 text-alloy-midnight/35">
                    ×
                </div>
            </div>
        </div>
    );
}

export function V3ActionRow({
    icon: Icon,
    label,
    hint,
    accent = false,
}: {
    icon: LucideIcon;
    label: string;
    hint?: string;
    accent?: boolean;
}) {
    return (
        <button
            type="button"
            className={
                accent ?
                    "flex w-full items-center gap-3 rounded-xl border border-[#00A283]/20 bg-[#00A283]/[0.05] px-4 py-3 text-left transition-colors hover:bg-[#00A283]/[0.08]"
                :   "flex w-full items-center gap-3 rounded-xl border border-alloy-stone/10 bg-white px-4 py-3 text-left transition-colors hover:border-alloy-stone/20 hover:bg-[#FAFBFC]"
            }
        >
            <span
                className={
                    accent ?
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#00A283]/12 text-[#007A63]"
                    :   "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloy-stone/10 text-alloy-midnight/45"
                }
            >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-alloy-midnight">{label}</span>
                {hint ?
                    <span className="mt-0.5 block text-[12px] text-alloy-midnight/45">{hint}</span>
                :   null}
            </span>
            <Plus className="h-4 w-4 shrink-0 text-alloy-midnight/25" strokeWidth={1.75} />
        </button>
    );
}

export function V3ChannelCard({
    icon: Icon,
    label,
    selected = false,
}: {
    icon: LucideIcon;
    label: string;
    selected?: boolean;
}) {
    return (
        <button
            type="button"
            className={
                selected ?
                    "flex flex-col items-start gap-3 rounded-2xl border border-[#00A283]/25 bg-[#00A283]/[0.06] px-4 py-4 text-left shadow-[0_0_0_1px_rgba(0,162,131,0.08)]"
                :   "flex flex-col items-start gap-3 rounded-2xl border border-alloy-stone/12 bg-white px-4 py-4 text-left hover:border-alloy-stone/20 hover:bg-[#FAFBFC]"
            }
        >
            <span
                className={
                    selected ?
                        "flex h-10 w-10 items-center justify-center rounded-xl bg-[#00A283]/14 text-[#007A63]"
                    :   "flex h-10 w-10 items-center justify-center rounded-xl bg-alloy-stone/10 text-alloy-midnight/45"
                }
            >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="text-[14px] font-semibold text-alloy-midnight">{label}</span>
        </button>
    );
}

export function V3EmptyNote({ children }: { children: ReactNode }) {
    return (
        <p className="text-center text-[13px] text-alloy-midnight/38">{children}</p>
    );
}

export function V3Divider() {
    return <div className="h-px w-full bg-alloy-stone/12" aria-hidden />;
}

export { BosButton, BosMark, Inbox, Mail, MessageSquare, Phone, Globe, FileText };
