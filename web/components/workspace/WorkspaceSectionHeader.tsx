"use client";

/** Canonical workspace header (title + subtitle) atop a work area. White, midnight text. */

import type { ReactNode } from "react";
import { WS_TITLEBAR } from "./workspaceTokens";

export default function WorkspaceSectionHeader({
    title,
    subtitle,
    right,
}: {
    title: string;
    subtitle?: string;
    right?: ReactNode;
}) {
    return (
        <div className={`flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 ${WS_TITLEBAR}`}>
            <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] text-alloy-midnight">{title}</div>
                {subtitle ? <div className="mt-0.5 truncate text-[11px] text-alloy-midnight/55">{subtitle}</div> : null}
            </div>
            {right ? <div className="shrink-0">{right}</div> : null}
        </div>
    );
}
