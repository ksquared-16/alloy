"use client";

/**
 * Record attention counts — outstanding work and unread messages for one record.
 *
 * Answers the question an operator asks while looking at a family: "is anything waiting on me here?"
 * without making them open the Work Items workspace to find out.
 *
 * ── WHY TWO NUMBERS AND NOT ONE ──
 *
 * A combined "3" cannot be acted on. Unread mail and outstanding operational work are answered in
 * different places by different people — one is read in Communications, the other is completed in
 * Current Work or Work Items — so a single unexplained badge tells the operator something is wrong
 * without telling them what to do. They stay separate, and they move independently.
 *
 * ── AUTHORITATIVE SOURCES ONLY ──
 *
 * Work comes from operational_tasks for the record, which is the same row Current Work and Work
 * Items both read — so a Business Process work item is counted once, not twice, and completing it
 * anywhere drops the count. Unread comes from the Communications conversation projection, which
 * already computes unread as inbound messages without a read row FOR THE VIEWER. Neither number is
 * inferred from sender or recipient identity.
 */

import { useCallback, useEffect, useState } from "react";

import { fetchOperationalTasks, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    getCommandCenterCacheSnapshot,
    prefetchCommandCenterConversations,
    subscribeCommandCenterCache,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import { ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH } from "@/lib/adminV2/opportunityDrawerTaskEvents";

export type RecordAttentionCounts = {
    /**
     * Open operational work on this record — manual and Business Process alike.
     *
     * NULL MEANS NOT YET KNOWN, and that is the whole point of the type. This was `number`
     * initialised to 0, so "the request has not answered" and "there is authoritatively no work"
     * rendered identically: the chip is absent in both cases, and the operator cannot tell "nothing
     * is waiting on me" from "we have not looked yet". This file's own header says the two must not
     * look the same; its initial state said otherwise.
     */
    work: number | null;
    /** Unread inbound messages on this record's conversations, for the viewing operator. */
    unread: number;
    loading: boolean;
};

/** No record selected: nothing is known, and nothing is claimed. */
const EMPTY: RecordAttentionCounts = { work: null, unread: 0, loading: false };

type TaskLike = { status?: string | null };

/** Open work only. A completed or canceled row is not something waiting on the operator. */
export function countOpenWork(tasks: TaskLike[] | null | undefined): number {
    if (!Array.isArray(tasks)) return 0;
    return tasks.filter((t) => (t.status ?? "").trim() === "open").length;
}

/**
 * THE LISTING'S ANSWER, WITH "COULD NOT TELL" KEPT DISTINCT FROM "NONE".
 *
 * `countOpenWork(null)` returns 0, which is correct for its own job — it counts an array — and
 * dangerous at this boundary, because the thing being counted is the RESULT OF A NETWORK READ.
 * Passing an unavailable listing straight into it turns UNKNOWN into KNOWN_ZERO, and the operator
 * is shown an authoritative "no work" for a record whose work nobody managed to read.
 *
 * The transport failures were already handled: a non-OK response and a thrown fetch both keep the
 * last known value. The gap was a SUCCESSFUL response whose body carried no task array. `readJson`
 * swallows a parse failure and returns `{}` (`res.json().catch(() => ({}))`), so an unparseable or
 * shape-drifted 200 arrived here as `tasks: undefined` and counted as zero — the one path where a
 * read that failed still produced a confident number.
 *
 * So the array itself is the evidence. Present means the listing answered and its length is the
 * truth, zero included. Absent means unavailable, whatever the status code claimed.
 *
 * Returns `null` for UNKNOWN/UNAVAILABLE; the caller decides whether that means "keep the last
 * known value" or "report nothing known". It must never mean zero.
 */
export function openWorkCountFromListing(
    ok: boolean,
    body: { tasks?: TaskLike[] } | null | undefined,
): number | null {
    if (!ok) return null;
    if (!Array.isArray(body?.tasks)) return null;
    return countOpenWork(body.tasks);
}

type ConversationLike = {
    primary_entity_id?: string | null;
    unread_count?: number | null;
    unread?: number | null;
};

/** Unread across every conversation whose primary entity is this record. */
export function countUnreadForEntity(
    conversations: ConversationLike[] | null | undefined,
    entityId: string,
): number {
    if (!Array.isArray(conversations) || !entityId) return 0;
    return conversations.reduce((sum, c) => {
        if ((c.primary_entity_id ?? "") !== entityId) return sum;
        const n = c.unread_count ?? c.unread ?? 0;
        return sum + (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
}

export function useRecordAttentionCounts(entityId: string | null | undefined): RecordAttentionCounts {
    /*
     * ONE RESPONSE, ONE STATE COMMIT.
     *
     * `work` and `loading` were separate useState calls set on either side of an await —
     * `setWork(n)` inside the load, `setLoading(false)` in its `.finally()`. Across the await those
     * are different turns, so one response produced TWO renders about 1ms apart. Measured on
     * deployed staging that is exactly what the Work chip did: the same node, same parent, appended
     * in two adjacent observer batches (168/169, 173/174), which the metric scored as a
     * post-complete authoritative structure change.
     *
     * Holding them in ONE object means the response commits once and the chip is inserted once.
     */
    const [state, setState] = useState<{ work: number | null; loading: boolean }>({
        work: null,
        loading: false,
    });
    const { work, loading } = state;
    const [unread, setUnread] = useState(0);

    const id = entityId?.trim() || "";

    const loadWork = useCallback(async () => {
        if (!id) return;
        try {
            const res = await fetchOperationalTasks(id);
            const json = await readJson<{ tasks?: TaskLike[] }>(res);
            // One decision, one place: a listing that did not answer yields null, never zero.
            // Refused, errored or shape-drifted: keep whatever was last known.
            const counted = openWorkCountFromListing(res.ok, json);
            if (counted === null) {
                setState((prev) => ({ work: prev.work, loading: false }));
                return;
            }
            setState({ work: counted, loading: false });
        } catch {
            // A count that cannot be read stays at its last known value rather than reporting zero:
            // "no work" and "could not tell" must not look the same to an operator.
            setState((prev) => ({ work: prev.work, loading: false }));
        }
    }, [id]);

    useEffect(() => {
        if (!id) {
            setState({ work: null, loading: false });
            setUnread(0);
            return;
        }
        // The load commits work AND loading together, so `.finally(setLoading(false))` — the second
        // render — is deliberately gone.
        setState((prev) => ({ work: prev.work, loading: true }));
        void loadWork();
    }, [id, loadWork]);

    // Any authoritative write to this record's work re-reads the count.
    useEffect(() => {
        if (!id) return;
        const onRefresh = () => void loadWork();
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
    }, [id, loadWork]);

    useEffect(() => {
        if (!id) return;
        const read = () => {
            const snap = getCommandCenterCacheSnapshot();
            const next = countUnreadForEntity(snap?.conversations as ConversationLike[] | undefined, id);
            /*
             * ONLY WHEN IT CHANGED.
             *
             * The command-center cache notifies subscribers whenever it settles, including with an
             * unchanged snapshot, and that notify lands immediately after the work count commits.
             * Writing the same number scheduled a state update that changed nothing. Returning
             * `prev` from the updater lets React bail out instead.
             *
             * STATED CAREFULLY: this is NOT claimed to fix the duplicate Work-chip append. That
             * defect is still unexplained — an earlier confident diagnosis (setWork/setLoading
             * across the await) was wrong, and a local probe of this notify measures extra
             * RENDERS, which is not the same thing as a DOM re-insertion: React performs one
             * render before bailing out anyway, and a render whose memoised chip array is
             * unchanged need not re-append anything. This guard stands on its own merit — do not
             * write state that did not change — and the duplicate remains open.
             *
             * This is not memoisation around a correctness problem — `unread` and `work` are
             * genuinely independent authorities (conversations vs operational tasks), so they keep
             * separate state; what is fixed is writing a value that did not change.
             */
            setUnread((prev) => (prev === next ? prev : next));
        };
        read();
        const unsubscribe = subscribeCommandCenterCache(read);
        void prefetchCommandCenterConversations();
        return unsubscribe;
    }, [id]);

    if (!id) return EMPTY;
    return { work, unread, loading };
}
