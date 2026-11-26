"use client";

/**
 * A RECORD, OPENED OVER THE WORKSPACE THAT ASKED FOR IT.
 *
 * Roster → Children → Lennon must not cost the operator their Roster. The section's cohort, its
 * server-paged offset, its local filter, the site and the scroll position are all component state,
 * and a route push unmounted every one of them; returning was a browser Back that re-mounted Roster
 * at its defaults.
 *
 * So the workspace body is never unmounted here. It stays exactly where it was, rendered underneath
 * and made inert, and the record is layered over it. Closing reveals the same surface — not a
 * re-created one — which is why "the same cohort, the same page, the same scroll" is a structural
 * property rather than a set of things this component remembers to restore.
 *
 * ── THIS IS A PLACEMENT, NOT A PRODUCT ──
 *
 * It renders `DurableRecordSurface`, which renders `OpportunityFocusPanelModeGrid` — the same grid,
 * the same card renderers, the same composition machinery the Work Unit's inline panel uses. There
 * is no second record runtime here, no drawer, and no detail view of its own. Everything this file
 * owns is: where the surface sits, how it is dismissed, and what the list underneath is told
 * afterwards.
 *
 * ── WHY IT IS NOT `AdminV2WorkspaceBosModalShell` ──
 *
 * That shell is a PEER of the workspace (it portals to `document.body`, dims the whole operational
 * band and takes `aria-modal`). A record opened from inside Roster is not a peer of Roster — it sits
 * within it, Roster is meant to remain visible at the edges, and nesting one body-portal modal
 * inside another is the z-index defect that made buttons in Processing do nothing. This layers
 * inside the workspace's own stacking context instead, which is why it needs no portal and no
 * global z-index at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import DurableRecordSurface from "@/components/presentation/durableRecord/DurableRecordSurface";
import {
    dispatchDurableRecordClosed,
    DurableRecordHostProvider,
    type DurableRecordHostApi,
    type DurableRecordHostRequest,
} from "@/lib/runtime/focus/DurableRecordHostContext";

type OpenRecord = DurableRecordHostRequest & { nonce: number };

export default function WorkspaceDurableRecordHost({
    children,
    /** Marker for tests/diagnostics, e.g. `roster`. */
    hostKey,
    presentation = "full",
    surfaceKey,
}: {
    children: ReactNode;
    hostKey: string;
    /**
     * HOW a durable record is realized over this host.
     *
     * `full`        the whole composition — every card the grain declares, in the panel grid. What a
     *               record-first runtime needs when the record IS the destination.
     * `contextual`  a chooser and exactly ONE card, centered and bounded. What Operations needs,
     *               because there the record is never the destination: the operator came to see one
     *               thing about a person and should be able to say which.
     *
     * Two presentations of one composition, not two records. Both read the same contexts from the
     * same producer and render the same cards; they differ only in how much is shown at once and
     * where it sits.
     */
    presentation?: "full" | "contextual";
    /**
     * What the workspace UNDERNEATH is currently showing — e.g. `work:children`, `studio:patterns`.
     *
     * An open record is a statement about the surface it was opened from. The host deliberately does
     * not unmount that surface, so when the operator moved from Children to Staff the card about
     * Lennon stayed centered over a list of staff — a record answering a question nobody was still
     * asking. Changing this closes it.
     *
     * Omitted, nothing closes on its own: a host with one surface has no such transition, and
     * inventing one for it would close records for no reason.
     */
    surfaceKey?: string;
}) {
    const [record, setRecord] = useState<OpenRecord | null>(null);
    /**
     * Whether anything was WRITTEN while the record was open.
     *
     * A ref rather than state: it must not re-render the host (which would re-render the workspace
     * body underneath for no reason), and it is read exactly once, at close.
     *
     * Set by a successful write on the contextual card. The list underneath reads it on close, so a
     * record that was only LOOKED at costs no re-query and one that was EDITED cannot leave a stale
     * row behind — a distinction the listener could not make by inferring it from the close.
     */
    const changedRef = useRef(false);
    const nonceRef = useRef(0);

    const api = useMemo<DurableRecordHostApi>(
        () => ({
            open: (request) => {
                const subjectId = request.subjectId.trim();
                if (!subjectId) return;
                changedRef.current = false;
                // The nonce makes re-opening the SAME record a real change, so the surface
                // re-composes rather than showing a stale model from the previous visit.
                nonceRef.current += 1;
                setRecord({ ...request, subjectId, nonce: nonceRef.current });
            },
        }),
        [],
    );

    const onRecordChanged = useCallback(() => {
        changedRef.current = true;
    }, []);

    const close = useCallback(() => {
        setRecord((current) => {
            if (current) {
                // The list underneath refreshes the row only when something actually changed. A
                // record that was merely LOOKED at must not cost a re-query, and one that was
                // EDITED must not leave a stale row — so the host reports what happened rather
                // than the listener inferring it from the close.
                dispatchDurableRecordClosed({
                    subjectType: current.subjectType,
                    subjectId: current.subjectId,
                    changed: changedRef.current,
                });
            }
            return null;
        });
    }, []);

    /*
     * The surface underneath changed, so the record over it is no longer an answer to anything.
     *
     * `close()` rather than a bare clear, because the list that is being left still needs to hear
     * whether the record was edited — a stale row is stale whether the operator dismissed the card
     * or navigated away from it.
     *
     * Guarded on `record` so this never fires on mount or on an ordinary re-render.
     */
    const surfaceKeyRef = useRef(surfaceKey);
    useEffect(() => {
        if (surfaceKeyRef.current === surfaceKey) return;
        surfaceKeyRef.current = surfaceKey;
        if (record) close();
    }, [surfaceKey, record, close]);

    useEffect(() => {
        if (!record) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // Stop the workspace modal's own Escape handler from closing the WHOLE workspace out
            // from under a record the operator only meant to dismiss.
            e.preventDefault();
            e.stopPropagation();
            close();
        };
        // Capture phase, for the same reason: the workspace shell listens on `window` too, and
        // whichever handler runs first wins.
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [record, close]);

    return (
        <DurableRecordHostProvider value={api}>
            <div className="relative flex min-h-0 flex-1 flex-col" data-durable-record-host={hostKey}>
                {/*
                 * The workspace, still mounted. `inert` (with aria-hidden for browsers that lack
                 * it) keeps it out of the tab order and off the accessibility tree while a record
                 * is over it — visible context, not an interactive surface.
                 */}
                <div
                    className="flex min-h-0 flex-1 flex-col"
                    {...(record ? { inert: true, "aria-hidden": true } : {})}
                    data-durable-record-host-body="true"
                >
                    {children}
                </div>

                {record ? (
                    <div
                        className={`absolute inset-0 z-10 flex bg-alloy-midnight/10 ${
                            presentation === "contextual" ? "items-center justify-center p-4" : "flex-col"
                        }`}
                        data-durable-record-overlay="true"
                        onMouseDown={(e) => {
                            if (e.target === e.currentTarget) close();
                        }}
                    >
                        <div
                            role="dialog"
                            aria-label="Record"
                            className={
                                presentation === "contextual"
                                    ? /*
                                       * CENTERED, BOUNDED — AND UNBOXED. The canonical card carries
                                       * its own border and elevation, so wrapping it in a second
                                       * white panel put a box around a box and demoted the card to
                                       * content. The container here is pure placement: width bound,
                                       * height bound, its own scroll. The close affordance floats
                                       * in the header row the surface renders.
                                       */
                                      "m-auto flex max-h-[min(88vh,44rem)] w-[min(94vw,40rem)] min-h-0 flex-col overflow-y-auto"
                                    : "m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-alloy-stone/25 bg-white shadow-lg"
                            }
                            data-durable-record-panel={record.subjectType}
                            data-durable-record-panel-subject={record.subjectId}
                            data-durable-record-presentation={presentation}
                        >
                            {presentation === "contextual" ? (
                                <div className="flex shrink-0 items-center justify-end">
                                    <button
                                        type="button"
                                        onClick={close}
                                        className="rounded-full bg-white/90 p-1 text-alloy-midnight/50 shadow-sm ring-1 ring-alloy-stone/20 hover:text-alloy-midnight/80"
                                        aria-label="Close record"
                                        data-durable-record-close="true"
                                    >
                                        <X className="h-4 w-4" aria-hidden strokeWidth={1.9} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex shrink-0 items-center justify-end border-b border-alloy-stone/15 px-2 py-1.5">
                                    <button
                                        type="button"
                                        onClick={close}
                                        className="rounded p-1 text-alloy-midnight/45 hover:bg-alloy-stone/10 hover:text-alloy-midnight/70"
                                        aria-label="Close record"
                                        data-durable-record-close="true"
                                    >
                                        <X className="h-4 w-4" aria-hidden strokeWidth={1.9} />
                                    </button>
                                </div>
                            )}
                            <DurableRecordSurface
                                key={record.nonce}
                                subjectType={record.subjectType}
                                subjectId={record.subjectId}
                                cardKey={record.cardKey ?? null}
                                contextKey={record.contextKey ?? null}
                                presentation={presentation}
                                onRecordChanged={onRecordChanged}
                                onRequestClose={close}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
        </DurableRecordHostProvider>
    );
}
