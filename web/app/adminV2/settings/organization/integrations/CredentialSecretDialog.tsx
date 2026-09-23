"use client";

/**
 * The one and only time a credential secret is visible.
 *
 * ── WHY A MODAL ──
 *
 * This used to be a panel injected into the middle of Installation detail. That put the single most
 * consequential string in the product into the normal flow of a page the operator was already
 * scrolling, next to six other cards competing for the same attention — and the secret cannot be
 * recovered if it is missed. A centered dialog takes the decision out of the page: copy it, or
 * deliberately dismiss it.
 *
 * ── THE SECRET RULE, UNCHANGED ──
 *
 * The secret lives in React state for exactly as long as this dialog is open. It is never written
 * to localStorage, sessionStorage, a cookie, the URL, a log line or an analytics call, and Done
 * drops it from state — after which nothing can read it back, because the server kept only a hash.
 * That is why Done is destructive rather than decorative, and why the copy affordance is prominent
 * rather than polite.
 */

import { Check, Copy, KeyRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";

export type RevealedCredential = {
    secret: string;
    clientId?: string;
    overlapUntil?: string;
    kind: "issued" | "rotated";
};

export function CredentialSecretDialog({
    revealed,
    onDone,
}: {
    revealed: RevealedCredential;
    onDone: () => void;
}) {
    const doneRef = useRef<HTMLButtonElement | null>(null);
    const dialogRef = useRef<HTMLDivElement | null>(null);

    /*
     * Focus lands on Done, not on the secret.
     *
     * Done is the only control that ends the dialog, so it is where a keyboard user should start
     * and where focus should be recoverable from. The secret itself is selectable text; making it
     * the focus target would put the most sensitive string in the product one stray keystroke from
     * being replaced in a screen reader's buffer.
     */
    useEffect(() => {
        doneRef.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                // Stop the workspace shell's own Escape handler from closing the whole workspace
                // out from under a dialog the operator only meant to dismiss.
                event.preventDefault();
                event.stopPropagation();
                onDone();
                return;
            }
            if (event.key !== "Tab") return;
            /*
             * Keep Tab inside the dialog. Without this, tabbing walks out into the Installation
             * page behind the overlay — where every control is inert but still focusable, so the
             * operator loses the dialog without closing it and cannot reach Done again.
             */
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [onDone]);

    if (typeof document === "undefined") return null;

    const title = revealed.kind === "rotated" ? "Credential rotated" : "Credential issued";

    // Portaled to body at the platform's nested-overlay z: the floating assistant is portaled
    // there too, and a dialog it can cover is a dialog whose Done button does nothing.
    return createPortal(
        <div
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            className="fixed inset-0 flex items-center justify-center bg-alloy-midnight/35 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="credential-secret-dialog-title"
            data-testid="credential-secret-reveal"
        >
            <div
                ref={dialogRef}
                className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-xl border border-alloy-stone/30 bg-white shadow-xl"
            >
                <header className="flex items-start justify-between gap-3 border-b border-alloy-stone/25 px-4 py-3">
                    <span className="flex items-center gap-2">
                        <span
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-alloy-bend-pine/[0.10] text-[#007d68]"
                            aria-hidden
                        >
                            <KeyRound className="h-3.5 w-3.5" strokeWidth={1.9} />
                        </span>
                        <h2 id="credential-secret-dialog-title" className="config-typo-workspace-title">
                            {title}
                        </h2>
                    </span>
                    <button
                        type="button"
                        onClick={onDone}
                        aria-label="Close"
                        className="rounded p-1 text-alloy-midnight/50 hover:bg-alloy-stone/20"
                        data-testid="credential-secret-close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="space-y-3 px-4 py-3.5">
                    {revealed.clientId && (
                        <CredentialValue
                            label="Client ID"
                            value={revealed.clientId}
                            testId="credential-client-id"
                            valueTestId="credential-client-id-value"
                            copyTestId="credential-client-id-copy"
                        />
                    )}

                    <CredentialValue
                        label="Client secret — shown once"
                        value={revealed.secret}
                        emphasis
                        testId="credential-secret"
                        valueTestId="credential-secret-value"
                        copyTestId="credential-secret-copy"
                    />

                    <p className="text-[12.5px] leading-[1.65] text-alloy-midnight/75">
                        Copy this secret now. Alloy cannot show it again. If it is lost, rotate the
                        credential to issue a new one.
                    </p>

                    {revealed.overlapUntil && (
                        <p
                            className="rounded-lg border border-alloy-blue/20 bg-alloy-blue/[0.05] px-2.5 py-2 text-[12px] leading-[1.6] text-alloy-midnight/80"
                            data-testid="credential-rotation-overlap"
                        >
                            The previous secret keeps working until{" "}
                            {revealed.overlapUntil.slice(0, 16).replace("T", " ")}. Deploy this one
                            before then.
                        </p>
                    )}
                </div>

                <footer className="flex justify-end gap-2 border-t border-alloy-stone/25 px-4 py-3">
                    <button
                        ref={doneRef}
                        type="button"
                        className="config-primary-btn config-primary-btn--sm"
                        data-testid="credential-secret-dismiss"
                        onClick={onDone}
                    >
                        Done
                    </button>
                </footer>
            </div>
        </div>,
        document.body,
    );
}

/** A value the operator must carry out of this dialog, with the affordance that carries it. */
function CredentialValue({
    label,
    value,
    emphasis = false,
    testId,
    valueTestId,
    copyTestId,
}: {
    label: string;
    value: string;
    emphasis?: boolean;
    testId: string;
    valueTestId: string;
    copyTestId: string;
}) {
    const [copied, setCopied] = useState(false);

    const copy = useCallback(() => {
        // No fallback that writes the value anywhere else. If the clipboard is unavailable the
        // operator selects the text; a "helpful" hidden input or a data attribute would be a second
        // place the secret exists.
        void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
    }, [value]);

    return (
        <div data-testid={testId}>
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-alloy-midnight/45">{label}</p>
            <div className="mt-1 flex items-stretch gap-1.5">
                <code
                    className={`min-w-0 flex-1 break-all rounded-lg border px-2.5 py-2 font-mono text-[12px] ${
                        emphasis ?
                            "border-alloy-bend-pine/30 bg-alloy-bend-pine/[0.05] text-alloy-midnight"
                        :   "border-alloy-forge/12 bg-alloy-stone/50 text-alloy-midnight/85"
                    }`}
                    data-testid={valueTestId}
                >
                    {value}
                </code>
                <button
                    type="button"
                    onClick={copy}
                    data-testid={copyTestId}
                    aria-label={`Copy ${label}`}
                    className={`inline-flex shrink-0 items-center gap-1.5 self-stretch rounded-lg px-2.5 text-[12px] font-semibold transition ${
                        emphasis ?
                            "bg-[#007d68] text-white hover:bg-[#00694f]"
                        :   "border border-alloy-forge/12 bg-white text-alloy-midnight hover:border-alloy-bend-pine/40 hover:text-[#007d68]"
                    }`}
                >
                    {copied ?
                        <><Check className="h-3.5 w-3.5" aria-hidden /> Copied</>
                    :   <><Copy className="h-3.5 w-3.5" aria-hidden /> Copy</>}
                </button>
            </div>
        </div>
    );
}
