"use client";

import type { CSSProperties, ReactNode } from "react";

import "@/app/adminV2/components/bos/identity/bosIdentity.css";
import { BosHeader } from "@/app/adminV2/components/bos/identity/BosHeader";

type Props = {
    children: ReactNode;
    header?: ReactNode;
    showHeader?: boolean;
    title?: string;
    subtitle?: string;
    className?: string;
    style?: CSSProperties;
    "data-testid"?: string;
};

/**
 * BOS workspace shell — discovered atmospheric perimeter + content slot.
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
            className={`bos-workspace-shell relative overflow-hidden rounded-[1.35rem] border border-alloy-stone/[0.08] bg-white shadow-[0_16px_48px_rgba(39,63,82,0.07)] ${className}`.trim()}
            style={style}
            data-bos-workspace-shell="true"
            data-testid={dataTestId}
        >
            <div className="bos-workspace-shell__perimeter" aria-hidden />
            <div className="bos-workspace-shell__atmosphere" aria-hidden />

            <div className="relative z-[1] flex min-h-0 flex-col">
                {showHeader ?
                    <div className="border-b border-alloy-stone/[0.08] px-5 py-4">
                        {header ?? <BosHeader title={title} subtitle={subtitle} size="md" />}
                    </div>
                :   null}
                <div className="min-h-0 flex-1">{children}</div>
            </div>
        </div>
    );
}
