"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { BosButton } from "@/app/adminV2/components/bos/identity/BosButton";
import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
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

export const PASTE_CHANNELS = [
    "Email",
    "Call Note",
    "Website Inquiry",
    "Enrollment Request",
] as const;

export const DOCUMENT_PLACEHOLDER = `Paste or type inquiry details here…

Parent: Jordan Lee
Email: jordan@example.com
Phone: (555) 123-4567
Child: Riley Lee
Program: Toddler Room`;

export function MockupSection({
    mockupId,
    optionLabel,
    title,
    summary,
    children,
}: {
    mockupId: string;
    optionLabel: string;
    title: string;
    summary: string;
    children: ReactNode;
}) {
    return (
        <section data-mockup={mockupId} className="mb-20 scroll-mt-8">
            <div className="mb-4 max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                    {optionLabel}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-alloy-midnight">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-alloy-midnight/60">{summary}</p>
            </div>
            {children}
        </section>
    );
}

export function WorkspaceFogFrame({ children }: { children: ReactNode }) {
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

export function WorkspaceCloseButton({ onDark = false }: { onDark?: boolean }) {
    return (
        <button
            type="button"
            className={
                onDark ?
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55"
                :   "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-alloy-stone/15 bg-alloy-stone/10 text-alloy-midnight/45"
            }
            aria-label="Close"
        >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
    );
}

export function PasteChannelChips() {
    return (
        <div className="flex flex-wrap gap-2" data-intake-paste-channels="true">
            {PASTE_CHANNELS.map((channel) => (
                <span
                    key={channel}
                    className="rounded-full border border-alloy-stone/15 bg-white px-3 py-1 text-[11px] font-medium text-alloy-midnight/55"
                >
                    {channel}
                </span>
            ))}
        </div>
    );
}

export function DocumentContentSurface({
    content = "",
    empty = true,
    minHeight = 280,
}: {
    content?: string;
    empty?: boolean;
    minHeight?: number;
}) {
    return (
        <div
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1rem] border border-alloy-stone/10 bg-[#FCFDFE]"
            style={{ minHeight }}
            data-intake-document-surface="true"
        >
            <div className="pointer-events-none absolute inset-y-0 left-14 w-px bg-alloy-stone/10" aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 top-12 h-px bg-alloy-stone/8" aria-hidden />
            <div className="min-h-0 flex-1 overflow-hidden px-8 py-6">
                {empty ?
                    <p className="whitespace-pre-wrap font-sans text-[15px] leading-[1.7] text-alloy-midnight/28">
                        {DOCUMENT_PLACEHOLDER}
                    </p>
                :   <p className="whitespace-pre-wrap font-sans text-[15px] leading-[1.7] text-alloy-midnight/88">
                        {content}
                    </p>
                }
            </div>
        </div>
    );
}

export function IntakeActionRail({
    analyzeDisabled = true,
    variant = "light",
}: {
    analyzeDisabled?: boolean;
    variant?: "light" | "forge" | "document";
}) {
    const railClass =
        variant === "forge" ?
            "border-t border-white/10 bg-[#1e3344]/95"
        : variant === "document" ?
            "border-t border-alloy-stone/10 bg-[#F8FAFB]"
        :   "border-t border-alloy-stone/10 bg-white";

    return (
        <div
            className={`flex shrink-0 items-center justify-between gap-4 px-6 py-3.5 ${railClass}`}
            data-intake-action-rail="true"
        >
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-alloy-midnight/45"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-[13px] font-medium text-alloy-midnight/55"
                >
                    Enter manually
                </button>
            </div>
            <BosButton
                variant="primary"
                size="md"
                label="Analyze with BOS"
                disabled={analyzeDisabled}
                data-testid="intake-mockup-analyze-button"
            />
        </div>
    );
}

export function ForgeCarvedPanel({ children }: { children: ReactNode }) {
    return (
        <div
            className="bos-workspace-shell relative flex min-h-0 w-full max-w-[1120px] flex-col overflow-hidden"
            style={{
                height: "100%",
                maxHeight: "100%",
                borderRadius: BOS_WORKSPACE_RADIUS,
                background: BOS_SHELL_MIDNIGHT_FORGE,
                ...BOS_WORKSPACE_PANEL_SHADOW,
            }}
            data-intake-forge-shell="true"
        >
            <div className="bos-workspace-shell__atmosphere opacity-40" aria-hidden />
            <div className="bos-workspace-shell__perimeter opacity-60" aria-hidden />
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col p-3">{children}</div>
        </div>
    );
}

export function IntakeWorkspaceHeader({
    title = "Tell BOS about the family",
    subtitle = BOS_SHELL_TERRITORY_TAGLINE,
    onDark = false,
    showStepRail = true,
}: {
    title?: string;
    subtitle?: string;
    onDark?: boolean;
    showStepRail?: boolean;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
                <BosHeader title={title} subtitle={subtitle} size="lg" onDark={onDark} />
                {showStepRail ?
                    <div className="mt-3.5">
                        <ActionWorkspaceStepRail activeStep="gather" onDark={onDark} />
                    </div>
                :   null}
            </div>
            <WorkspaceCloseButton onDark={onDark} />
        </div>
    );
}
