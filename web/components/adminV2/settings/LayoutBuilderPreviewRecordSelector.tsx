"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { SEARCH_MIN_Q_LEN, type SearchResult } from "@/lib/search/searchContracts";
import type { SearchSelection } from "@/lib/search/searchSelectionAdapter";
import {
    filterLayoutBuilderPreviewSelections,
    layoutBuilderPreviewSelectionFrom,
} from "@/lib/layout/layoutBuilderPreviewRecordSearch";
import type { LayoutBuilderPreviewRecordState } from "@/lib/layout/layoutBuilderPreviewRecordState";

type Props = {
    state: LayoutBuilderPreviewRecordState;
};

/** Search/select a lead or family for builder preview — no raw IDs required. */
export default function LayoutBuilderPreviewRecordSelector({ state }: Props) {
    const { selection, selectOpportunity, clearSelection, loading, error, usingSample } = state;
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchSeq = useRef(0);

    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<SearchSelection[]>([]);
    const [busy, setBusy] = useState(false);
    const [searchErr, setSearchErr] = useState<string | null>(null);

    useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, []);

    useEffect(() => {
        const trimmed = q.trim();
        if (!open || trimmed.length < SEARCH_MIN_Q_LEN) {
            setHits([]);
            setSearchErr(null);
            setBusy(false);
            return;
        }

        const seq = ++searchSeq.current;
        setBusy(true);
        setSearchErr(null);
        const handle = window.setTimeout(() => {
            void (async () => {
                try {
                    const params = new URLSearchParams({ q: trimmed, limit: "16" });
                    const res = await fetch(`/api/admin/global-search?${params.toString()}`, {
                        credentials: "include",
                    });
                    const body = (await res.json().catch(() => ({}))) as {
                        ok?: boolean;
                        results?: SearchResult[];
                        message?: string;
                        error?: string;
                    };
                    if (seq !== searchSeq.current) return;
                    if (!res.ok || !body.ok) {
                        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
                    }
                    const results = Array.isArray(body.results) ? body.results : [];
                    setHits(filterLayoutBuilderPreviewSelections(results));
                } catch (e) {
                    if (seq !== searchSeq.current) return;
                    setHits([]);
                    setSearchErr(e instanceof Error ? e.message : "Search failed");
                } finally {
                    if (seq === searchSeq.current) setBusy(false);
                }
            })();
        }, 180);

        return () => window.clearTimeout(handle);
    }, [open, q]);

    const pickHit = useCallback(
        (hit: SearchSelection) => {
            const next = layoutBuilderPreviewSelectionFrom(hit);
            if (!next) return;
            selectOpportunity(next);
            setOpen(false);
            setQ("");
            setHits([]);
        },
        [selectOpportunity],
    );

    return (
        <div
            ref={wrapRef}
            className="relative min-w-[14rem] flex-1 rounded-lg border border-alloy-forge/12 bg-white px-3 py-2"
            data-testid="layout-builder-preview-record-selector"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Preview record</p>
                <p className="text-[10px] text-alloy-midnight/45" data-testid="layout-builder-preview-record-status">
                    {loading ?
                        "Loading…"
                    : usingSample ?
                        "Sample data"
                    :   "Live record"}
                    {error && !loading ?
                        <span className="ml-1 text-amber-700">({error})</span>
                    :   null}
                </p>
            </div>

            {selection ?
                <div className="mt-1.5 flex min-w-0 items-center gap-2 rounded-md border border-alloy-pine/20 bg-alloy-pine/[0.04] px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-alloy-midnight">{selection.label}</p>
                        {selection.secondary ?
                            <p className="truncate text-[10px] text-alloy-midnight/50">{selection.secondary}</p>
                        :   null}
                    </div>
                    <button
                        type="button"
                        className="shrink-0 text-[10px] font-medium text-alloy-midnight/55 hover:text-alloy-pine"
                        onClick={clearSelection}
                        data-testid="layout-builder-preview-record-clear"
                    >
                        Clear
                    </button>
                </div>
            :   <div className="relative mt-1.5">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-alloy-midnight/35" />
                    <input
                        ref={inputRef}
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onFocus={() => setOpen(true)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search lead or family…"
                        className="w-full rounded-md border border-alloy-forge/15 py-1.5 pl-7 pr-2 text-xs"
                        data-testid="layout-builder-preview-record-search"
                    />
                    {open && (busy || hits.length > 0 || searchErr || q.trim().length >= SEARCH_MIN_Q_LEN) ?
                        <div
                            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-alloy-forge/12 bg-white py-1 shadow-lg"
                            data-testid="layout-builder-preview-record-results"
                        >
                            {busy ?
                                <p className="px-3 py-2 text-xs text-alloy-midnight/50">Searching…</p>
                            : searchErr ?
                                <p className="px-3 py-2 text-xs text-red-700">{searchErr}</p>
                            : hits.length === 0 ?
                                <p className="px-3 py-2 text-xs text-alloy-midnight/50">No leads found</p>
                            :   hits.map((hit) => (
                                    <button
                                        key={`${hit.entity_type}:${hit.entity_id}:${hit.name}`}
                                        type="button"
                                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-alloy-forge/[0.04]"
                                        onClick={() => pickHit(hit)}
                                    >
                                        <span className="text-xs font-medium text-alloy-midnight">
                                            {hit.name}
                                        </span>
                                        {layoutBuilderPreviewSelectionFrom(hit)?.secondary ?
                                            <span className="text-[10px] text-alloy-midnight/50">
                                                {layoutBuilderPreviewSelectionFrom(hit)?.secondary}
                                            </span>
                                        :   null}
                                    </button>
                                ))
                            }
                        </div>
                    :   null}
                </div>
            }
        </div>
    );
}
