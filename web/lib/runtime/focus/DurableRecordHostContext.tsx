"use client";

/**
 * THE IN-WORKSPACE DURABLE RECORD HOST — the seam, not the surface.
 *
 * `intent: "durable_record"` had exactly one realization: `router.push` to `/workspace/record/…`.
 * That is correct for a cold entry — the address IS the intent there (Art 2.4) — and wrong from
 * inside a workspace, where it unmounts everything the operator had set up. Roster → Children →
 * Lennon destroyed the section, the cohort, the server-paged offset, the local filter, the site and
 * the scroll position, and returning meant a browser Back that re-mounted Roster at its defaults.
 *
 * So the adapter gains a SECOND realization, chosen the same way its operational sibling already
 * chooses between three: by where the caller stands.
 *
 *   inside a workspace that hosts records  → the host opens it over the workspace, which stays mounted
 *   anywhere else                          → the canonical address, exactly as before
 *
 * ── WHY A CONTEXT AND NOT A MODULE FLAG ──
 *
 * The adapter must KNOW whether a host exists, not guess. A module-scoped "is a host mounted"
 * counter answers globally and would be wrong the moment two workspaces are open or one unmounts
 * mid-gesture — and being wrong means the gesture silently does nothing, which is the exact defect
 * class this adapter exists to prevent. A context answers for the caller's own tree, which is the
 * only scope where the question has a single answer.
 *
 * Absent a provider the hook returns null and the adapter routes. Nothing is inferred.
 */

import { createContext, useContext } from "react";

import type { DurableSubjectType } from "@/lib/runtime/focus/durableRecordRoute";

export type DurableRecordHostRequest = {
    subjectType: DurableSubjectType;
    subjectId: string;
    /** The card to land on (ASPECT). Absent = the grain's default composition. */
    cardKey?: string | null;
    /** The business context to open on, when the caller expressed a preference. */
    contextKey?: string | null;
};

export type DurableRecordHostApi = {
    open: (request: DurableRecordHostRequest) => void;
};

const DurableRecordHostContext = createContext<DurableRecordHostApi | null>(null);

export const DurableRecordHostProvider = DurableRecordHostContext.Provider;

/**
 * The host for this tree, or null.
 *
 * Null is an ANSWER — "nothing here can hold a record over the workspace" — and the caller must
 * route instead. It is never a reason to do nothing.
 */
export function useDurableRecordHostOptional(): DurableRecordHostApi | null {
    return useContext(DurableRecordHostContext);
}

/**
 * Fired when a durable record host closes, so the list underneath can refresh the row.
 *
 * `changed` is the whole point: a record that was only LOOKED at must not cost the surface a
 * re-query, and a record that was EDITED must not leave a stale row behind. The host reports what
 * actually happened rather than the listener guessing from the fact that it closed.
 */
export const DURABLE_RECORD_CLOSED_EVENT = "alloy:durable-record-closed";

export type DurableRecordClosedDetail = {
    subjectType: DurableSubjectType;
    subjectId: string;
    changed: boolean;
};

export function dispatchDurableRecordClosed(detail: DurableRecordClosedDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(DURABLE_RECORD_CLOSED_EVENT, { detail }));
}
