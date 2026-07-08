"use client";

import type { ReactNode } from "react";

export type ProcessingStudioTab = "forms" | "packets" | "fields" | "branding";

/** Studio execution body — section tabs live in DigitalMailroomShell (Communications doctrine). */
export default function ProcessingStudioShell({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white" data-testid="processing-studio-shell">
            {children}
        </div>
    );
}

export function ProcessingStudioPlaceholder({ title, body }: { title: string; body: string }) {
    return (
        <div className="flex flex-1 items-center justify-center bg-white p-10">
            <div className="max-w-md text-center">
                <h3 className="text-[16px] font-semibold text-alloy-midnight">{title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-alloy-midnight/50">{body}</p>
            </div>
        </div>
    );
}
