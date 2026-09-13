"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The one Access-history list. Three placements, one component, one API, one presenter.
 *
 * The organization Security chapter, the selected user and the selected role all render this with a
 * different filter. They are not three views of the same data — they are the same view, filtered,
 * which is why none of them can drift into its own idea of what an access change means.
 *
 * ── WHY THIS RENDERS SENTENCES IT DID NOT COMPOSE ──
 *
 * Every field here arrives already rendered: `summary`, `changes`, the actor and subject labels,
 * including the "Deleted role (key)" fallbacks. The client deliberately does not interpret
 * `previous_state`, the capability taxonomy or W-17 replacement semantics — doing so would make it a
 * second presenter, and its first disagreement with the role editor would be invisible to both.
 */

export type AccessHistoryEntryView = {
    eventId: string;
    committedAt: string;
    actorDisplay: string;
    subjectDisplay: string;
    roleDisplay: string | null;
    summary: string;
    changes: { area: string; from: string; to: string }[];
    origin: string;
    correlationId: string | null;
    technical: {
        commandKey: string;
        subjectType: string;
        subjectId: string;
        previousState: string | null;
        newState: string;
        contextPayload: Record<string, unknown> | null;
    };
};

type Cursor = { cursor_at: string; cursor_id: string } | null;

export type AccessHistoryListProps = {
    /** Narrows to one person's access events. Never widens the organization. */
    subjectUserId?: string | null;
    /** Narrows to one role. Never widens the organization. */
    roleKey?: string | null;
    pageSize?: number;
    testId: string;
    emptyMessage: string;
    /**
     * Bumped by the surrounding surface when IT has just committed an access change.
     *
     * The feed loads on mount, which is correct for a card the operator navigates to, and wrong for
     * the one case where the operator changes access WITHOUT leaving the screen the card is on: the
     * selected-person workspace, where the role and scope editors sit directly above this card. The
     * certification caught it saying "No access changes have been recorded for this person yet."
     * one second after the operator changed that person's roles — the four truthful states are only
     * truthful if `empty` still means empty by the time it is read.
     */
    refreshToken?: number;
};

function formatWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function AccessHistoryList({
    subjectUserId = null,
    roleKey = null,
    pageSize = 10,
    testId,
    emptyMessage,
    refreshToken = 0,
}: AccessHistoryListProps) {
    const [entries, setEntries] = useState<AccessHistoryEntryView[]>([]);
    const [cursor, setCursor] = useState<Cursor>(null);
    /*
     * Four states, and `loading` is the initial one on purpose. W-57 removed a history tab that cost
     * a click to learn nothing; rendering "No access changes yet" before the first response would be
     * the same lie in a new place — it would claim an answer the surface does not have.
     */
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);

    const load = useCallback(
        async (next: Cursor) => {
            const params = new URLSearchParams({ limit: String(pageSize) });
            // There is no org parameter to send. The server takes it from the session, so these two
            // can only ever narrow.
            if (subjectUserId) params.set("subject", subjectUserId);
            if (roleKey) params.set("role", roleKey);
            if (next) {
                params.set("cursor_at", next.cursor_at);
                params.set("cursor_id", next.cursor_id);
            }

            const res = await fetch(`/api/admin/access/history?${params.toString()}`, {
                cache: "no-store",
            });
            if (!res.ok) {
                throw new Error(
                    res.status === 403
                        ? "You do not have access to view access history."
                        : `Access history could not be loaded (${res.status}).`
                );
            }
            return (await res.json()) as {
                entries: AccessHistoryEntryView[];
                next_cursor: Cursor;
            };
        },
        [pageSize, roleKey, subjectUserId]
    );

    useEffect(() => {
        let cancelled = false;
        setStatus("loading");
        setError(null);
        load(null)
            .then((page) => {
                if (cancelled) return;
                setEntries(page.entries);
                setCursor(page.next_cursor);
                setStatus("ready");
            })
            .catch((e: Error) => {
                if (cancelled) return;
                // An error must not render as an empty feed: "nothing happened" and "we could not
                // find out" are different answers, and only one of them is reassuring.
                setError(e.message);
                setStatus("error");
            });
        return () => {
            cancelled = true;
        };
        // `refreshToken` is a signal, not an input to `load`: when the surrounding surface commits an
        // access change it changes, and this feed re-reads from the server rather than keeping the
        // answer it fetched before the change happened.
    }, [load, refreshToken]);

    const loadMore = async () => {
        if (!cursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const page = await load(cursor);
            // Keyset paging, so appending cannot duplicate: the next page starts strictly after the
            // last row this one holds.
            setEntries((prev) => [...prev, ...page.entries]);
            setCursor(page.next_cursor);
        } catch (e) {
            setError((e as Error).message);
            setStatus("error");
        } finally {
            setLoadingMore(false);
        }
    };

    if (status === "loading") {
        return (
            <p className="text-sm text-alloy-midnight/55" data-testid={`${testId}-loading`}>
                Loading access history…
            </p>
        );
    }

    if (status === "error") {
        return (
            <p className="text-sm text-alloy-ember" data-testid={`${testId}-error`}>
                {error ?? "Access history could not be loaded."}
            </p>
        );
    }

    if (!entries.length) {
        return (
            <p className="text-sm text-alloy-midnight/55" data-testid={`${testId}-empty`}>
                {emptyMessage}
            </p>
        );
    }

    return (
        <div className="space-y-2" data-testid={testId}>
            <ul className="space-y-2">
                {entries.map((entry) => (
                    <li
                        key={entry.eventId}
                        className="rounded-md border border-alloy-stone/15 px-3 py-2"
                        data-testid={`${testId}-event`}
                        data-command-key={entry.technical.commandKey}
                    >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="text-sm text-alloy-midnight" data-testid={`${testId}-summary`}>
                                {entry.summary}
                            </span>
                            <span className="text-[11px] text-alloy-midnight/45">
                                {formatWhen(entry.committedAt)}
                            </span>
                        </div>

                        {/*
                          * ONLY WHEN THEY ADD SOMETHING. The summary already states the first change
                          * in full — "… changed Portal only — Financials from No access to View" —
                          * so for a single-change event the row beneath it repeated the same
                          * sentence word for word, twenty lines where ten would do. The summary's
                          * "and N more" is exactly the signal that the list is worth showing.
                          */}
                        {entry.changes.length > 1 ?
                            <ul className="mt-1 space-y-0.5">
                                {entry.changes.map((c) => (
                                    <li
                                        key={`${entry.eventId}-${c.area}`}
                                        className="text-[12px] text-alloy-midnight/65"
                                        data-testid={`${testId}-change`}
                                    >
                                        {c.area}: {c.from} → {c.to}
                                    </li>
                                ))}
                            </ul>
                        :   null}

                        {/*
                          * Keys, ids and the command name live one disclosure away. They are what a
                          * support engineer needs and what an operator never should have to read to
                          * understand what happened.
                          */}
                        <button
                            type="button"
                            className="mt-1 text-[11px] text-alloy-midnight/45 underline-offset-2 hover:underline"
                            onClick={() => setExpanded(expanded === entry.eventId ? null : entry.eventId)}
                            data-testid={`${testId}-detail-toggle`}
                        >
                            {expanded === entry.eventId ? "Hide technical detail" : "Technical detail"}
                        </button>

                        {expanded === entry.eventId ?
                            <dl
                                className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-alloy-midnight/55"
                                data-testid={`${testId}-detail`}
                            >
                                <dt>Event</dt>
                                <dd className="font-mono">{entry.eventId}</dd>
                                <dt>Command</dt>
                                <dd className="font-mono">{entry.technical.commandKey}</dd>
                                <dt>Origin</dt>
                                <dd>{entry.origin}</dd>
                                {entry.correlationId ?
                                    <>
                                        <dt>Correlation</dt>
                                        <dd className="font-mono">{entry.correlationId}</dd>
                                    </>
                                :   null}
                                <dt>Before</dt>
                                <dd className="font-mono break-all">{entry.technical.previousState || "—"}</dd>
                                <dt>After</dt>
                                <dd className="font-mono break-all">{entry.technical.newState || "—"}</dd>
                            </dl>
                        :   null}
                    </li>
                ))}
            </ul>

            {cursor ?
                <button
                    type="button"
                    className="text-xs text-alloy-midnight/65 underline-offset-2 hover:underline disabled:opacity-50"
                    onClick={loadMore}
                    disabled={loadingMore}
                    data-testid={`${testId}-load-more`}
                >
                    {loadingMore ? "Loading…" : "Load more"}
                </button>
            :   null}
        </div>
    );
}
