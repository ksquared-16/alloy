"use client";

/** Canonical empty state — centered, muted, midnight/stone. */

import type { ReactNode } from "react";

export default function WorkspaceEmptyState({
    title,
    body,
    icon,
    action,
    tone = "default",
}: {
    title: string;
    body?: string;
    icon?: ReactNode;
    action?: ReactNode;
    tone?: "default" | "muted";
}) {
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            {icon ? <div className="mb-2 text-alloy-juniper/80">{icon}</div> : null}
            <div className={`text-[12.5px] font-medium ${tone === "muted" ? "text-alloy-midnight/40" : "text-alloy-midnight/70"}`}>
                {title}
            </div>
            {body ? <p className="mx-auto mt-1 max-w-[18rem] text-[11px] leading-relaxed text-alloy-midnight/45">{body}</p> : null}
            {action ? <div className="mt-3">{action}</div> : null}
        </div>
    );
}
