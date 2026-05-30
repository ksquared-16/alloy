"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { neutral, derived } from "@/styles/tokens/colors";
import type { GlobalRecordSearchHit } from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import { GLOBAL_RECORD_SEARCH_MIN_Q_LEN } from "@/lib/admin/globalSearch/globalRecordSearchTypes";
import { launchGlobalRecordSearchOpen } from "@/lib/adminV2/globalRecordSearchOpen";

export type GlobalSearchModalProps = {
    open: boolean;
    onClose: () => void;
};

function formatHitMeta(hit: GlobalRecordSearchHit): string {
    const parts = [hit.type_label, hit.secondary_context].filter(Boolean);
    return parts.join(" · ");
}

export default function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const searchSeq = useRef(0);

    const [q, setQ] = useState("");
    const [hits, setHits] = useState<GlobalRecordSearchHit[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        if (!open) return;
        setQ("");
        setHits([]);
        setErr(null);
        setActiveIndex(0);
        const t = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        const trimmed = q.trim();
        if (trimmed.length < GLOBAL_RECORD_SEARCH_MIN_Q_LEN) {
            setHits([]);
            setErr(null);
            setBusy(false);
            setActiveIndex(0);
            return;
        }

        const seq = ++searchSeq.current;
        setBusy(true);
        setErr(null);
        const handle = window.setTimeout(() => {
            void (async () => {
                try {
                    const params = new URLSearchParams({ q: trimmed, limit: "20" });
                    const r = await fetch(`/api/admin/global-search?${params.toString()}`, {
                        credentials: "include",
                    });
                    const j = (await r.json().catch(() => ({}))) as {
                        ok?: boolean;
                        results?: GlobalRecordSearchHit[];
                        message?: string;
                        error?: string;
                    };
                    if (seq !== searchSeq.current) return;
                    if (!r.ok || !j.ok) {
                        throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
                    }
                    setHits(Array.isArray(j.results) ? j.results : []);
                    setActiveIndex(0);
                } catch (e) {
                    if (seq !== searchSeq.current) return;
                    setHits([]);
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
            const navigateTo = launchGlobalRecordSearchOpen({
                entity_type: hit.entity_type,
                entity_id: hit.entity_id,
            });
            onClose();
            if (navigateTo) router.push(navigateTo);
        },
        [onClose, router]
    );

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!hits.length) return;
            setActiveIndex((i) => Math.min(i + 1, hits.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!hits.length) return;
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const hit = hits[activeIndex];
            if (hit) selectHit(hit);
        }
    };

    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector<HTMLElement>(`[data-global-search-index="${activeIndex}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    if (!open) return null;

    const trimmed = q.trim();
    const showEmpty = !busy && trimmed.length >= GLOBAL_RECORD_SEARCH_MIN_Q_LEN && hits.length === 0 && !err;

    return (
        <div
            className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-alloy-midnight/50 px-2 py-8 backdrop-blur-[2px] sm:px-4 sm:py-16"
            data-adminv2-global-search-modal="true"
        >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close search" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Search records"
                className="relative z-[1] w-full max-w-xl overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className="flex items-center gap-2 border-b px-3 py-2.5"
                    style={{ borderColor: derived.topBarDivider, backgroundColor: neutral.surface }}
                >
                    <Search className="h-4 w-4 shrink-0 opacity-50" aria-hidden strokeWidth={2} />
                    <input
                        ref={inputRef}
                        type="search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={onInputKeyDown}
                        placeholder="Search people, leads, households, campuses…"
                        className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
                        style={{ color: neutral.textPrimary }}
                        aria-label="Search records"
                        autoComplete="off"
                        spellCheck={false}
                        data-global-search-input="true"
                    />
                    <kbd className="hidden rounded border border-alloy-stone/30 px-1.5 py-0.5 text-[10px] text-alloy-midnight/45 sm:inline">
                        esc
                    </kbd>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-alloy-midnight/55 hover:bg-alloy-stone/10"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="max-h-[min(420px,60vh)] overflow-y-auto py-1">
                    {trimmed.length > 0 && trimmed.length < GLOBAL_RECORD_SEARCH_MIN_Q_LEN ?
                        <p className="px-4 py-3 text-sm text-alloy-midnight/55">
                            Type at least {GLOBAL_RECORD_SEARCH_MIN_Q_LEN} characters…
                        </p>
                    : null}
                    {busy ?
                        <p className="px-4 py-3 text-sm text-alloy-midnight/55">Searching…</p>
                    : null}
                    {err ?
                        <p className="px-4 py-3 text-sm text-red-700">{err}</p>
                    : null}
                    {showEmpty ?
                        <p className="px-4 py-3 text-sm text-alloy-midnight/55">No matching records.</p>
                    : null}
                    {hits.length > 0 ?
                        <ul ref={listRef} role="listbox" aria-label="Search results">
                            {hits.map((hit, index) => {
                                const meta = formatHitMeta(hit);
                                const active = index === activeIndex;
                                return (
                                    <li key={`${hit.entity_type}:${hit.entity_id}`} role="option" aria-selected={active}>
                                        <button
                                            type="button"
                                            data-global-search-index={index}
                                            className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors ${
                                                active ? "bg-alloy-stone/12" : "hover:bg-alloy-stone/8"
                                            }`}
                                            onMouseEnter={() => setActiveIndex(index)}
                                            onClick={() => selectHit(hit)}
                                        >
                                            <span className="text-[15px] font-medium text-alloy-midnight">{hit.name}</span>
                                            {meta ?
                                                <span className="text-sm text-alloy-midnight/60">{meta}</span>
                                            : null}
                                            {hit.status_label ?
                                                <span className="text-xs text-alloy-midnight/45">{hit.status_label}</span>
                                            : null}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    : null}
                </div>

                <div className="border-t border-alloy-stone/15 px-4 py-2 text-[11px] text-alloy-midnight/45">
                    <span className="hidden sm:inline">↑↓ navigate · Enter open · </span>
                    Record lookup only — not BOS
                </div>
            </div>
        </div>
    );
}

export function useGlobalSearchKeyboardShortcut(onOpen: () => void): void {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod || e.key.toLowerCase() !== "k") return;
            const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return;
            e.preventDefault();
            onOpen();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onOpen]);
}
