"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { neutral, derived } from "@/styles/tokens/colors";
import { resolveGlobalSearchOpenFromHit } from "@/lib/admin/globalSearch/globalRecordSearchOpenResolution";
import {
    buildGlobalSearchStatusPill,
    formatGlobalSearchClusterContextLine,
    formatGlobalSearchHitPrimaryName,
    formatGlobalSearchHitSecondaryLine,
} from "@/lib/admin/globalSearch/globalRecordSearchResultPresentation";
import type {
    GlobalRecordSearchCluster,
    GlobalRecordSearchGroup,
    GlobalRecordSearchHit,
} from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import { GLOBAL_RECORD_SEARCH_MIN_Q_LEN } from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import {
    flattenGlobalSearchClustersForKeyboard,
    GLOBAL_SEARCH_DROPDOWN_Z_INDEX,
    launchGlobalRecordSearchOpen,
} from "@/lib/adminV2/globalRecordSearchOpen";
import GlobalSearchStatusPill from "@/app/adminV2/components/GlobalSearchResultPills";

function useGlobalSearchFocusShortcut(focusInput: () => void): void {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod || e.key.toLowerCase() !== "k") return;
            const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return;
            e.preventDefault();
            focusInput();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [focusInput]);
}

type HitRowProps = {
    hit: GlobalRecordSearchHit;
    index: number;
    active: boolean;
    inCluster: boolean;
    onHover: () => void;
    onSelect: () => void;
};

function GlobalSearchHitRow({ hit, index, active, inCluster, onHover, onSelect }: HitRowProps) {
    const primary = formatGlobalSearchHitPrimaryName(hit);
    const secondary = formatGlobalSearchHitSecondaryLine(hit, { inCluster });
    const statusPill = buildGlobalSearchStatusPill(hit);

    return (
        <li role="presentation">
            <button
                type="button"
                role="option"
                aria-selected={active}
                data-global-search-index={index}
                className={`flex w-full flex-col gap-0.5 py-2.5 text-left transition-colors ${
                    inCluster ? "pl-5 pr-3" : "px-3"
                } ${active ? "bg-alloy-forge/[0.05]" : "hover:bg-alloy-forge/[0.035]"}`}
                onMouseEnter={onHover}
                onClick={onSelect}
            >
                <span className="text-sm font-medium text-alloy-midnight">{primary}</span>
                {secondary ?
                    <span className="text-xs text-alloy-midnight/55">{secondary}</span>
                : null}
                {statusPill ?
                    <div className="mt-1">
                        <GlobalSearchStatusPill pill={statusPill} />
                    </div>
                : null}
            </button>
        </li>
    );
}

export default function GlobalSearchBox() {
    const router = useRouter();
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const searchSeq = useRef(0);

    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [groups, setGroups] = useState<GlobalRecordSearchGroup[]>([]);
    const [clusters, setClusters] = useState<GlobalRecordSearchCluster[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [unsupportedMsg, setUnsupportedMsg] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const locationHits = useMemo(
        () => groups.find((g) => g.key === "locations")?.hits ?? [],
        [groups]
    );

    const flatHits = useMemo(
        () => flattenGlobalSearchClustersForKeyboard(clusters, locationHits),
        [clusters, locationHits]
    );

    const focusInput = useCallback(() => {
        inputRef.current?.focus();
        setOpen(true);
    }, []);

    useGlobalSearchFocusShortcut(focusInput);

    useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, []);

    useEffect(() => {
        const trimmed = q.trim();
        if (!open || trimmed.length < GLOBAL_RECORD_SEARCH_MIN_Q_LEN) {
            setGroups([]);
            setClusters([]);
            setErr(null);
            setUnsupportedMsg(null);
            setBusy(false);
            setActiveIndex(0);
            return;
        }

        const seq = ++searchSeq.current;
        setBusy(true);
        setErr(null);
        setUnsupportedMsg(null);
        const handle = window.setTimeout(() => {
            void (async () => {
                try {
                    const params = new URLSearchParams({ q: trimmed, limit: "24" });
                    const r = await fetch(`/api/admin/global-search?${params.toString()}`, {
                        credentials: "include",
                    });
                    const j = (await r.json().catch(() => ({}))) as {
                        ok?: boolean;
                        groups?: GlobalRecordSearchGroup[];
                        clusters?: GlobalRecordSearchCluster[];
                        message?: string;
                        error?: string;
                    };
                    if (seq !== searchSeq.current) return;
                    if (!r.ok || !j.ok) {
                        throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
                    }
                    setGroups(Array.isArray(j.groups) ? j.groups : []);
                    setClusters(Array.isArray(j.clusters) ? j.clusters : []);
                    setActiveIndex(0);
                } catch (e) {
                    if (seq !== searchSeq.current) return;
                    setGroups([]);
                    setClusters([]);
                    setErr(e instanceof Error ? e.message : "Search failed");
                } finally {
                    if (seq === searchSeq.current) setBusy(false);
                }
            })();
        }, 180);

        return () => window.clearTimeout(handle);
    }, [open, q]);

    const selectHit = useCallback(
        (hit: GlobalRecordSearchHit) => {
            const resolution = resolveGlobalSearchOpenFromHit(hit);
            if (!resolution.supported || !resolution.detail) {
                setUnsupportedMsg("This record type is not yet supported in global search.");
                return;
            }
            const navigateTo = launchGlobalRecordSearchOpen(resolution.detail);
            setOpen(false);
            setQ("");
            setGroups([]);
            setClusters([]);
            setUnsupportedMsg(null);
            if (navigateTo) router.push(navigateTo);
        },
        [router]
    );

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            inputRef.current?.blur();
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!flatHits.length) return;
            setActiveIndex((i) => Math.min(i + 1, flatHits.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!flatHits.length) return;
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const hit = flatHits[activeIndex];
            if (hit) selectHit(hit);
        }
    };

    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector<HTMLElement>(`[data-global-search-index="${activeIndex}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    const trimmed = q.trim();
    const showPanel = open && (trimmed.length > 0 || busy || err != null || unsupportedMsg != null);
    const showEmpty =
        !busy && trimmed.length >= GLOBAL_RECORD_SEARCH_MIN_Q_LEN && flatHits.length === 0 && !err;

    let runningIndex = -1;

    const renderHit = (hit: GlobalRecordSearchHit, inCluster: boolean) => {
        runningIndex += 1;
        const index = runningIndex;
        return (
            <GlobalSearchHitRow
                key={`${hit.entity_type}:${hit.entity_id}`}
                hit={hit}
                index={index}
                active={index === activeIndex}
                inCluster={inCluster}
                onHover={() => setActiveIndex(index)}
                onSelect={() => selectHit(hit)}
            />
        );
    };

    return (
        <div ref={wrapRef} className="relative min-w-0 flex-1 max-w-xl" data-adminv2-global-search-box="true">
            <div
                className="flex items-center gap-2 rounded-lg px-3.5 py-2.5"
                style={{
                    backgroundColor: derived.searchBgOnPrimary,
                    color: neutral.surface,
                }}
            >
                <Search className="h-4 w-4 shrink-0 opacity-75" aria-hidden strokeWidth={2} />
                <input
                    ref={inputRef}
                    type="search"
                    value={q}
                    onChange={(e) => {
                        setQ(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onInputKeyDown}
                    placeholder="Search records…"
                    className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:opacity-75"
                    style={{ color: neutral.surface }}
                    aria-label="Search records"
                    aria-expanded={showPanel}
                    aria-controls="adminv2-global-search-results"
                    aria-autocomplete="list"
                    autoComplete="off"
                    spellCheck={false}
                    data-global-search-input="true"
                />
                <kbd className="hidden shrink-0 rounded border border-white/25 px-1.5 py-0.5 text-[10px] font-medium opacity-75 lg:inline">
                    ⌘K
                </kbd>
            </div>

            {showPanel ?
                <div
                    id="adminv2-global-search-results"
                    ref={listRef}
                    role="listbox"
                    aria-label="Search results"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-[min(420px,60vh)] overflow-y-auto rounded-lg border border-alloy-forge/12 bg-white py-1 shadow-[0_4px_16px_rgba(39,63,82,0.1)]"
                    style={{ zIndex: GLOBAL_SEARCH_DROPDOWN_Z_INDEX }}
                >
                    {trimmed.length > 0 && trimmed.length < GLOBAL_RECORD_SEARCH_MIN_Q_LEN ?
                        <p className="px-3.5 py-2 text-sm text-alloy-midnight/55">
                            Type at least {GLOBAL_RECORD_SEARCH_MIN_Q_LEN} characters…
                        </p>
                    : null}
                    {busy ?
                        <p className="px-3.5 py-2 text-sm text-alloy-midnight/55">Searching…</p>
                    : null}
                    {err ?
                        <p className="px-3.5 py-2 text-sm text-red-700">{err}</p>
                    : null}
                    {unsupportedMsg ?
                        <p className="mx-2 mb-1 rounded-md bg-alloy-ember/8 px-2.5 py-2 text-sm text-alloy-ember">
                            {unsupportedMsg}
                        </p>
                    : null}
                    {showEmpty ?
                        <p className="px-3.5 py-2 text-sm text-alloy-midnight/55">No matching records.</p>
                    : null}

                    {clusters.map((cluster) => {
                        const contextLine = formatGlobalSearchClusterContextLine(cluster);
                        const inCluster = cluster.key !== "__ungrouped__" && Boolean(contextLine);
                        const hasRows =
                            cluster.anchors.length + cluster.children.length + cluster.parents.length > 0;
                        if (!hasRows) return null;

                        return (
                            <div
                                key={cluster.key}
                                role="group"
                                aria-label={cluster.household_name ?? "Results"}
                                className="mx-1.5 mb-1"
                            >
                                {inCluster && contextLine ?
                                    <div
                                        className="mb-0.5 mt-1.5 rounded-md border border-alloy-forge/8 bg-alloy-stone/[0.04] px-3 py-2"
                                        aria-hidden
                                    >
                                        <p className="text-xs text-alloy-midnight/55">{contextLine}</p>
                                    </div>
                                : null}
                                <ul className="divide-y divide-alloy-forge/[0.06]">
                                    {cluster.anchors.map((hit) => renderHit(hit, inCluster))}
                                    {cluster.children.map((hit) => renderHit(hit, inCluster))}
                                    {cluster.parents.map((hit) => renderHit(hit, inCluster))}
                                </ul>
                            </div>
                        );
                    })}

                    {locationHits.length ?
                        <div
                            role="group"
                            aria-label="Campuses"
                            className="mx-1.5 mt-1 border-t border-alloy-forge/8 pt-1"
                        >
                            <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Campuses
                            </div>
                            <ul className="divide-y divide-alloy-forge/[0.06]">
                                {locationHits.map((hit) => renderHit(hit, false))}
                            </ul>
                        </div>
                    : null}

                    {flatHits.length > 0 ?
                        <div className="mx-2 mt-1 border-t border-alloy-forge/8 px-1 py-2 text-[10px] text-alloy-midnight/40">
                            ↑↓ navigate · Enter open · Esc close
                        </div>
                    : null}
                </div>
            : null}
        </div>
    );
}
