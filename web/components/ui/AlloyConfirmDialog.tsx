"use client";

/**
 * ALLOY'S CONFIRMATION — never the browser's.
 *
 * `window.confirm` shows "staging.workwithalloy.com says…" over the product, with the host name as the
 * author of the question. This is the platform's own dialog for the same moment: a title, the
 * consequence in plain words, and two named choices ("Keep tour scheduled" / "Record outcome") instead
 * of OK/Cancel.
 *
 * `useAlloyConfirm()` returns the dialog element to render and an async `confirm(...)` that resolves
 * true or false, so a flow that awaited `window.confirm` keeps its shape. The server's own guard stays
 * authoritative: this only decides whether to resubmit with the operator's confirmation.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";

export type AlloyConfirmRequest = {
    title: string;
    body: ReactNode;
    confirmLabel: string;
    /** `null` shows the single confirm button — an acknowledgement, not a choice. */
    cancelLabel?: string | null;
    /** "danger" for destructive choices; "default" otherwise. */
    tone?: "default" | "danger";
    testId?: string;
};

export function AlloyConfirmDialog({
    request,
    onResolve,
}: {
    request: AlloyConfirmRequest | null;
    onResolve: (confirmed: boolean) => void;
}) {
    const confirmRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        if (!request) return;
        confirmRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onResolve(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [request, onResolve]);

    if (!request || typeof document === "undefined") return null;
    const testId = request.testId ?? "alloy-confirm";
    return createPortal(
        <div
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-alloy-midnight/35 p-4 backdrop-blur-[1px]"
            role="presentation"
            onClick={() => onResolve(false)}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${testId}-title`}
                data-testid={testId}
                className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-alloy-stone/15 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 pb-5 pt-6">
                    <h2 id={`${testId}-title`} className="text-[17px] font-semibold tracking-tight text-alloy-midnight">
                        {request.title}
                    </h2>
                    <div className="mt-2 text-[13px] leading-relaxed text-alloy-midnight/70" data-testid={`${testId}-body`}>
                        {request.body}
                    </div>
                </div>
                <footer className="flex items-center justify-end gap-2 border-t border-alloy-stone/10 bg-alloy-stone/[0.04] px-6 py-4">
                    {request.cancelLabel === null ? null : (
                        <button
                            type="button"
                            onClick={() => onResolve(false)}
                            data-testid={`${testId}-cancel`}
                            className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                        >
                            {request.cancelLabel ?? "Cancel"}
                        </button>
                    )}
                    <button
                        type="button"
                        ref={confirmRef}
                        onClick={() => onResolve(true)}
                        data-testid={`${testId}-confirm`}
                        className={
                            request.tone === "danger"
                                ? "rounded-lg bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-rose-700"
                                : "rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white hover:opacity-90"
                        }
                    >
                        {request.confirmLabel}
                    </button>
                </footer>
            </div>
        </div>,
        document.body,
    );
}

/** `[dialog, confirm]` — render `dialog`; `await confirm({...})` resolves true (confirmed) or false. */
export function useAlloyConfirm(): [ReactNode, (request: AlloyConfirmRequest) => Promise<boolean>] {
    const [request, setRequest] = useState<AlloyConfirmRequest | null>(null);
    const resolver = useRef<((confirmed: boolean) => void) | null>(null);
    const confirm = useCallback((next: AlloyConfirmRequest) => {
        resolver.current?.(false);
        setRequest(next);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);
    const onResolve = useCallback((confirmed: boolean) => {
        const resolve = resolver.current;
        resolver.current = null;
        setRequest(null);
        resolve?.(confirmed);
    }, []);
    useEffect(() => () => resolver.current?.(false), []);
    return [<AlloyConfirmDialog key="alloy-confirm" request={request} onResolve={onResolve} />, confirm];
}
