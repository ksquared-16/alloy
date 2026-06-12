"use client";

import type { CSSProperties, ReactNode } from "react";

import { BosSmoke } from "@/app/adminV2/components/bos/identity/BosSmoke";
import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import {
    BOS_AMBIENT_GLOW_STYLE,
    BOS_BACKDROP_STYLE,
} from "@/lib/admin/actions/bosWorkspaceShell";
import { BOS_IDENTITY } from "@/lib/bos/bosIdentityTokens";

import {
    BaselineWorkspaceBody,
    GeoMockupSection,
} from "../operational-intake-geometry/OperationalIntakeGeometryShared";

const BEND_PINE = BOS_IDENTITY.bendPine;
const MIDNIGHT = BOS_IDENTITY.midnightForge;

export type FittedShellVariant = "stadium" | "hybrid" | "trapezoid";

const SHELL_FRAME: Record<FittedShellVariant, CSSProperties> = {
    stadium: {
        borderRadius: 9999,
    },
    hybrid: {
        borderRadius: "2.75rem / 2.25rem",
    },
    trapezoid: {
        borderRadius: "1.35rem 1.35rem 1.75rem 1.75rem",
    },
};

/**
 * Fitted signature shell — outer frame only. Inner safe area is rectangular; content never clipped.
 *
 * 1. Atmospheric field (viewport)
 * 2. Signature shell edge (Bend Pine)
 * 3. Safe content inset (white, rectangular)
 * 4. Three-column workspace (baseline)
 */
export function FittedSignatureShell({
    variant,
    children,
}: {
    variant: FittedShellVariant;
    children: ReactNode;
}) {
    return (
        <div
            className="relative flex min-h-0 w-full max-w-[1240px] flex-col"
            style={{ height: "100%", maxHeight: "100%" }}
            data-fitted-shell={variant}
        >
            {/* Faint smoke — outside/atmosphere, not over content */}
            <div
                className="pointer-events-none absolute -inset-x-8 -top-6 bottom-0 opacity-50"
                aria-hidden
            >
                <BosSmoke state="thinking" />
            </div>
            <div
                className="pointer-events-none absolute -inset-x-6 top-1/2 h-24 -translate-y-1/2 opacity-30"
                aria-hidden
            >
                <BosSmoke state="thinking" />
            </div>

            {/* Signature shell frame — shape + Bend Pine edge */}
            <div
                className="relative flex min-h-0 flex-1 flex-col p-[10px]"
                style={{
                    ...SHELL_FRAME[variant],
                    background: `linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(248,250,252,0.98) 100%)`,
                    border: `1.5px solid ${BEND_PINE}`,
                    boxShadow: [
                        `0 0 0 1px rgba(0,162,131,0.08)`,
                        `0 24px 56px rgba(39,63,82,0.14)`,
                        `0 8px 24px rgba(0,162,131,0.08)`,
                        `inset 0 1px 0 rgba(255,255,255,0.95)`,
                    ].join(", "),
                }}
            >
                {/* Hybrid: subtle side taper as decorative edge panels — not a clip mask */}
                {variant === "hybrid" ?
                    <>
                        <div
                            className="pointer-events-none absolute bottom-[8%] left-0 top-[8%] w-[6px] rounded-full opacity-35"
                            style={{
                                background: `linear-gradient(180deg, transparent, ${BEND_PINE}, transparent)`,
                            }}
                            aria-hidden
                        />
                        <div
                            className="pointer-events-none absolute bottom-[8%] right-0 top-[8%] w-[6px] rounded-full opacity-35"
                            style={{
                                background: `linear-gradient(180deg, transparent, ${BEND_PINE}, transparent)`,
                            }}
                            aria-hidden
                        />
                    </>
                :   null}

                {/* Trapezoid: architectural corner accent — outer frame only */}
                {variant === "trapezoid" ?
                    <div
                        className="pointer-events-none absolute inset-0 opacity-20"
                        style={{
                            background: `linear-gradient(175deg, ${MIDNIGHT} 0%, transparent 18%, transparent 82%, ${MIDNIGHT} 100%)`,
                            borderRadius: "inherit",
                        }}
                        aria-hidden
                    />
                :   null}

                {/* Inner safe area — rectangular, full usable width */}
                <div
                    className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
                    style={{
                        borderRadius: variant === "stadium" ? 20 : variant === "hybrid" ? 18 : 14,
                        boxShadow: "inset 0 0 0 1px rgba(39,63,82,0.04)",
                    }}
                    data-fitted-shell-safe="true"
                >
                    {children}
                </div>
            </div>
        </div>
    );
}

export function FittedShellViewport({ children }: { children: ReactNode }) {
    return (
        <div
            className="relative overflow-hidden"
            style={{ height: "min(78vh, 680px)" }}
        >
            <div className="absolute inset-0" style={BOS_BACKDROP_STYLE} aria-hidden />
            <div
                className="pointer-events-none absolute inset-0 scale-105"
                style={BOS_AMBIENT_GLOW_STYLE}
                aria-hidden
            />
            <div
                className="pointer-events-none absolute inset-x-[12%] top-[6%] h-20 opacity-25"
                aria-hidden
            >
                <BosSmoke state="thinking" />
            </div>
            <div className="relative flex h-full items-center justify-center px-6 py-5">{children}</div>
        </div>
    );
}

export function FittedShellMockup({
    mockupId,
    label,
    title,
    summary,
    variant,
}: {
    mockupId: string;
    label: string;
    title: string;
    summary: string;
    variant: FittedShellVariant;
}) {
    return (
        <GeoMockupSection mockupId={mockupId} label={label} title={title} summary={summary}>
            <FittedShellViewport>
                <FittedSignatureShell variant={variant}>
                    <BaselineWorkspaceBody />
                </FittedSignatureShell>
            </FittedShellViewport>
        </GeoMockupSection>
    );
}
