"use client";

/**
 * THE DURABLE RECORD SURFACE — attention on a record that no queue holds.
 *
 * It renders `OpportunityFocusPanelModeGrid`: the SAME grid the Work Unit's inline panel renders,
 * with the same card renderers and the same published-composition machinery. There is no second
 * Focus Panel implementation here, no drawer, no Records panel, and no synthetic Work Unit — the
 * grid is source-agnostic by contract, so a model produced by the durable composer renders exactly
 * as one produced by the queue.
 *
 * ── WHY THIS IS NOT `InlineOpportunityFocusPanel` ──
 *
 * That component's 600 lines are selection state, payload reveal, hold-prior-payload swap
 * continuity, save coordination and action registry — machinery for a surface where the operator
 * moves between queue rows. A durable record has none of that: the model is fully composed before
 * it arrives (`phase: "settled"`), there is no row to swap to, and nothing settles later. Reusing
 * that component would have meant giving it a mode where most of it is inert.
 *
 * What IS shared is the part that matters: the grid, the cards, the composition.
 *
 * ── LOADING AND FAILURE ARE STATES, NOT BLANKS ──
 *
 * A record that cannot be composed says so. `not_found` covers both "no such record" and "not
 * reachable by this operator" deliberately — the resolver's contract is that those are
 * indistinguishable, and telling them apart here would leak the record's existence.
 */

import { useCallback, useEffect, useState } from "react";

import OpportunityFocusPanelModeGrid from "@/components/admin/focusPanel/OpportunityFocusPanelModeGrid";
import {
    decodeDurableRecordModel,
    type DurableRecordModelWire,
} from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableRecordModelWire";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";
import type { DurableSubjectType } from "@/lib/runtime/focus/durableRecordRoute";

type LoadState =
    | { status: "loading" }
    | { status: "ready"; model: FocusPanelWorkModeModel }
    | { status: "not_found" }
    | { status: "error"; message: string };

export default function DurableRecordSurface({
    subjectType,
    subjectId,
    /** The card the gesture asked to land on (ASPECT). Absent = the grain's default composition. */
    cardKey,
}: {
    subjectType: DurableSubjectType;
    subjectId: string;
    cardKey?: string | null;
}) {
    const [state, setState] = useState<LoadState>({ status: "loading" });

    const load = useCallback(async () => {
        setState({ status: "loading" });
        try {
            const res = await fetch(
                `/api/admin/durable-record?subject_type=${encodeURIComponent(subjectType)}&subject_id=${encodeURIComponent(subjectId)}`,
                { credentials: "include" },
            );
            if (res.status === 404) {
                setState({ status: "not_found" });
                return;
            }
            const json = (await res.json().catch(() => null)) as
                | { ok?: boolean; model?: DurableRecordModelWire; message?: string }
                | null;
            if (!res.ok || !json?.ok || !json.model) {
                setState({ status: "error", message: json?.message ?? "Could not open this record." });
                return;
            }
            setState({ status: "ready", model: decodeDurableRecordModel(json.model) });
        } catch (e) {
            setState({
                status: "error",
                message: e instanceof Error ? e.message : "Could not open this record.",
            });
        }
    }, [subjectType, subjectId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (state.status === "loading") {
        return (
            <div className="px-6 py-10 text-[13px] text-alloy-midnight/55" data-durable-record="loading">
                Opening record…
            </div>
        );
    }

    if (state.status === "not_found") {
        return (
            <div className="px-6 py-10" data-durable-record="not-found">
                <p className="text-[14px] font-medium text-alloy-midnight/80">Record not available</p>
                <p className="mt-1 max-w-[54ch] text-[12.5px] text-alloy-midnight/55">
                    This record either does not exist or is outside your access.
                </p>
            </div>
        );
    }

    if (state.status === "error") {
        return (
            <div className="px-6 py-10" data-durable-record="error">
                <p className="text-[14px] font-medium text-alloy-midnight/80">Could not open this record</p>
                <p className="mt-1 max-w-[54ch] text-[12.5px] text-alloy-midnight/55">{state.message}</p>
                <button
                    type="button"
                    className="mt-3 rounded border border-admin-border px-3 py-1.5 text-[12px] font-medium"
                    onClick={() => void load()}
                    data-durable-record-retry="true"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            data-durable-record="ready"
            data-durable-record-subject-type={state.model.subject.type}
            data-durable-record-subject-id={state.model.subject.id}
        >
            <OpportunityFocusPanelModeGrid
                model={state.model}
                // Drill tabs belong to the queue-hosted panel's drawer-era cards; a durable record
                // composes none of them, so there is nothing to select.
                onSelectTab={() => {}}
                requestedCardFocus={
                    cardKey ? { card_key: cardKey, subject_key: state.model.subject.id } : null
                }
            />
        </div>
    );
}
