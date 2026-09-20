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
            if (!res.ok) {
                // Refused or errored: stop loading, keep whatever was last known. Never zero.
                setState((prev) => ({ work: prev.work, loading: false }));
                return;
            }
            setState({ work: countOpenWork(json.tasks), loading: false });
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
            setUnread(countUnreadForEntity(snap?.conversations as ConversationLike[] | undefined, id));
        };
        read();
        const unsubscribe = subscribeCommandCenterCache(read);
        void prefetchCommandCenterConversations();
        return unsubscribe;
    }, [id]);

    if (!id) return EMPTY;
    return { work, unread, loading };
}
