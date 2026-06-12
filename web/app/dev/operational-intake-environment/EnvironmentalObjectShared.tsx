"use client";

import { Mail, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";

import {
    INQUIRY_SNIPPET,
    PROGRESSIVE_FINDINGS,
    type LiveFinding,
} from "../operational-intake-workspace/OperationalIntakeShared";

/** Material — center of gravity. Embedded in object, not a form field. */
export function EnvMaterialCore({ dense = false }: { dense?: boolean }) {
    return (
        <div data-env-zone="material" className="text-left">
            {!dense ?
                <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">
                    Material
                </p>
            :   null}
            <div className="space-y-1.5">
                <div className="flex items-start gap-2 px-1 py-1">
                    <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/45" />
                    <div>
                        <p className="text-[12px] font-semibold text-white/90">Website inquiry</p>
                        <p className="text-[10px] text-white/45">Jordan Lee · toddler room</p>
                    </div>
                </div>
                <div className="flex items-start gap-2 bg-white/[0.06] px-2 py-1.5">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5dffc8]" />
                    <div>
                        <p className="text-[12px] font-semibold text-white/92">Pasted note</p>
                        <p className="line-clamp-2 text-[10px] leading-relaxed text-white/55">
                            {INQUIRY_SNIPPET.slice(0, 90)}…
                        </p>
                    </div>
                </div>
                <p className="px-1 text-[10px] text-white/30">+ dock more material</p>
            </div>
        </div>
    );
}

export function EnvBosWhisper({ align = "left" }: { align?: "left" | "center" | "right" }) {
    const alignClass =
        align === "center" ? "text-center"
        : align === "right" ? "text-right"
        : "text-left";
    return (
        <div className={`${alignClass} text-white/55`} data-env-zone="bos">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">BOS</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/60">
                Interpreting material as it arrives
            </p>
            <p className="mt-2 text-[10px] text-white/35">Enter manually · Clear</p>
        </div>
    );
}

export function EnvFindingsEmergence({
    findings = PROGRESSIVE_FINDINGS.slice(0, 5),
    light = false,
}: {
    findings?: LiveFinding[];
    light?: boolean;
}) {
    const labelClass = light ? "text-alloy-midnight/40" : "text-white/35";
    const entityClass = light ? "text-alloy-midnight/45" : "text-white/40";
    const valueClass = light ? "text-alloy-midnight" : "text-white/88";
    const dimClass = light ? "text-alloy-midnight/35" : "text-white/30";

    return (
        <div data-env-zone="findings">
            <p className={`mb-2 text-[9px] font-bold uppercase tracking-[0.16em] ${labelClass}`}>
                Findings emerging
            </p>
            <div className="space-y-1">
                {findings.map((f) => (
                    <div key={f.id} className="flex items-baseline gap-2">
                        <span className={`w-14 shrink-0 text-[9px] uppercase tracking-wide ${entityClass}`}>
                            {f.entity}
                        </span>
                        <span
                            className={`text-[12px] font-semibold ${valueClass} ${
                                f.status === "pending" ? dimClass : ""
                            } ${f.status === "streaming" ? "text-[#5dffc8]" : ""}`}
                        >
                            {f.status === "pending" ? "…" : f.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function EnvMockupSection({
    mockupId,
    label,
    title,
    metaphor,
    crmDistinction,
    children,
}: {
    mockupId: string;
    label: string;
    title: string;
    metaphor: string;
    crmDistinction: string;
    children: ReactNode;
}) {
    return (
        <section data-mockup={mockupId} className="mb-28 scroll-mt-8">
            <div className="mb-5 max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                    {label}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-alloy-midnight">{title}</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-white/80 px-3 py-2.5 text-[12px] leading-relaxed text-alloy-midnight/65">
                        <span className="font-semibold text-alloy-midnight">Metaphor · </span>
                        {metaphor}
                    </div>
                    <div className="rounded-lg bg-[#00A283]/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-alloy-midnight/65">
                        <span className="font-semibold text-[#007A63]">Not CRM · </span>
                        {crmDistinction}
                    </div>
                </div>
            </div>
            {children}
        </section>
    );
}

/** Mission-control floor — object sits on environment, not inside a modal card. */
export function EnvStage({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative overflow-hidden"
            style={{
                height: "min(76vh, 640px)",
                background:
                    "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0,162,131,0.08), transparent 60%), linear-gradient(180deg, #0f1c28 0%, #1a2d3d 45%, #0d1822 100%)",
            }}
        >
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                    backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                }}
                aria-hidden
            />
            <div className="relative flex h-full items-center justify-center px-8 py-10">
                {children}
            </div>
        </div>
    );
}
