"use client";

import type { CSSProperties, ReactNode } from "react";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";
import { BosHorizon } from "@/app/adminV2/components/bos/identity/BosHorizon";

type Props = {
    children: ReactNode;
    /** Optional header override; defaults to {@link BosHeader}. */
    header?: ReactNode;
    showHeader?: boolean;
    title?: string;
    subtitle?: string;
    className?: string;
    style?: CSSProperties;
    "data-testid"?: string;
};

/**
 * BOS workspace shell — cloud perimeter, horizon, mark header, content slot.
 * Visual shell only; no execution or routing behavior.
 */
export function BosWorkspaceShell({
    children,
    header,
    showHeader = true,
    title,
    subtitle,
    className = "",
    style,
    "data-testid": dataTestId = "bos-workspace-shell",
}: Props) {
    return (
        <div
            className={`bos-workspace-shell relative overflow-hidden rounded-[1.35rem] border border-alloy-stone/10 bg-white shadow-[0_24px_64px_rgba(39,63,82,0.12)] ${className}`.trim()}
            style={style}
            data-bos-workspace-shell="true"
            data-testid={dataTestId}
        >
            <div className="bos-workspace-shell__atmosphere" aria-hidden />
            <div className="bos-workspace-shell__perimeter" aria-hidden />

            <div className="relative z-[1] flex min-h-0 flex-col">
                {showHeader ?
                    <div className="border-b border-alloy-stone/10 bg-gradient-to-b from-[#00A283]/[0.05] to-white px-5 py-4">
                        <div className="mb-3 flex justify-center">
                            <BosHorizon size="lg" className="w-24 opacity-80" />
                        </div>
                        {header ?? <BosHeader title={title} subtitle={subtitle} size="md" />}
                    </div>
                :   null}
                <div className="min-h-0 flex-1">{children}</div>
            </div>
        </div>
    );
}
