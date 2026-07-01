"use client";

import type { CSSProperties, ReactNode } from "react";
import type { AtmosphericBorderVariant } from "./atmosphericBorderTokens";
import { BEND_PINE, FORGE_DEEP, RIPPLE_REDUCTION } from "./atmosphericBorderTokens";

type Props = {
    variant: AtmosphericBorderVariant;
    children: ReactNode;
    className?: string;
};

/**
 * Full-perimeter atmospheric border around rectangular Action Workspace.
 * Atmosphere over shape — no crest, no blob, no cloud silhouette.
 */
export function AtmosphericBorderFrame({ variant, children, className = "" }: Props) {
    const pine = BEND_PINE;
    const borderOpacity = 0.11;
    const thickBorder = 4;

    const baseRect: CSSProperties = {
        borderRadius: 12,
        background: "#fff",
        position: "relative",
        overflow: "hidden",
    };

    if (variant === "soft-intelligence-field") {
        return (
            <div
                className={`relative ${className}`}
                style={{
                    padding: 6,
                    borderRadius: 16,
                    background: `linear-gradient(135deg, rgba(0,162,131,0.06) 0%, rgba(0,162,131,0.02) 50%, rgba(0,162,131,0.05) 100%)`,
                    boxShadow: `
                        0 0 0 1px rgba(0,162,131,0.06),
                        0 0 0 ${thickBorder}px rgba(0,162,131,${borderOpacity}),
                        0 0 28px rgba(0,162,131,0.1),
                        0 0 56px rgba(0,162,131,0.05),
                        0 20px 48px rgba(24,39,58,0.16)
                    `,
                }}
            >
                <div style={baseRect}>{children}</div>
            </div>
        );
    }

    if (variant === "brainwave-border") {
        const amp = 3 * RIPPLE_REDUCTION;
        return (
            <div className={`relative ${className}`} style={{ padding: 8 }}>
                <BrainwaveSvg amplitude={amp} className="pointer-events-none absolute inset-0 h-full w-full" />
                <div
                    style={{
                        ...baseRect,
                        boxShadow: `0 0 0 ${thickBorder}px rgba(0,162,131,${borderOpacity * 0.9})`,
                    }}
                >
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div
            className={`relative ${className}`}
            style={{
                padding: 7,
                borderRadius: 14,
                boxShadow: `0 20px 48px rgba(24,39,58,0.16)`,
            }}
        >
            <CloudEnergySvg className="pointer-events-none absolute inset-0 h-full w-full" />
            <div
                style={{
                    ...baseRect,
                    border: `${thickBorder}px solid rgba(0,162,131,${borderOpacity})`,
                    boxShadow: `inset 0 0 24px rgba(0,162,131,0.04)`,
                }}
            >
                {children}
            </div>
        </div>
    );
}

/** Subtle sine modulation on full rectangle — reduced amplitude */
function BrainwaveSvg({ amplitude, className }: { amplitude: number; className?: string }) {
    const w = 400;
    const h = 280;
    const a = amplitude;
    const top = `M 8 ${12 + a} Q 50 ${12 - a} 100 ${12 + a} T 200 ${12 - a} T 300 ${12 + a} T ${w - 8} ${12 + a}`;
    const right = `M ${w - 12 - a} 20 Q ${w - 12 + a} 80 ${w - 12 - a} 140 T ${w - 12 + a} ${h - 20}`;
    const bottom = `M ${w - 8} ${h - 12 - a} Q 300 ${h - 12 + a} 200 ${h - 12 - a} T 100 ${h - 12 + a} T 8 ${h - 12 - a}`;
    const left = `M ${12 + a} ${h - 20} Q ${12 - a} 180 ${12 + a} 120 T ${12 - a} 20`;

    return (
        <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
            <defs>
                <filter id="brainwave-blur">
                    <feGaussianBlur stdDeviation="1.2" />
                </filter>
            </defs>
            <g fill="none" stroke={BEND_PINE} strokeWidth={5} strokeOpacity={0.14} filter="url(#brainwave-blur)">
                <path d={top} />
                <path d={right} />
                <path d={bottom} />
                <path d={left} />
            </g>
            <g fill="none" stroke={BEND_PINE} strokeWidth={2} strokeOpacity={0.08}>
                <path d={top} transform="translate(0, 6)" />
                <path d={bottom} transform="translate(0, -6)" />
            </g>
        </svg>
    );
}

/** Diffuse energy luminance — NOT a cloud path */
function CloudEnergySvg({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 400 280" className={className} preserveAspectRatio="none" aria-hidden>
            <defs>
                <radialGradient id="energy-tl" cx="0%" cy="0%" r="45%">
                    <stop offset="0%" stopColor={BEND_PINE} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={BEND_PINE} stopOpacity={0} />
                </radialGradient>
                <radialGradient id="energy-tr" cx="100%" cy="0%" r="40%">
                    <stop offset="0%" stopColor={BEND_PINE} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={BEND_PINE} stopOpacity={0} />
                </radialGradient>
                <radialGradient id="energy-br" cx="100%" cy="100%" r="42%">
                    <stop offset="0%" stopColor={BEND_PINE} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={BEND_PINE} stopOpacity={0} />
                </radialGradient>
                <radialGradient id="energy-bl" cx="0%" cy="100%" r="38%">
                    <stop offset="0%" stopColor={BEND_PINE} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={BEND_PINE} stopOpacity={0} />
                </radialGradient>
                <linearGradient id="energy-top" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={BEND_PINE} stopOpacity={0.1} />
                    <stop offset="25%" stopColor={BEND_PINE} stopOpacity={0.04} />
                    <stop offset="50%" stopColor={BEND_PINE} stopOpacity={0.14} />
                    <stop offset="75%" stopColor={BEND_PINE} stopOpacity={0.05} />
                    <stop offset="100%" stopColor={BEND_PINE} stopOpacity={0.11} />
                </linearGradient>
            </defs>
            <rect x={0} y={0} width={400} height={280} fill="url(#energy-top)" opacity={0.6} />
            <rect x={0} y={0} width={120} height={120} fill="url(#energy-tl)" />
            <rect x={280} y={0} width={120} height={120} fill="url(#energy-tr)" />
            <rect x={280} y={160} width={120} height={120} fill="url(#energy-br)" />
            <rect x={0} y={160} width={120} height={120} fill="url(#energy-bl)" />
        </svg>
    );
}

export function AtmosphericClosedEntry({ variant }: { variant: AtmosphericBorderVariant }) {
    const labels: Record<AtmosphericBorderVariant, string> = {
        "soft-intelligence-field": "BOS Field",
        "brainwave-border": "BOS Signal",
        "cloud-energy-border": "BOS Energy",
    };

    return (
        <div
            className="mx-auto flex items-center gap-3 rounded-lg px-4 py-2.5"
            style={{
                background: FORGE_DEEP,
                boxShadow:
                    variant === "soft-intelligence-field" ?
                        `0 0 0 3px rgba(0,162,131,0.1), 0 0 20px rgba(0,162,131,0.12)`
                    : variant === "brainwave-border" ?
                        `0 0 0 2px rgba(0,162,131,0.08), 0 0 16px rgba(0,162,131,0.1)`
                    :   `0 0 0 2px rgba(0,162,131,0.07), 0 0 24px rgba(0,162,131,0.14)`,
            }}
        >
            <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: BEND_PINE, opacity: 0.7, boxShadow: `0 0 6px rgba(0,162,131,0.5)` }}
            />
            <span className="text-[12px] font-semibold text-white">{labels[variant]}</span>
            <span className="text-[11px] text-white/40">· Create lead</span>
            <span className="ml-auto text-[11px] font-medium" style={{ color: BEND_PINE, opacity: 0.85 }}>
                Open
            </span>
        </div>
    );
}

export function RectangularShellHeader() {
    return (
        <header className="shrink-0 px-5 py-3" style={{ background: FORGE_DEEP }}>
            <div className="flex items-start justify-between">
                <div>
                    <h4 className="text-[13px] font-semibold text-white">Tell BOS about the family</h4>
                    <p className="text-[10px] text-white/45">Intake · Findings · Fill Gaps · Ready To Create</p>
                </div>
                <span className="text-[10px] text-white/40">Close</span>
            </div>
        </header>
    );
}
