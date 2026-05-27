"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

type Props = {
    row: QueueRowPlacementWaitlistCandidateVm;
    indexInSection: number;
    sectionSize: number;
};

type PendingMove = "up" | "down" | "reset";

function targetPinOrdinal(indexInSection: number, direction: "up" | "down"): number {
    const newIndex = direction === "up" ? indexInSection - 1 : indexInSection + 1;
    return newIndex + 1;
}

export function QueueRowPlacementManualOrderControls({ row, indexInSection, sectionSize }: Props) {
    const [pending, setPending] = useState<PendingMove | null>(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!pending) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [pending]);

    const canMoveUp = indexInSection > 0;
    const canMoveDown = indexInSection >= 0 && indexInSection < sectionSize - 1;

    const close = useCallback(() => {
        setPending(null);
        setNote("");
        setError(null);
    }, []);

    const refreshQueue = useCallback(() => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("adminv2:opportunity-updated"));
        }
    }, []);

    const submit = useCallback(async () => {
        if (!pending) return;
        const reason = note.trim();
        if (!reason) {
            setError("Please add a note explaining this adjustment.");
            return;
        }

        setBusy(true);
        setError(null);
        try {
            const body: Record<string, unknown> =
                pending === "reset"
                    ? { action: "reset", reason }
                    : {
                          action: "move",
                          reason,
                          pin_ordinal: targetPinOrdinal(indexInSection, pending),
                          direction: pending,
                      };

            const res = await fetch(`/api/admin/placement-candidates/${row.placementCandidateId}/manual-position`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = (await res.json()) as { error?: string };
            if (!res.ok) throw new Error(data.error || "Could not save adjustment");

            close();
            refreshQueue();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save adjustment");
        } finally {
            setBusy(false);
        }
    }, [pending, note, indexInSection, row.placementCandidateId, close, refreshQueue]);

    const openMove = useCallback((direction: "up" | "down", e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setPending(direction);
        setNote("");
        setError(null);
    }, []);

    const openReset = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setPending("reset");
        setNote("");
        setError(null);
    }, []);

    if (sectionSize < 2 && !row.hasManualPositionAdjustment) return null;

    const modal =
        pending && mounted
            ? createPortal(
                  <div
                      className="adminv2-ws-manual-order-dialog-backdrop"
                      role="presentation"
                      onClick={close}
                  >
                      <div
                          className="adminv2-ws-manual-order-dialog"
                          role="dialog"
                          aria-modal="true"
                          aria-label="Manual waitlist adjustment"
                          onClick={(e) => e.stopPropagation()}
                      >
                          <h3 className="adminv2-ws-manual-order-dialog__title">
                              {pending === "reset" ? "Reset manual adjustment" : "Adjust waitlist position"}
                          </h3>
                          <p className="adminv2-ws-manual-order-dialog__context">
                              {row.childDisplayName} · {row.cohortLabel}
                              {pending === "up" ? " · Move up" : pending === "down" ? " · Move down" : ""}
                          </p>
                          <label className="adminv2-ws-manual-order-dialog__field">
                              <span className="adminv2-ws-manual-order-dialog__field-label">
                                  Why are you adjusting this waitlist position?
                              </span>
                              <textarea
                                  className="adminv2-ws-manual-order-dialog__textarea"
                                  value={note}
                                  rows={3}
                                  autoFocus
                                  onChange={(e) => setNote(e.target.value)}
                                  placeholder="Required for audit"
                              />
                          </label>
                          {error ? <p className="adminv2-ws-manual-order-dialog__error">{error}</p> : null}
                          <div className="adminv2-ws-manual-order-dialog__actions">
                              <button
                                  type="button"
                                  className="adminv2-ws-manual-order-dialog__btn adminv2-ws-manual-order-dialog__btn--cancel"
                                  onClick={close}
                              >
                                  Cancel
                              </button>
                              <button
                                  type="button"
                                  className="adminv2-ws-manual-order-dialog__btn adminv2-ws-manual-order-dialog__btn--primary"
                                  disabled={busy || !note.trim()}
                                  onClick={() => void submit()}
                              >
                                  {busy ? "Saving…" : pending === "reset" ? "Reset adjustment" : "Apply adjustment"}
                              </button>
                          </div>
                      </div>
                  </div>,
                  document.body
              )
            : null;

    return (
        <>
            <div
                className="adminv2-ws-queue-manual-order"
                data-queue-placement="manual-order"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="adminv2-ws-queue-manual-order__pill" title="Adjust order">
                    <button
                        type="button"
                        className="adminv2-ws-queue-manual-order__btn"
                        aria-label="Move up"
                        title="Move up"
                        disabled={!canMoveUp}
                        onClick={(e) => openMove("up", e)}
                    >
                        ↑
                    </button>
                    <button
                        type="button"
                        className="adminv2-ws-queue-manual-order__btn"
                        aria-label="Move down"
                        title="Move down"
                        disabled={!canMoveDown}
                        onClick={(e) => openMove("down", e)}
                    >
                        ↓
                    </button>
                    <span className="adminv2-ws-queue-manual-order__hint" aria-hidden>
                        Adjust
                    </span>
                </div>
                {row.hasManualPositionAdjustment ? (
                    <button
                        type="button"
                        className="adminv2-ws-queue-manual-order__reset"
                        title="Reset adjustment"
                        onClick={openReset}
                    >
                        Reset
                    </button>
                ) : null}
            </div>
            {modal}
        </>
    );
}
