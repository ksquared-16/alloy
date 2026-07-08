"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";

export default function ProcessingCollapsibleInspectorSection({
    title,
    subtitle,
    defaultOpen = false,
    open: controlledOpen,
    onOpenChange,
    accent = false,
    testId,
    children,
}: {
    title: string;
    subtitle?: string;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    accent?: boolean;
    testId?: string;
    children: ReactNode;
}) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const open = controlledOpen ?? internalOpen;
    const setOpen = (next: boolean) => {
        onOpenChange?.(next);
        if (controlledOpen === undefined) setInternalOpen(next);
    };

    return (
        <section data-testid={testId} className="border-b border-alloy-stone/10 last:border-b-0">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-full items-start justify-between gap-3 py-3 text-left"
                aria-expanded={open}
            >
                <span>
                    <span
                        className={clsx(
                            "block text-[11px] font-semibold uppercase tracking-[0.08em]",
                            accent && open ? "text-alloy-bend-pine" : "text-alloy-midnight/45"
                        )}
                    >
                        {title}
                    </span>
                    {subtitle ? (
                        <span className="mt-0.5 block text-[11px] leading-snug text-alloy-midnight/45">{subtitle}</span>
                    ) : null}
                </span>
                <span className="shrink-0 pt-0.5 text-[11px] text-alloy-midnight/30">{open ? "▾" : "▸"}</span>
            </button>
            {open ? <div className="pb-4">{children}</div> : null}
        </section>
    );
}
