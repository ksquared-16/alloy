"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CrmSearchEntityType } from "@/lib/admin/forms/crmEntitySearchShared";

export type CrmSearchHit = { id: string; label: string; subtitle: string | null };

type Props = {
    label: string;
    entityType: CrmSearchEntityType;
    picked: { id: string; label: string } | null;
    onPick: (hit: CrmSearchHit) => void;
    onClear: () => void;
    disabled?: boolean;
};

/** Admin-only typeahead wired to GET /api/admin/forms/crm-entity-search */
export default function CrmEntitySearchPicker({
    label,
    entityType,
    picked,
    onPick,
    onClear,
    disabled,
}: Props) {
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<CrmSearchHit[]>([]);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const seq = useRef(0);

    useEffect(() => {
        function onDocMouseDown(e: MouseEvent) {
            if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onDocMouseDown);
        return () => document.removeEventListener("mousedown", onDocMouseDown);
    }, []);

    useEffect(() => {
        if (picked || disabled) {
            setHits([]);
            setOpen(false);
            return;
        }
        const t = q.trim();
        if (t.length < 2) {
            setHits([]);
            setErr(null);
            return;
        }
        const my = ++seq.current;
        const timer = window.setTimeout(() => {
            void (async () => {
                setBusy(true);
                setErr(null);
                try {
                    const qs = new URLSearchParams({ entity_type: entityType, q: t });
                    const res = await fetch(`/api/admin/forms/crm-entity-search?${qs}`, { credentials: "include" });
                    const json = await res.json().catch(() => ({}));
                    if (seq.current !== my) return;
                    if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
                    const list = (json as { results?: CrmSearchHit[] }).results;
                    setHits(Array.isArray(list) ? list : []);
                    setOpen(true);
                } catch (e) {
                    if (seq.current === my) {
                        setErr(e instanceof Error ? e.message : "Search failed");
                        setHits([]);
                    }
                } finally {
                    if (seq.current === my) setBusy(false);
                }
            })();
        }, 280);
        return () => window.clearTimeout(timer);
    }, [q, picked, disabled, entityType]);

    const clearSearch = useCallback(() => {
        setQ("");
        setHits([]);
        setOpen(false);
        setErr(null);
    }, []);

    if (picked) {
        return (
            <div className="rounded-md border border-[#cfd6e6] bg-[#f8fafc] px-3 py-2">
                <div className="text-xs font-medium text-[#59678b]">{label}</div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[#31394d]">{picked.label}</div>
                        <div className="break-all font-mono text-[11px] text-[#59678b]">{picked.id}</div>
                    </div>
                    <button
                        type="button"
                        disabled={disabled}
                        className="shrink-0 text-sm font-medium text-[#00458C] hover:underline disabled:opacity-50"
                        onClick={() => {
                            onClear();
                            clearSearch();
                        }}
                    >
                        Clear
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div ref={wrapRef} className="relative">
            <label className="block text-xs font-medium text-[#59678b]">
                {label}
                <input
                    className="mt-1 w-full rounded border border-[#cfd6e6] px-2 py-1.5 text-sm text-[#31394d]"
                    value={q}
                    disabled={disabled}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => hits.length > 0 && setOpen(true)}
                    placeholder="Type at least 2 characters or paste a UUID…"
                    autoComplete="off"
                    data-testid={`crm-search-${entityType}`}
                />
            </label>
            {busy ? <p className="mt-1 text-xs text-[#59678b]">Searching…</p> : null}
            {err ? <p className="mt-1 text-xs text-red-700">{err}</p> : null}
            {open && hits.length > 0 ?
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-[#cfd6e6] bg-white py-1 shadow-lg">
                    {hits.map((h) => (
                        <li key={h.id}>
                            <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-[#f4f6f9]"
                                onClick={() => {
                                    onPick(h);
                                    clearSearch();
                                    setOpen(false);
                                }}
                            >
                                <div className="font-medium text-[#31394d]">{h.label}</div>
                                {h.subtitle ?
                                    <div className="text-xs text-[#59678b]">{h.subtitle}</div>
                                : null}
                                <div className="break-all font-mono text-[10px] text-[#59678b]">{h.id}</div>
                            </button>
                        </li>
                    ))}
                </ul>
            : null}
            {open && !busy && q.trim().length >= 2 && hits.length === 0 && !err ?
                <p className="mt-1 text-xs text-[#59678b]">No matches.</p>
            : null}
        </div>
    );
}
