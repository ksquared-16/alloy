"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { dispatchOpportunityQueueUpdatedBroadcast } from "@/lib/admin/opportunityQueueRefreshEvent";
import type { QueueRowPlacementWaitlistCandidateVm } from "@/lib/ui-v2/workspace-types";

type Props = {
    row: QueueRowPlacementWaitlistCandidateVm;
    layout?: "inline" | "gutter";
};

type PendingAction = "adjust" | "reset";

export function QueueRowPlacementManualOrderControls({ row, layout = "inline" }: Props) {
    const [pending, setPending] = useState<PendingAction | null>(null);
    const [desiredPosition, setDesiredPosition] = useState(1);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    const sectionTotal = row.runtimePositionTotal ?? 1;
    const currentPosition = row.runtimePosition ?? sectionTotal;

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!pending) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [pending]);

    useEffect(() => {
        if (!pending) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setPending(null);
                setNote("");
                setError(null);
            }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [pending]);

    const positionOptions = useMemo(
        () => Array.from({ length: Math.max(1, sectionTotal) }, (_, i) => i + 1),
        [sectionTotal]
    );

    const close = useCallback(() => {
        setPending(null);
        setNote("");
        setError(null);
    }, []);

    const refreshQueue = useCallback(() => {
        dispatchOpportunityQueueUpdatedBroadcast("placement_manual_order");
    }, []);

    const openAdjust = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setDesiredPosition(currentPosition);
        setPending("adjust");
        setNote("");
        setError(null);
    }, [currentPosition]);

    const openReset = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setPending("reset");
        setNote("");
        setError(null);
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
            if (pending === "reset") {
                const res = await fetch(`/api/admin/placement-candidates/${row.placementCandidateId}/manual-position`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "reset",
                        reason,
                        from_position: currentPosition,
                        position_total: sectionTotal,
                        section_key: row.runtimePositionSectionKey ?? null,
                    }),
                });
                const data = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(data.error || "Could not clear adjustment");
            } else {
                const toPosition = Math.min(sectionTotal, Math.max(1, Math.trunc(desiredPosition)));
                const res = await fetch(`/api/admin/placement-candidates/${row.placementCandidateId}/manual-position`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "move",
                        reason,
                        pin_ordinal: toPosition,
                        from_position: currentPosition,
                        to_position: toPosition,
                        position_total: sectionTotal,
                        section_key: row.runtimePositionSectionKey ?? null,
                    }),
                });
                const data = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(data.error || "Could not save adjustment");
            }

            close();
            refreshQueue();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save adjustment");
        } finally {
            setBusy(false);
        }
    }, [
        pending,
        note,
        row.placementCandidateId,
        row.runtimePositionSectionKey,
        currentPosition,
        sectionTotal,
        desiredPosition,
        close,
        refreshQueue,
    ]);

    if (sectionTotal < 1) return null;

    const currentPositionLabel = `${currentPosition}/${sectionTotal}`;

    const modal =
        pending && mounted
            ? createPortal(
                  <div
                      className="adminv2-ws-manual-order-dialog-backdrop"
                      role="presentation"
                      onMouseDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          e.preventDefault();
                          e.stopPropagation();
                          close();
                      }}
                  >
                      <div
                          className="adminv2-ws-manual-order-dialog"
                          role="dialog"
                          aria-modal="true"
                          aria-label="Adjust waitlist position"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                      >
                          <h3 className="adminv2-ws-manual-order-dialog__title">
                              {pending === "reset" ? "Clear adjustment" : "Adjust position"}
                          </h3>
                          <p className="adminv2-ws-manual-order-dialog__context">
                              {row.childDisplayName} · {row.cohortLabel}
                          </p>
                          {pending === "adjust" ? (
                              <>
                                  <p className="adminv2-ws-manual-order-dialog__position-line">
                                      Current position: <strong>{currentPositionLabel}</strong>
                                  </p>
                                  <label className="adminv2-ws-manual-order-dialog__field">
                                      <span className="adminv2-ws-manual-order-dialog__field-label">
                                          Desired position
                                      </span>
                                      <select
                                          className="adminv2-ws-manual-order-dialog__select"
                                          value={desiredPosition}
                                          onChange={(e) => setDesiredPosition(Number.parseInt(e.target.value, 10))}
                                      >
                                          {positionOptions.map((n) => (
                                              <option key={n} value={n}>
                                                  {n} / {sectionTotal}
                                              </option>
                                          ))}
                                      </select>
                                  </label>
                                  <div className="adminv2-ws-manual-order-dialog__shortcuts">
                                      <button
                                          type="button"
                                          className="adminv2-ws-manual-order-dialog__shortcut"
                                          disabled={currentPosition === 1}
                                          onClick={() => setDesiredPosition(1)}
                                      >
                                          Move to top
                                      </button>
                                  </div>
                              </>
                          ) : (
                              <p className="adminv2-ws-manual-order-dialog__position-line">
                                  Clear manual adjustment for position {currentPositionLabel}?
                              </p>
                          )}
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
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      close();
                                  }}
                              >
                                  Cancel
                              </button>
                              <button
                                  type="button"
                                  className="adminv2-ws-manual-order-dialog__btn adminv2-ws-manual-order-dialog__btn--primary"
                                  disabled={busy || !note.trim()}
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      void submit();
                                  }}
                              >
                                  {busy
                                      ? "Saving…"
                                      : pending === "reset"
                                        ? "Clear adjustment"
                                        : "Apply"}
                              </button>
                          </div>
                      </div>
                  </div>,
                  document.body
              )
            : null;

    if (layout === "gutter") {
        return (
            <>
                <div
                    className="adminv2-ws-queue-manual-order"
                    data-queue-placement="manual-order"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button type="button" className="adminv2-ws-queue-manual-order__adjust" onClick={openAdjust}>
                        Adjust position
                    </button>
                </div>
                {modal}
            </>
        );
    }

    return (
        <>
            <div
                className="adminv2-ws-queue-waitlist-left-meta"
                data-queue-placement="waitlist-left-meta"
                onClick={(e) => e.stopPropagation()}
            >
                {row.runtimePositionLabel ? (
                    <span
                        className="adminv2-ws-queue-waitlist-left-meta__position"
                        title={row.runtimePositionHelp ?? undefined}
                    >
                        {row.runtimePositionLabel}
                    </span>
                ) : null}
                <button
                    type="button"
                    className="adminv2-ws-queue-waitlist-left-meta__adjust"
                    title="Adjust waitlist position"
                    onClick={openAdjust}
                >
                    Adjust position
                </button>
                {row.hasManualPositionAdjustment ? (
                    <button
                        type="button"
                        className="adminv2-ws-queue-waitlist-left-meta__reset"
                        title="Clear adjustment"
                        onClick={openReset}
                    >
                        Clear adjustment
                    </button>
                ) : null}
            </div>
            {modal}
        </>
    );
}
