"use client";

import { Check, Loader2, Mail, MessageSquare } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosNotification } from "@/app/adminV2/components/bos/identity/BosNotification";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
    BOS_SHELL_TERRITORY_TAGLINE,
} from "@/lib/admin/actions/bosWorkspaceShell";

export type LiveFinding = {
    id: string;
    entity: string;
    value: string;
    status: "confirmed" | "streaming" | "pending" | "review";
    detail?: string;
};

export const PROGRESSIVE_FINDINGS: LiveFinding[] = [
    { id: "parent", entity: "Parent", value: "Jordan Lee", status: "confirmed", detail: "From parent line" },
    { id: "email", entity: "Email", value: "jordan@example.com", status: "confirmed", detail: "Labeled contact" },
    { id: "phone", entity: "Phone", value: "(555) 123-4567", status: "confirmed", detail: "Explicit phone" },
    { id: "child", entity: "Child", value: "Riley Lee", status: "streaming", detail: "Extracting program…" },
    { id: "program", entity: "Program", value: "Toddler Room", status: "pending" },
    { id: "source", entity: "Source", value: "Website inquiry", status: "pending" },
];

export const INQUIRY_SNIPPET = `Parent: Jordan Lee
Email: jordan@example.com
Phone: (555) 123-4567
Child: Riley Lee
Program: Toddler Room`;

/** Frozen baseline — stacked material (Mockup 3). */
export function BaselineMaterialStack() {
    return (
        <div className="flex min-h-0 flex-col bg-[#FAFBFC]">
            <p className="shrink-0 px-4 pt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/35">
                Material stack
            </p>
            <div className="min-h-0 flex-1 space-y-2 overflow-hidden px-4 py-3">
                <div className="rounded-xl border border-alloy-stone/12 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-alloy-midnight/40" />
                        <span className="text-[12px] font-semibold text-alloy-midnight">Website form email</span>
                        <span className="ml-auto text-[10px] text-[#007A63]">Read</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] text-alloy-midnight/55">
                        Jordan Lee inquired about toddler room availability…
                    </p>
                </div>
                <div className="rounded-xl border border-[#00A283]/20 bg-[#00A283]/[0.04] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-[#007A63]" />
                        <span className="text-[12px] font-semibold text-alloy-midnight">Pasted inquiry</span>
                        <span className="ml-auto text-[10px] text-[#007A63]">Reading…</span>
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

function BosColumn() {
    return (
        <aside className="flex min-h-0 flex-col gap-3 bg-[#F6F8FA] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-alloy-midnight/40">BOS</p>
            <BosNotification
                title="Analyzing in place"
                message="Reading material stack — 2 of 3 sources processed…"
            />
            <ul className="space-y-1.5 text-[12px] leading-relaxed text-alloy-midnight/55">
                <li>Extract entities as material arrives</li>
                <li>Flag uncertain fields live</li>
                <li>Nothing created until you confirm</li>
            </ul>
            <div className="mt-auto space-y-1 border-t border-alloy-stone/10 pt-3 text-[12px] text-alloy-midnight/55">
                <button type="button" className="block w-full rounded-lg px-2 py-2 text-left">
                    Enter manually
                </button>
                <button type="button" className="block w-full rounded-lg px-2 py-2 text-left">
                    Clear material
                </button>
            </div>
        </aside>
    );
}

function FindingsColumn({ findings = PROGRESSIVE_FINDINGS }: { findings?: LiveFinding[] }) {
    const confirmed = findings.filter((f) => f.status === "confirmed").length;
    return (
        <aside className="flex min-h-0 flex-col bg-white">
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
                {findings.map((f) => (
                    <FindingRow key={f.id} finding={f} />
                ))}
            </div>
        </aside>
    );
}

function FindingRow({ finding }: { finding: LiveFinding }) {
    if (finding.status === "pending") {
        return (
            <div className="rounded-xl border border-dashed border-alloy-stone/15 bg-[#FAFBFC] px-3 py-2.5 opacity-50">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/30">
                    {finding.entity}
                </p>
                <p className="mt-1 text-[12px] text-alloy-midnight/25">Waiting…</p>
            </div>
        );
    }
    if (finding.status === "streaming") {
        return (
            <div className="rounded-xl border border-[#00A283]/20 bg-[#00A283]/[0.05] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#007A63]">
                    {finding.entity} · extracting
                </p>
                <p className="mt-1 text-[14px] font-semibold text-alloy-midnight">{finding.value}</p>
            </div>
        );
    }
    return (
        <div className="rounded-xl border border-alloy-stone/10 bg-white px-3 py-2.5">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    {finding.entity}
                </p>
                <Check className="h-3.5 w-3.5 text-[#00A283]" strokeWidth={2.5} />
            </div>
            <p className="mt-1 text-[14px] font-semibold text-alloy-midnight">{finding.value}</p>
        </div>
    );
}

/** Frozen three-column operational layout — 21% / 38% / remainder. */
export function BaselineThreeColumnWorkspace() {
    return (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(188px,21%)_minmax(260px,38%)_1fr]">
            <BosColumn />
            <div className="min-h-0 border-x border-alloy-stone/8">
                <BaselineMaterialStack />
            </div>
            <FindingsColumn />
        </div>
    );
}

export function BaselineWorkspaceHeader() {
    return (
        <div className="flex shrink-0 items-center justify-between border-b border-alloy-stone/8 px-5 py-3">
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

export function BaselineWorkspaceBody() {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <BaselineWorkspaceHeader />
            <BaselineThreeColumnWorkspace />
        </div>
    );
}

export function GeoViewport({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative overflow-hidden rounded-[1.25rem] border border-alloy-midnight/8"
            style={{ height: "min(78vh, 680px)" }}
        >
            <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
            <div className="pointer-events-none absolute inset-0 scale-105" style={BOS_AMBIENT_GLOW_STYLE} aria-hidden />
            <div className="relative flex h-full items-center justify-center p-5">{children}</div>
        </div>
    );
}

export type GeometryShellProps = {
    children: ReactNode;
    shellStyle: CSSProperties;
    "data-geometry"?: string;
};

export function GeometryShell({ children, shellStyle, "data-geometry": dataGeometry }: GeometryShellProps) {
    return (
        <div
            className="relative flex min-h-0 w-full max-w-[1240px] flex-col overflow-hidden bg-white shadow-[0_20px_56px_rgba(15,35,52,0.18)]"
            style={{ height: "100%", maxHeight: "100%", ...shellStyle }}
            data-geometry={dataGeometry}
        >
            {children}
        </div>
    );
}

export function GeoMockupSection({
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
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">{label}</p>
                <h2 className="mt-1 text-lg font-semibold text-alloy-midnight">{title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-alloy-midnight/60">{summary}</p>
            </div>
            {children}
        </section>
    );
}

export const GEOMETRY_SHELLS: Record<
    string,
    { shellStyle: CSSProperties; dataGeometry: string }
> = {
    superellipse: {
        shellStyle: { borderRadius: "22% / 28%" },
        dataGeometry: "superellipse",
    },
    oval: {
        shellStyle: { borderRadius: "50% / 42%" },
        dataGeometry: "oval",
    },
    stadium: {
        shellStyle: { borderRadius: 9999 },
        dataGeometry: "stadium",
    },
    softTrapezoid: {
        shellStyle: {
            clipPath: "polygon(1.5% 0%, 98.5% 0%, 100% 100%, 0% 100%)",
            borderRadius: 8,
        },
        dataGeometry: "soft-trapezoid",
    },
    offsetCapsule: {
        shellStyle: {
            clipPath:
                "polygon(0 0, calc(100% - 48px) 0, 100% 48px, 100% 100%, 48px 100%, 0 calc(100% - 48px))",
            borderRadius: 20,
        },
        dataGeometry: "offset-capsule",
    },
    hybridOvalTrapezoid: {
        shellStyle: {
            clipPath: "polygon(4% 2%, 96% 2%, 100% 50%, 96% 98%, 4% 98%, 0 50%)",
            borderRadius: "50% / 38%",
        },
        dataGeometry: "hybrid-oval-trapezoid",
    },
};
