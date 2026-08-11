"use client";

/**
 * Waitlist placement adjustment — opens the existing manual-position admin command
 * (POST /api/admin/placement-candidates/[id]/manual-position). No queue-local rank mutation.
 */

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRuntimeKernel } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { ATTENTION_SCOPE, type AttentionSource } from "@/lib/runtime/kernel/attention";
import { provisioningKey } from "@/lib/runtime/kernel/provisioning";

type Props = {
    placementCandidateId: string;
    /** Current operator-facing position label when known (e.g. "Position 1/1"). */
    currentPositionLabel?: string | null;
    childDisplayName?: string | null;
};

export function WaitlistPlacementAdjustControl({
    placementCandidateId,
    currentPositionLabel,
    childDisplayName,
}: Props) {
    const [open, setOpen] = useState(false);
    const titleId = useId();

    return (
        <>
            <button
                type="button"
                data-queue-row-waitlist-adjust
                data-placement-candidate-id={placementCandidateId}
                title="Adjust waitlist position"
                className="bg-transparent p-0 text-[10px] font-semibold leading-[13px] text-alloy-bend-pine underline decoration-alloy-bend-pine/35 underline-offset-2 hover:decoration-alloy-bend-pine"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(true);
                }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                Adjust
            </button>
            {open ? (
                <WaitlistPlacementAdjustModal
                    titleId={titleId}
                    placementCandidateId={placementCandidateId}
                    currentPositionLabel={currentPositionLabel}
                    childDisplayName={childDisplayName}
                    onClose={() => setOpen(false)}
                />
            ) : null}
        </>
    );
}

function WaitlistPlacementAdjustModal({
    titleId,
    placementCandidateId,
    currentPositionLabel,
    childDisplayName,
    onClose,
}: {
    titleId: string;
    placementCandidateId: string;
    currentPositionLabel?: string | null;
    childDisplayName?: string | null;
    onClose: () => void;
}) {
    const kernel = useRuntimeKernel();
    const [pinOrdinal, setPinOrdinal] = useState("1");
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    const refreshQueue = useCallback(() => {
        const current = kernel.attention.get();
        if (!current?.lens && !current?.target) {
            window.location.reload();
            return;
        }
        kernel.provisioning.invalidate(provisioningKey(current));
        const lens = current.lens ?? current.destination?.workViewId;
        if (lens) {
            kernel.attention.move({
                scope: ATTENTION_SCOPE.LENS,
                lens,
                source: "work_view_selection" satisfies AttentionSource,
            });
        } else {
            window.location.reload();
        }
    }, [kernel]);

    async function submit(action: "move" | "reset") {
        setBusy(true);
        setError(null);
        try {
            const body: Record<string, unknown> =
                action === "reset"
                    ? { action: "reset", reason: reason.trim() || "Reset manual waitlist position" }
                    : {
                          action: "move",
                          pin_ordinal: Number.parseInt(pinOrdinal, 10),
                          reason: reason.trim() || "Manual waitlist position adjustment",
                      };
            if (action === "move") {
                const n = Number.parseInt(pinOrdinal, 10);
                if (!Number.isFinite(n) || n < 1 || n > 999) {
                    setError("Enter a position between 1 and 999.");
                    setBusy(false);
                    return;
                }
            }
            const res = await fetch(
                `/api/admin/placement-candidates/${encodeURIComponent(placementCandidateId)}/manual-position`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) {
                setError(payload.error?.trim() || `Could not adjust position (${res.status})`);
                setBusy(false);
                return;
            }
            onClose();
            refreshQueue();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not adjust position");
            setBusy(false);
        }
    }

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-alloy-midnight-forge/35 p-4"
            data-waitlist-placement-adjust-modal
            onClick={onClose}
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="alloy-os-ucard w-full max-w-md overflow-hidden"
                data-waitlist-adjust-dialog="true"
                onClick={(e) => e.stopPropagation()}
                style={{
                    // Match Focus Panel cards exactly (border / radius / elevation).
                    border: "1px solid var(--alloy-os-fp-card-border, color-mix(in srgb, #273f52 30%, #dde3eb))",
                    borderRadius: "var(--alloy-os-fp-card-radius, 14px)",
                    boxShadow: "var(--alloy-os-fp-card-shadow, 0 1px 2px rgba(15,23,42,0.05), 0 8px 24px -12px rgba(15,23,42,0.12))",
                    background: "var(--alloy-os-fp-card-surface, #fff)",
                }}
            >
                <div
                    className="alloy-os-ucard__header border-b px-4 py-3"
                    style={{
                        borderColor:
                            "color-mix(in srgb, var(--alloy-os-bend-pine, #00a283) 18%, var(--alloy-os-border, #e5e9ef))",
                    }}
                >
                    <p
                        className="text-[10px] font-semibold uppercase tracking-[0.06em]"
                        style={{ color: "var(--alloy-os-bend-pine, #00a283)" }}
                    >
                        Waitlist
                    </p>
                    <h2
                        id={titleId}
                        className="mt-0.5 text-[15px] font-semibold text-alloy-midnight"
                    >
                        Adjust position
                    </h2>
                    <p className="mt-1 text-[12px] text-alloy-midnight/60">
                        {childDisplayName ? `${childDisplayName} · ` : null}
                        {currentPositionLabel?.trim() || "Placement ranking"}
                    </p>
                </div>
                <div className="alloy-os-ucard__body px-4 py-3">
                    <label className="block text-[11px] font-semibold text-alloy-midnight/70">
                        Hold position (pin ordinal)
                        <input
                            type="number"
                            min={1}
                            max={999}
                            value={pinOrdinal}
                            onChange={(e) => setPinOrdinal(e.target.value)}
                            className="mt-1 w-full rounded-[10px] border bg-white px-2.5 py-2 text-[13px] text-alloy-midnight outline-none focus:ring-2"
                            style={{
                                borderColor:
                                    "color-mix(in srgb, var(--alloy-os-midnight, #273f52) 22%, var(--alloy-os-border, #e5e9ef))",
                            }}
                            data-waitlist-adjust-pin-ordinal
                        />
                    </label>
                    <label className="mt-3 block text-[11px] font-semibold text-alloy-midnight/70">
                        Reason
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="mt-1 w-full rounded-[10px] border bg-white px-2.5 py-2 text-[13px] text-alloy-midnight outline-none focus:ring-2"
                            style={{
                                borderColor:
                                    "color-mix(in srgb, var(--alloy-os-midnight, #273f52) 22%, var(--alloy-os-border, #e5e9ef))",
                            }}
                            data-waitlist-adjust-reason
                        />
                    </label>
                    {error ? (
                        <p className="mt-2 text-[12px] font-medium text-alloy-ember" role="alert">
                            {error}
                        </p>
                    ) : null}
                </div>
                <div
                    className="alloy-os-ucard__footer flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3"
                    style={{
                        borderColor:
                            "color-mix(in srgb, var(--alloy-os-bend-pine, #00a283) 18%, var(--alloy-os-border, #e5e9ef))",
                        background: "color-mix(in srgb, var(--alloy-os-stone, #F4F6F9) 55%, #fff)",
                    }}
                >
                    <button
                        type="button"
                        className="rounded-[10px] border bg-white px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70 hover:text-alloy-bend-pine"
                        style={{
                            borderColor:
                                "color-mix(in srgb, var(--alloy-os-midnight, #273f52) 18%, var(--alloy-os-border, #e5e9ef))",
                        }}
                        onClick={onClose}
                        disabled={busy}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-[10px] border bg-white px-3 py-1.5 text-[12px] font-medium hover:bg-alloy-bend-pine/5"
                        style={{
                            borderColor:
                                "color-mix(in srgb, var(--alloy-os-bend-pine, #00a283) 35%, var(--alloy-os-border, #e5e9ef))",
                            color: "var(--alloy-os-bend-pine, #00a283)",
                        }}
                        onClick={() => void submit("reset")}
                        disabled={busy}
                        data-waitlist-adjust-reset
                    >
                        Reset pin
                    </button>
                    <button
                        type="button"
                        className="rounded-[10px] border px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
                        style={{
                            background: "var(--alloy-os-bend-pine, #00a283)",
                            borderColor: "var(--alloy-os-bend-pine, #00a283)",
                        }}
                        onClick={() => void submit("move")}
                        disabled={busy}
                        data-waitlist-adjust-submit
                    >
                        {busy ? "Saving…" : "Apply position"}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
