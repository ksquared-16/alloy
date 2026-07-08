"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function ProcessingAlloyDialog({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    testId,
    labelledById = "processing-alloy-dialog-title",
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    testId?: string;
    labelledById?: string;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div
            className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-alloy-midnight/35 p-4 backdrop-blur-[1px]"
            role="presentation"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-labelledby={labelledById}
                aria-modal="true"
                data-testid={testId}
                className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-alloy-stone/15 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="border-b border-alloy-stone/10 px-6 pb-4 pt-6">
                    <h2 id={labelledById} className="text-[17px] font-semibold tracking-tight text-alloy-midnight">
                        {title}
                    </h2>
                    {subtitle ? <p className="mt-1.5 text-[13px] leading-snug text-alloy-midnight/50">{subtitle}</p> : null}
                </header>
                <div className="px-6 py-5">{children}</div>
                {footer ? <footer className="flex items-center justify-end gap-2 border-t border-alloy-stone/10 bg-alloy-stone/[0.04] px-6 py-4">{footer}</footer> : null}
            </div>
        </div>,
        document.body
    );
}
