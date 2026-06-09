"use client";

import type { BosShapeVariant } from "./bosShapeTokens";
import { BEND_PINE, MIDNIGHT_FORGE } from "./bosShapeTokens";

type Scale = "badge" | "card" | "pane" | "crest";

type Props = {
    variant: BosShapeVariant;
    scale?: Scale;
    className?: string;
};

/**
 * BOS signature shapes — Bend Pine primary, Midnight Forge structure.
 * No gold. Four explorations sharing one color doctrine.
 */
export function BosShapeMark({ variant, scale = "card", className = "" }: Props) {
    const pine = BEND_PINE;
    const forge = MIDNIGHT_FORGE;

    if (variant === "cloud") return <CloudShape scale={scale} className={className} pine={pine} forge={forge} />;
    if (variant === "contour") return <ContourShape scale={scale} className={className} pine={pine} forge={forge} />;
    if (variant === "halo") return <HaloShape scale={scale} className={className} pine={pine} />;
    return <IntelligenceFrameShape scale={scale} className={className} pine={pine} forge={forge} />;
}

function CloudShape({
    scale,
    className,
    pine,
    forge,
}: {
    scale: Scale;
    className: string;
    pine: string;
    forge: string;
}) {
    if (scale === "badge") {
        return (
            <svg viewBox="0 0 28 20" className={className} aria-hidden>
                <path
                    d="M4 16C1 16 0 13 2 11C3 9 5 8 7 8C7 5 10 3 14 3C17 3 19 4 20 6C23 5 26 7 26 10C28 11 28 14 25 16H4Z"
                    fill={pine}
                    fillOpacity={0.14}
                />
                <path
                    d="M4 16C1 16 0 13 2 11C3 9 5 8 7 8C7 5 10 3 14 3C17 3 19 4 20 6C23 5 26 7 26 10C28 11 28 14 25 16"
                    stroke={pine}
                    strokeWidth={1.2}
                    strokeOpacity={0.55}
                    fill="none"
                />
            </svg>
        );
    }

    if (scale === "crest") {
        return (
            <svg viewBox="0 0 240 36" className={className} preserveAspectRatio="none" aria-hidden>
                <path
                    d="M0 28V14C0 8 4 4 10 4H80C95 4 105 0 118 6C128 10 138 8 148 4C158 0 172 2 180 8C188 12 200 10 210 6C220 2 232 4 240 10V28C240 32 236 36 232 36H8C4 36 0 32 0 28Z"
                    fill={pine}
                    fillOpacity={0.07}
                />
                <path
                    d="M0 28V14C0 8 4 4 10 4H80C95 4 105 0 118 6C128 10 138 8 148 4C158 0 172 2 180 8C188 12 200 10 210 6C220 2 232 4 240 10"
                    stroke={pine}
                    strokeWidth={1}
                    strokeOpacity={0.35}
                    fill="none"
                />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 400 300" className={className} preserveAspectRatio="none" aria-hidden>
            <path
                d="M20 260H380C392 260 400 252 400 240V80C400 68 392 60 380 60H300C290 60 282 52 280 42C276 28 264 18 248 14C232 10 216 12 204 20C192 28 180 26 168 18C156 10 140 6 124 10C108 14 96 26 92 40C88 52 80 60 68 60H20C8 60 0 68 0 80V240C0 252 8 260 20 260Z"
                fill={pine}
                fillOpacity={0.05}
            />
            <path
                d="M20 260H380C392 260 400 252 400 240V80C400 68 392 60 380 60H300C290 60 282 52 280 42C276 28 264 18 248 14C232 10 216 12 204 20C192 28 180 26 168 18C156 10 140 6 124 10C108 14 96 26 92 40C88 52 80 60 68 60H20C8 60 0 68 0 80"
                stroke={pine}
                strokeWidth={1.5}
                strokeOpacity={0.28}
                fill="none"
            />
        </svg>
    );
}

function ContourShape({
    scale,
    className,
    pine,
    forge,
}: {
    scale: Scale;
    className: string;
    pine: string;
    forge: string;
}) {
    if (scale === "badge") {
        return (
            <svg viewBox="0 0 32 32" className={className} aria-hidden>
                <path
                    d="M4 28V12C4 6 8 2 14 2H20C26 2 28 6 28 10C30 8 32 10 32 14V28C32 30 30 32 28 32H6C4 32 2 30 2 28V20C2 14 0 10 4 6C6 3 10 2 14 2"
                    fill={pine}
                    fillOpacity={0.15}
                />
                <path
                    d="M4 28V12C4 6 8 2 14 2H20C26 2 28 6 28 10C30 8 32 10 32 14V28"
                    stroke={pine}
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    fill="none"
                />
                <circle cx={8} cy={8} r={2} fill={forge} fillOpacity={0.35} />
            </svg>
        );
    }

    if (scale === "crest") {
        return (
            <svg viewBox="0 0 240 40" className={className} preserveAspectRatio="none" aria-hidden>
                <path
                    d="M0 36V12C0 4 8 0 16 0H100C112 0 122 -2 134 8C146 18 158 12 170 4C182 -4 196 0 206 8C216 16 228 12 240 4V36H0Z"
                    fill={pine}
                    fillOpacity={0.1}
                />
                <path
                    d="M0 36V12C0 4 8 0 16 0H100C112 0 122 -2 134 8C146 18 158 12 170 4C182 -4 196 0 206 8C216 16 228 12 240 4"
                    stroke={pine}
                    strokeWidth={1.75}
                    strokeOpacity={0.5}
                    fill="none"
                />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 400 300" className={className} preserveAspectRatio="none" aria-hidden>
            <path
                d="M12 0H340C360 0 376 16 376 36V264C376 284 360 300 340 300H48C28 300 12 284 12 264V96C12 76 0 64 0 44C0 24 8 8 24 2C32 0 40 0 52 6C64 12 68 24 60 36C52 48 40 52 32 44C24 36 20 24 28 12C36 0 48 0 56 0H12Z"
                fill={pine}
                fillOpacity={0.06}
            />
            <path
                d="M12 0H340C360 0 376 16 376 36V264C376 284 360 300 340 300H48C28 300 12 284 12 264V96C12 76 0 64 0 44C0 24 8 8 24 2C32 0 40 0 52 6C64 12 68 24 60 36C52 48 40 52 32 44C24 36 20 24 28 12C36 0 48 0 56 0"
                stroke={pine}
                strokeWidth={2}
                strokeOpacity={0.38}
                fill="none"
            />
        </svg>
    );
}

function HaloShape({ scale, className, pine }: { scale: Scale; className: string; pine: string }) {
    const id = `halo-${scale}`;
    if (scale === "badge") {
        return (
            <svg viewBox="0 0 32 32" className={className} aria-hidden>
                <defs>
                    <radialGradient id={id} cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor={pine} stopOpacity={0.35} />
                        <stop offset="70%" stopColor={pine} stopOpacity={0.08} />
                        <stop offset="100%" stopColor={pine} stopOpacity={0} />
                    </radialGradient>
                </defs>
                <circle cx={16} cy={16} r={14} fill={`url(#${id})`} />
                <circle cx={16} cy={16} r={6} fill={pine} fillOpacity={0.2} />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 400 300" className={className} preserveAspectRatio="none" aria-hidden>
            <defs>
                <radialGradient id={id} cx="55%" cy="35%" r="65%">
                    <stop offset="0%" stopColor={pine} stopOpacity={0.22} />
                    <stop offset="45%" stopColor={pine} stopOpacity={0.08} />
                    <stop offset="100%" stopColor={pine} stopOpacity={0} />
                </radialGradient>
            </defs>
            <rect x={0} y={0} width={400} height={300} fill={`url(#${id})`} />
            <ellipse cx={200} cy={120} rx={160} ry={100} fill={pine} fillOpacity={0.04} />
        </svg>
    );
}

function IntelligenceFrameShape({
    scale,
    className,
    pine,
    forge,
}: {
    scale: Scale;
    className: string;
    pine: string;
    forge: string;
}) {
    const notchPath =
        scale === "badge" ?
            "M4 28V8C4 4 7 2 11 2H18C22 2 24 4 24 6L28 2H28V28H4Z"
        :   "M16 280H384C396 280 404 272 404 260V40C404 28 396 20 384 20H120C108 20 100 12 96 0L88 20H16C4 20 0 12 0 0V260C0 272 8 280 16 280Z";

    if (scale === "badge") {
        return (
            <svg viewBox="0 0 28 28" className={className} aria-hidden>
                <path d={notchPath} fill={pine} fillOpacity={0.12} />
                <path
                    d="M4 28V8C4 4 7 2 11 2H18C22 2 24 4 24 6L28 2V28H4Z"
                    stroke={pine}
                    strokeWidth={1.4}
                    strokeOpacity={0.65}
                    fill="none"
                />
            </svg>
        );
    }

    if (scale === "crest") {
        return (
            <svg viewBox="0 0 240 32" className={className} preserveAspectRatio="none" aria-hidden>
                <path d="M0 28V8H200L220 0H240V28H0Z" fill={pine} fillOpacity={0.08} />
                <path d="M0 28V8H200L220 0H240V28" stroke={pine} strokeWidth={1.5} strokeOpacity={0.45} fill="none" />
            </svg>
        );
    }

    return (
        <svg viewBox="0 0 404 284" className={className} preserveAspectRatio="none" aria-hidden>
            <path d={notchPath} fill={pine} fillOpacity={0.05} />
            <path
                d="M16 280H384C396 280 404 272 404 260V40C404 28 396 20 384 20H120C108 20 100 12 96 0L88 20H16C4 20 0 12 0 0V260C0 272 8 280 16 280Z"
                stroke={pine}
                strokeWidth={1.75}
                strokeOpacity={0.4}
                fill="none"
            />
            <line x1={96} y1={0} x2={88} y2={20} stroke={forge} strokeWidth={1} strokeOpacity={0.25} />
        </svg>
    );
}

/** Inline BOS badge — shape only, no text required for recognition */
export function BosShapeBadge({ variant, size = 28 }: { variant: BosShapeVariant; size?: number }) {
    return (
        <div
            className="relative shrink-0"
            style={{ width: size, height: size }}
            aria-hidden
        >
            <BosShapeMark variant={variant} scale="badge" className="h-full w-full" />
        </div>
    );
}
