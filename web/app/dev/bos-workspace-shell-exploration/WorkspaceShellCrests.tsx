"use client";

import type { WorkspaceShellVariant } from "./workspaceShellTokens";
import { BEND_PINE, FORGE_DEEP, MIDNIGHT_FORGE } from "./workspaceShellTokens";

/**
 * Top-edge crest decorations for BOS workspace SHELL only.
 * Sides and bottom remain rectangular — interior content unchanged.
 */
export function WorkspaceTopCrest({
    variant,
    className = "",
}: {
    variant: WorkspaceShellVariant;
    className?: string;
}) {
    const pine = BEND_PINE;

    if (variant === "cloud") {
        return (
            <svg
                viewBox="0 0 800 56"
                className={className}
                preserveAspectRatio="none"
                aria-hidden
            >
                <path
                    d="M0 56V20C0 8 8 0 20 0H180C200 0 215 -4 230 8C245 18 260 12 275 6C290 0 310 2 325 10C340 18 360 14 380 6C400 -2 420 0 440 8C460 16 480 12 500 4C520 -4 540 0 560 8C580 16 600 12 620 6C640 0 660 2 675 10C690 18 710 14 730 6C750 -2 770 0 780 8C790 12 800 10 800 20V56H0Z"
                    fill={FORGE_DEEP}
                />
                <path
                    d="M0 56V20C0 8 8 0 20 0H180C200 0 215 -4 230 8C245 18 260 12 275 6C290 0 310 2 325 10C340 18 360 14 380 6C400 -2 420 0 440 8C460 16 480 12 500 4C520 -4 540 0 560 8C580 16 600 12 620 6C640 0 660 2 675 10C690 18 710 14 730 6C750 -2 770 0 780 8"
                    stroke={pine}
                    strokeWidth={2}
                    strokeOpacity={0.45}
                    fill="none"
                />
            </svg>
        );
    }

    if (variant === "organic-contour") {
        return (
            <svg
                viewBox="0 0 800 64"
                className={className}
                preserveAspectRatio="none"
                aria-hidden
            >
                <path
                    d="M0 64V16C0 4 12 0 24 0H200C220 0 235 -6 252 10C268 24 285 16 300 6C315 -4 335 0 352 12C368 24 388 18 408 8C428 -2 448 0 468 10C488 20 508 14 528 4C548 -6 568 0 588 10C608 20 628 14 648 4C668 -6 688 0 708 8C728 16 748 10 768 2C784 -4 800 0 800 12V64H0Z"
                    fill={FORGE_DEEP}
                />
                <path
                    d="M0 64V16C0 4 12 0 24 0H200C220 0 235 -6 252 10C268 24 285 16 300 6C315 -4 335 0 352 12C368 24 388 18 408 8C428 -2 448 0 468 10C488 20 508 14 528 4C548 -6 568 0 588 10C608 20 628 14 648 4C668 -6 688 0 708 8C728 16 748 10 768 2C784 -4 800 0 800 12"
                    stroke={pine}
                    strokeWidth={2.5}
                    strokeOpacity={0.55}
                    fill="none"
                />
            </svg>
        );
    }

    if (variant === "sculpted-alloy") {
        return (
            <svg
                viewBox="0 0 800 52"
                className={className}
                preserveAspectRatio="none"
                aria-hidden
            >
                <path d="M0 52V12H280L310 0H490L520 12H800V52H0Z" fill={FORGE_DEEP} />
                <path
                    d="M0 52V12H280L310 0H490L520 12H800V52"
                    stroke={pine}
                    strokeWidth={2}
                    strokeOpacity={0.5}
                    fill="none"
                />
                <line x1={310} y1={0} x2={280} y2={12} stroke={MIDNIGHT_FORGE} strokeWidth={1} strokeOpacity={0.4} />
                <line x1={490} y1={0} x2={520} y2={12} stroke={MIDNIGHT_FORGE} strokeWidth={1} strokeOpacity={0.4} />
            </svg>
        );
    }

    if (variant === "dynamic-island") {
        return (
            <svg
                viewBox="0 0 800 48"
                className={className}
                preserveAspectRatio="none"
                aria-hidden
            >
                <path
                    d="M40 48V20C40 8 48 0 60 0H740C752 0 760 8 760 20V48H40Z"
                    fill={FORGE_DEEP}
                    rx={0}
                />
                <path
                    d="M60 0H740C756 0 768 10 768 24C768 38 756 48 740 48H60C44 48 32 38 32 24C32 10 44 0 60 0"
                    stroke={pine}
                    strokeWidth={2}
                    strokeOpacity={0.5}
                    fill="none"
                    transform="translate(8, -4)"
                />
            </svg>
        );
    }

    return null;
}

/** Closed-state entry point per shell variant */
export function WorkspaceClosedEntry({
    variant,
}: {
    variant: WorkspaceShellVariant;
}) {
    if (variant === "dynamic-island") {
        return (
            <div
                className="mx-auto flex items-center gap-2 rounded-full px-5 py-2.5"
                style={{
                    background: FORGE_DEEP,
                    border: `2px solid ${BEND_PINE}`,
                    boxShadow: `0 8px 32px rgba(0,162,131,0.25), 0 2px 8px rgba(24,39,58,0.2)`,
                    width: "fit-content",
                }}
            >
                <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: BEND_PINE, boxShadow: `0 0 8px ${BEND_PINE}` }}
                />
                <span className="text-[12px] font-semibold text-white">BOS · Create lead</span>
                <span className="text-[11px] text-white/45">Tap to open</span>
            </div>
        );
    }

    const label =
        variant === "cloud" ? "BOS Workspace"
        : variant === "organic-contour" ? "BOS Territory"
        : variant === "intelligence-halo" ? "BOS Intelligence"
        : "BOS Chamber";

    return (
        <div
            className="mx-auto flex items-center gap-3 overflow-hidden rounded-lg"
            style={{
                background: FORGE_DEEP,
                border: `1px solid rgba(0,162,131,0.35)`,
                boxShadow: "0 4px 20px rgba(24,39,58,0.15)",
                width: "min(420px, 90%)",
            }}
        >
            <div className="relative h-10 w-full max-w-[120px] shrink-0">
                <WorkspaceTopCrest variant={variant} className="absolute inset-0 h-full w-full" />
            </div>
            <div className="flex flex-1 items-center justify-between py-2 pr-3">
                <span className="text-[12px] font-semibold text-white">{label}</span>
                <span className="text-[11px] font-medium" style={{ color: BEND_PINE }}>
                    Open
                </span>
            </div>
        </div>
    );
}
