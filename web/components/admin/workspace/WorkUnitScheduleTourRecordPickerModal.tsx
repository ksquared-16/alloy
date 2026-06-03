"use client";

import { useEffect, useState } from "react";
import { searchScheduleTourAccessibleRecords } from "@/lib/admin/actions/scheduleTourRecordPickerSearch";
import type { ScheduleTourPickerRowVm } from "@/lib/admin/actions/scheduleTourWorkUnitActions";

const SEARCH_DEBOUNCE_MS = 280;

export default function WorkUnitScheduleTourRecordPickerModal({
    open,
    siteId,
    opportunityEntityLabel,
    onDismiss,
    onSelectOpportunityId,
}: {
    open: boolean;
    siteId?: string | null;
    /** Configured opportunities singular label (e.g. Lead). */
    opportunityEntityLabel?: string | null;
    onDismiss: () => void;
    onSelectOpportunityId: (opportunityId: string) => void;
}) {
    const [query, setQuery] = useState("");
    const [rows, setRows] = useState<ScheduleTourPickerRowVm[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setRows([]);
            setSearchError(null);
            setLoading(false);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const token = query.trim();
        if (token.length < 2 && !/^[\da-f-]{36}$/i.test(token)) {
            setRows([]);
            setSearchError(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setSearchError(null);
        const handle = window.setTimeout(() => {
            void searchScheduleTourAccessibleRecords({
                query: token,
                siteId,
                opportunityEntityLabel,
                limit: 20,
            })
                .then((next) => {
                    if (cancelled) return;
                    setRows(next);
                    setLoading(false);
                })
                .catch(() => {
                    if (cancelled) return;
                    setRows([]);
                    setSearchError("Search failed. Try again.");
                    setLoading(false);
                });
        }, SEARCH_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [open, query, siteId, opportunityEntityLabel]);

    if (!open) return null;

    const hint =
        query.trim().length < 2 && !/^[\da-f-]{36}$/i.test(query.trim())
            ? "Type at least 2 characters to search records you can access."
            : loading
              ? "Searching…"
              : searchError
                ? searchError
                : rows.length === 0
                  ? "No records match your search."
                  : null;

    return (
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-alloy-midnight/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-tour-record-picker-title"
            data-testid="schedule-tour-record-picker-modal"
        >
            <div className="max-h-[min(32rem,85vh)] w-full max-w-lg overflow-hidden rounded-xl border border-alloy-forge/15 bg-white shadow-lg">
                <div className="border-b border-alloy-forge/10 px-4 py-3">
                    <h2
                        id="schedule-tour-record-picker-title"
                        className="text-sm font-semibold text-alloy-midnight"
                    >
                        Select a record to schedule a tour
                    </h2>
                    <label className="mt-3 block">
                        <span className="sr-only">Search records</span>
                        <input
                            type="search"
                            className="w-full rounded-md border border-alloy-forge/15 px-3 py-2 text-sm text-alloy-midnight placeholder:text-alloy-midnight/40"
                            placeholder="Search records..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            data-testid="schedule-tour-record-picker-search"
                            autoFocus
                        />
                    </label>
                </div>
                <ul className="max-h-72 overflow-y-auto py-1" role="listbox" aria-label="Accessible records">
                    {hint ? (
                        <li className="px-4 py-6 text-center text-xs text-alloy-midnight/55">{hint}</li>
                    ) : (
                        rows.map((row) => (
                            <ScheduleTourPickerRow
                                key={row.opportunityId}
                                row={row}
                                onSelect={() => onSelectOpportunityId(row.opportunityId)}
                            />
                        ))
                    )}
                </ul>
                <div className="flex justify-end border-t border-alloy-forge/10 px-4 py-2">
                    <button
                        type="button"
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                        onClick={onDismiss}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

function ScheduleTourPickerRow({
    row,
    onSelect,
}: {
    row: ScheduleTourPickerRowVm;
    onSelect: () => void;
}) {
    return (
        <li role="option">
            <button
                type="button"
                className="block w-full px-4 py-2.5 text-left hover:bg-alloy-stone/10"
                onClick={onSelect}
                data-testid={`schedule-tour-pick-${row.opportunityId}`}
            >
                <div className="text-sm font-medium text-alloy-midnight">{row.primaryLabel}</div>
                {row.contactLine ? (
                    <div className="mt-0.5 text-xs text-alloy-midnight/60">{row.contactLine}</div>
                ) : null}
                {row.statusLine ? (
                    <div className="mt-0.5 text-xs text-alloy-midnight/45">{row.statusLine}</div>
                ) : null}
            </button>
        </li>
    );
}
