"use client";

import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";
import { BosNotification } from "@/app/adminV2/components/bos/identity/BosNotification";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
    BOS_SHELL_MIDNIGHT_FORGE,
    BOS_SHELL_TERRITORY_TAGLINE,
    BOS_WORKSPACE_PANEL_SHADOW,
    BOS_WORKSPACE_RADIUS,
} from "@/lib/admin/actions/bosWorkspaceShell";

export type LiveFinding = {
    id: string;
    entity: string;
    value: string;
    status: "confirmed" | "streaming" | "pending" | "review";
    detail?: string;
};

export const PROGRESSIVE_FINDINGS: LiveFinding[] = [
    {
        id: "parent",
        entity: "Parent",
        value: "Jordan Lee",
        status: "confirmed",
        detail: "From parent line in inquiry",
    },
    {
        id: "email",
        entity: "Email",
        value: "jordan@example.com",
        status: "confirmed",
        detail: "Labeled contact field",
    },
    {
        id: "phone",
        entity: "Phone",
        value: "(555) 123-4567",
        status: "confirmed",
        detail: "Explicit phone line",
    },
    {
        id: "child",
        entity: "Child",
        value: "Riley Lee",
        status: "streaming",
        detail: "Extracting program interest…",
    },
    {
        id: "program",
        entity: "Program",
        value: "Toddler Room",
        status: "pending",
    },
    {
        id: "source",
        entity: "Source",
        value: "Website inquiry",
        status: "pending",
    },
];

export const INQUIRY_SNIPPET = `Parent: Jordan Lee
Email: jordan@example.com
Phone: (555) 123-4567
Child: Riley Lee
Program: Toddler Room`;

export function OpMockupSection({
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

export function OpWorkspaceFrame({ children }: { children: ReactNode }) {
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
            <div className="relative flex h-full items-center justify-center p-4">{children}</div>
        </div>
    );
}

export function OpShell({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative flex min-h-0 w-full max-w-[1280px] flex-col overflow-hidden"
            style={{
                height: "100%",
                maxHeight: "100%",
                borderRadius: BOS_WORKSPACE_RADIUS,
                background: BOS_SHELL_MIDNIGHT_FORGE,
                ...BOS_WORKSPACE_PANEL_SHADOW,
            }}
        >
            <div className="bos-workspace-shell__atmosphere opacity-40" aria-hidden />
            <div className="bos-workspace-shell__perimeter opacity-60" aria-hidden />
            <div className="relative z-[1] flex min-h-0 flex-1 flex-col p-2.5">
                <div className="bos-workspace-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1rem] bg-white">
                    <div className="bos-workspace-shell__perimeter" aria-hidden />
                    <div className="bos-workspace-shell__atmosphere" aria-hidden />
                    <div className="relative z-[1] flex min-h-0 flex-1 flex-col">{children}</div>
                </div>
            </div>
        </div>
    );
}

export function OpTopBar() {
    return (
        <div className="flex shrink-0 items-center justify-between border-b border-alloy-stone/8 px-5 py-3">
            <BosHeader
                title="Create Lead"
                subtitle="Operational intake — BOS analyzes in place as material arrives."
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

export function OpThreeColumnWorkspace({
    intake,
    findings = PROGRESSIVE_FINDINGS,
    bosStatus = "Reading inquiry as material arrives…",
}: {
    intake: ReactNode;
    findings?: LiveFinding[];
    bosStatus?: string;
}) {
    return (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,22%)_minmax(280px,38%)_1fr]">
            <OpBosColumn status={bosStatus} />
            <div className="flex min-h-0 flex-col border-x border-alloy-stone/8 bg-[#FAFBFC]">{intake}</div>
            <OpFindingsColumn findings={findings} />
        </div>
    );
}

function OpBosColumn({ status }: { status: string }) {
    return (
        <aside className="flex min-h-0 flex-col gap-3 bg-[#F6F8FA] px-4 py-4" data-op-column="bos">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/40">
                <BosMark size="sm" />
                BOS
            </div>
            <BosNotification title="Analyzing in place" message={status} />
            <div className="space-y-2 text-[12px] leading-relaxed text-alloy-midnight/55">
                <p className="font-medium text-alloy-midnight/70">BOS will</p>
                <ul className="space-y-1.5 pl-1">
                    <li>Extract entities as you paste</li>
                    <li>Flag uncertain fields live</li>
                    <li>Keep you in control — nothing created until you confirm</li>
                </ul>
            </div>
            <div className="mt-auto space-y-2 border-t border-alloy-stone/10 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/35">
                    Actions
                </p>
                <button
                    type="button"
                    className="block w-full rounded-lg px-2 py-2 text-left text-[12px] font-medium text-alloy-midnight/55 hover:bg-white"
                >
                    Enter manually
                </button>
                <button
                    type="button"
                    className="block w-full rounded-lg px-2 py-2 text-left text-[12px] font-medium text-alloy-midnight/55 hover:bg-white"
                >
                    Clear material
                </button>
            </div>
        </aside>
    );
}

export function OpFindingsColumn({ findings }: { findings: LiveFinding[] }) {
    const confirmed = findings.filter((f) => f.status === "confirmed").length;

    return (
        <aside className="flex min-h-0 flex-col bg-white" data-op-column="findings">
            <div className="flex shrink-0 items-center justify-between border-b border-alloy-stone/8 px-4 py-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#007A63]">
                        Live findings
                    </p>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/45">
                        {confirmed} extracted · updating in place
                    </p>
                </div>
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#007A63]">
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                    Active
                </span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
                {findings.map((finding) => (
                    <OpFindingEntity key={finding.id} finding={finding} />
                ))}
            </div>
            <div className="shrink-0 border-t border-alloy-stone/8 px-4 py-2.5">
                <p className="text-[11px] text-alloy-midnight/40">
                    No separate review screen — findings stream here as BOS reads material.
                </p>
            </div>
        </aside>
    );
}

function OpFindingEntity({ finding }: { finding: LiveFinding }) {
    if (finding.status === "pending") {
        return (
            <div
                className="rounded-xl border border-dashed border-alloy-stone/15 bg-[#FAFBFC] px-3 py-2.5 opacity-50"
                data-finding={finding.id}
            >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/30">
                    {finding.entity}
                </p>
                <p className="mt-1 text-[12px] text-alloy-midnight/25">Waiting…</p>
            </div>
        );
    }

    if (finding.status === "streaming") {
        return (
            <div
                className="rounded-xl border border-[#00A283]/20 bg-[#00A283]/[0.05] px-3 py-2.5"
                data-finding={finding.id}
            >
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#007A63]">
                        {finding.entity}
                    </p>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-[#007A63]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Extracting
                    </span>
                </div>
                <p className="mt-1 text-[14px] font-semibold text-alloy-midnight">{finding.value}</p>
                {finding.detail ?
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{finding.detail}</p>
                :   null}
            </div>
        );
    }

    return (
        <div
            className="rounded-xl border border-alloy-stone/10 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(15,35,52,0.03)]"
            data-finding={finding.id}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    {finding.entity}
                </p>
                <Check className="h-3.5 w-3.5 text-[#00A283]" strokeWidth={2.5} />
            </div>
            <p className="mt-1 text-[14px] font-semibold text-alloy-midnight">{finding.value}</p>
            {finding.detail ?
                <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{finding.detail}</p>
            :   null}
        </div>
    );
}

export function OpIntakeLabel({ children }: { children: ReactNode }) {
    return (
        <p className="shrink-0 px-4 pt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/35">
            {children}
        </p>
    );
}

export function OpCompactPasteInput({ value }: { value: string }) {
    return (
        <div className="mx-4 mt-3 rounded-xl border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_2px_12px_rgba(15,35,52,0.04)]">
            <p className="text-[10px] font-medium text-alloy-midnight/35">Pasting…</p>
            <p className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap text-[13px] leading-relaxed text-alloy-midnight/80">
                {value}
            </p>
        </div>
    );
}

export { BOS_SHELL_TERRITORY_TAGLINE };
