"use client";

import type { CSSProperties, ReactNode } from "react";

import { BosSmoke } from "@/app/adminV2/components/bos/identity/BosSmoke";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
} from "@/lib/admin/actions/bosWorkspaceShell";
import { BOS_IDENTITY } from "@/lib/bos/bosIdentityTokens";

import { BaselineWorkspaceBody } from "../operational-intake-geometry/OperationalIntakeGeometryShared";

const BEND_PINE = BOS_IDENTITY.bendPine;

export type ShapeR2Id =
    | "stadium-plus"
    | "cloud-stadium"
    | "orbital-capsule"
    | "cloud-core"
    | "winged-stadium"
    | "superellipse"
    | "forged-oval"
    | "signature-bos";

export type AtmospherePass = "a" | "b" | "c";

type ShapeConfig = {
    label: string;
    summary: string;
    frameRadius: CSSProperties["borderRadius"];
    framePadding: string;
    safeRadius: number;
    decor?: ReactNode;
    outerScale?: string;
};

const SHAPES: Record<ShapeR2Id, ShapeConfig> = {
    "stadium-plus": {
        label: "Stadium Plus",
        summary: "Winner pushed further — stronger end curvature, crafted stadium object.",
        frameRadius: 9999,
        framePadding: "12px 22px",
        safeRadius: 18,
    },
    "cloud-stadium": {
        label: "Cloud Stadium",
        summary: "Stadium with Vision Pro–like atmospheric swelling on the outer edge.",
        frameRadius: 9999,
        framePadding: "14px 20px",
        safeRadius: 18,
    },
    "orbital-capsule": {
        label: "Orbital Capsule",
        summary: "Long capsule with engineered asymmetry — one end subtly larger.",
        frameRadius: 9999,
        framePadding: "10px 24px 10px 14px",
        safeRadius: 16,
    },
    "cloud-core": {
        label: "Cloud-Core",
        summary: "Shell bulges around the material process — formed around intake, not a rectangle.",
        frameRadius: "2.5rem / 2rem",
        framePadding: "12px 18px",
        safeRadius: 16,
    },
    "winged-stadium": {
        label: "Winged Stadium",
        summary: "Stadium center with subtle outward flare at left/right — airflow silhouette.",
        frameRadius: 9999,
        framePadding: "10px 28px",
        safeRadius: 17,
    },
    superellipse: {
        label: "Superellipse",
        summary: "Industrial Braun/Apple hardware curve — not oval, not rectangle.",
        frameRadius: "26% / 21%",
        framePadding: "14px 16px",
        safeRadius: 14,
    },
    "forged-oval": {
        label: "Forged Oval",
        summary: "Flattened top and bottom, wider center — forged operational mass.",
        frameRadius: "48% / 34%",
        framePadding: "12px 18px",
        safeRadius: 15,
    },
    "signature-bos": {
        label: "Signature BOS Candidate",
        summary: "Strongest opinionated silhouette — stadium-capsule hybrid with BOS perimeter language.",
        frameRadius: "3rem / 2.35rem",
        framePadding: "11px 20px",
        safeRadius: 16,
    },
};

function ShapeDecoration({ shapeId }: { shapeId: ShapeR2Id }) {
    switch (shapeId) {
        case "cloud-stadium":
            return (
                <div
                    className="pointer-events-none absolute inset-[-6px] opacity-40"
                    style={{
                        borderRadius: "inherit",
                        boxShadow: "0 0 48px rgba(0,162,131,0.18), inset 0 0 32px rgba(255,255,255,0.4)",
                    }}
                    aria-hidden
                />
            );
        case "cloud-core":
            return (
                <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                        borderRadius: "inherit",
                        background:
                            "radial-gradient(ellipse 42% 55% at 48% 52%, rgba(0,162,131,0.14), transparent 68%)",
                    }}
                    aria-hidden
                />
            );
        case "winged-stadium":
            return (
                <>
                    <div
                        className="pointer-events-none absolute -left-3 top-[18%] h-[64%] w-8 opacity-25"
                        style={{
                            borderRadius: "999px 0 0 999px",
                            border: `1px solid ${BEND_PINE}`,
                            borderRight: "none",
                        }}
                        aria-hidden
                    />
                    <div
                        className="pointer-events-none absolute -right-3 top-[18%] h-[64%] w-8 opacity-25"
                        style={{
                            borderRadius: "0 999px 999px 0",
                            border: `1px solid ${BEND_PINE}`,
                            borderLeft: "none",
                        }}
                        aria-hidden
                    />
                </>
            );
        case "signature-bos":
            return (
                <>
                    <div
                        className="pointer-events-none absolute inset-x-[8%] top-0 h-px opacity-50"
                        style={{ background: `linear-gradient(90deg, transparent, ${BEND_PINE}, transparent)` }}
                        aria-hidden
                    />
                    <div
                        className="pointer-events-none absolute inset-x-[12%] bottom-0 h-px opacity-35"
                        style={{ background: `linear-gradient(90deg, transparent, ${BEND_PINE}, transparent)` }}
                        aria-hidden
                    />
                </>
            );
        case "orbital-capsule":
            return (
                <div
                    className="pointer-events-none absolute right-[3%] top-[12%] h-[76%] w-[5px] rounded-full opacity-30"
                    style={{ background: `linear-gradient(180deg, transparent, ${BEND_PINE}, transparent)` }}
                    aria-hidden
                />
            );
        case "forged-oval":
            return (
                <div
                    className="pointer-events-none absolute inset-x-[10%] top-[6%] h-[88%] opacity-15"
                    style={{
                        borderRadius: "inherit",
                        boxShadow: `inset 0 0 0 1px ${BEND_PINE}`,
                    }}
                    aria-hidden
                />
            );
        default:
            return null;
    }
}

function AtmosphereLayers({
    pass,
    showMaterialGlow,
}: {
    pass: AtmospherePass;
    showMaterialGlow: boolean;
}) {
    if (pass === "a") return null;
    return (
        <>
            {pass === "b" || pass === "c" ?
                <>
                    <div
                        className="pointer-events-none absolute -inset-x-4 -inset-y-2 opacity-35"
                        aria-hidden
                    >
                        <BosSmoke state="thinking" />
                    </div>
                    <div
                        className="pointer-events-none absolute inset-[-12px] rounded-[inherit] opacity-25"
                        style={{
                            background:
                                "radial-gradient(ellipse 90% 70% at 50% 50%, rgba(0,162,131,0.12), transparent 70%)",
                            filter: "blur(8px)",
                        }}
                        aria-hidden
                    />
                </>
            :   null}
            {pass === "c" && showMaterialGlow ?
                <div
                    className="pointer-events-none absolute bottom-[12%] left-[28%] right-[28%] top-[22%] z-[2] rounded-2xl"
                    style={{
                        background:
                            "radial-gradient(ellipse 70% 80% at 50% 50%, rgba(0,162,131,0.07), transparent 72%)",
                    }}
                    aria-hidden
                    data-atmosphere="material-glow"
                />
            :   null}
        </>
    );
}

export function ShapeR2Shell({
    shapeId,
    atmosphere,
    compact = false,
}: {
    shapeId: ShapeR2Id;
    atmosphere: AtmospherePass;
    compact?: boolean;
}) {
    const shape = SHAPES[shapeId];
    const passLabel =
        atmosphere === "a" ? "A · Bend Pine perimeter"
        : atmosphere === "b" ? "B · + smoke aura"
        : "C · + material glow";

    return (
        <div
            className="flex min-h-0 flex-col"
            style={{ height: compact ? "100%" : "100%", minHeight: compact ? 420 : undefined }}
            data-shape={shapeId}
            data-atmosphere={atmosphere}
        >
            <p className="mb-2 shrink-0 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-midnight/45">
                {passLabel}
            </p>
            <div className="relative min-h-0 flex-1">
                <div
                    className="relative flex h-full min-h-[400px] flex-col"
                    style={{ filter: shapeId === "stadium-plus" ? undefined : undefined }}
                >
                    <div
                        className="relative flex min-h-0 flex-1 flex-col"
                        style={{ padding: shape.framePadding }}
                    >
                        <AtmosphereLayers pass={atmosphere} showMaterialGlow />

                        <div
                            className="relative flex min-h-0 flex-1 flex-col"
                            style={{
                                borderRadius: shape.frameRadius,
                                border: `1.5px solid ${BEND_PINE}`,
                                background:
                                    "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,249,251,0.99) 100%)",
                                boxShadow: [
                                    `0 0 0 1px rgba(0,162,131,0.06)`,
                                    `0 16px 40px rgba(39,63,82,0.12)`,
                                    `0 6px 16px rgba(0,162,131,0.07)`,
                                    `inset 0 1px 0 rgba(255,255,255,0.96)`,
                                ].join(", "),
                            }}
                        >
                            <ShapeDecoration shapeId={shapeId} />
                            <div
                                className="relative z-[1] m-[8px] flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
                                style={{
                                    borderRadius: shape.safeRadius,
                                    boxShadow: "inset 0 0 0 1px rgba(39,63,82,0.04)",
                                }}
                                data-shape-safe="true"
                            >
                                {atmosphere === "c" ?
                                    <div
                                        className="pointer-events-none absolute bottom-[8%] left-[22%] right-[36%] top-[18%] z-0 rounded-xl"
                                        style={{
                                            background:
                                                "radial-gradient(ellipse at center, rgba(0,162,131,0.06), transparent 70%)",
                                        }}
                                        aria-hidden
                                    />
                                :   null}
                                <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
                                    <BaselineWorkspaceBody />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ShapeR2Section({
    shapeId,
    children,
}: {
    shapeId: ShapeR2Id;
    children: ReactNode;
}) {
    const shape = SHAPES[shapeId];
    return (
        <section data-mockup={`shape-r2-${shapeId}`} className="mb-24 scroll-mt-8">
            <div className="mb-4 max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-juniper">
                    {shape.label}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-alloy-midnight">{shape.label}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-alloy-midnight/60">{shape.summary}</p>
            </div>
            <div
                className="relative overflow-hidden"
                style={{
                    height: "min(82vh, 720px)",
                    background:
                        "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0,162,131,0.06), transparent 60%), linear-gradient(180deg, #eef1f5 0%, #e4e8ee 100%)",
                }}
            >
                <div className="absolute inset-0 opacity-60" style={BOS_BACKDROP_STYLE} aria-hidden />
                <div
                    className="pointer-events-none absolute inset-0 scale-105 opacity-40"
                    style={BOS_AMBIENT_GLOW_STYLE}
                    aria-hidden
                />
                <div className="relative grid h-full grid-cols-3 gap-3 p-4">{children}</div>
            </div>
        </section>
    );
}

export function ShapeR2Triple({ shapeId }: { shapeId: ShapeR2Id }) {
    return (
        <ShapeR2Section shapeId={shapeId}>
            <ShapeR2Shell shapeId={shapeId} atmosphere="a" compact />
            <ShapeR2Shell shapeId={shapeId} atmosphere="b" compact />
            <ShapeR2Shell shapeId={shapeId} atmosphere="c" compact />
        </ShapeR2Section>
    );
}

export { SHAPES };
