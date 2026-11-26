"use client";

/**
 * RecordLaunchPicker — reusable operator control to search/select ONE existing record
 * (opportunity / customer / person / customer_member) for a packet's `launch_from_entity`.
 *
 * Reuses the existing admin global search (`GET /api/admin/global-search`). That endpoint
 * returns SUBJECTS (Search Platform V2), so results are flattened to flat record
 * references by `searchSelectionsFromResults` before the pure `buildRecordPickerOptions`
 * view-model maps them to friendly options. A raw-UUID fallback sits behind an "Enter ID
 * manually" affordance. The component is controlled: it emits the selected option or null.
 *
 * No packet-runtime, resolver, or duplicate-detection logic lives here.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LAUNCH_ENTITY_TYPES, parseLaunchFromEntityInput } from "@/lib/pos/packet/launchFromEntity";
import { buildRecordPickerOptions, type RecordPickerOption } from "@/lib/pos/packet/recordPickerOptions";
import type { SearchResult } from "@/lib/search/searchContracts";
import { searchSelectionsFromResults } from "@/lib/search/searchSelectionAdapter";

const LAUNCH_TYPE_LABELS: Record<(typeof LAUNCH_ENTITY_TYPES)[number], string> = {
    opportunity: "Lead / opportunity",
    customer: "Household / customer",
    person: "Parent / person",
    customer_member: "Child",
};

export interface RecordLaunchPickerProps {
    /** Currently selected launch target, or null when none. */
    value: RecordPickerOption | null;
    onChange: (value: RecordPickerOption | null) => void;
    label?: string;
}

export default function RecordLaunchPicker({
    value,
    onChange,
    label = "Launch from a record (optional — prefills known info)",
}: RecordLaunchPickerProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<RecordPickerOption[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [manual, setManual] = useState(false);
    const [manualType, setManualType] = useState("");
    const [manualId, setManualId] = useState("");
    const [manualErr, setManualErr] = useState<string | null>(null);
    const seq = useRef(0);
    // Portal positioning so the results menu escapes the POS modal's overflow-hidden ancestors.
    const inputWrapRef = useRef<HTMLDivElement | null>(null);
    const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
    const menuOpen = !manual && !value && query.trim().length >= 2;

    const updateMenuRect = useCallback(() => {
        const el = inputWrapRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setMenuRect({ left: r.left, top: r.bottom + 4, width: r.width });
    }, []);

    useLayoutEffect(() => {
        if (!menuOpen) {
            setMenuRect(null);
            return;
        }
        updateMenuRect();
        const onMove = () => updateMenuRect();
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        return () => {
            window.removeEventListener("scroll", onMove, true);
            window.removeEventListener("resize", onMove);
        };
    }, [menuOpen, updateMenuRect, results]);

    // Debounced search against the existing global-search API.
    useEffect(() => {
        if (manual || value) return;
        const q = query.trim();
        if (q.length < 2) {
            setResults(null);
            setSearching(false);
            return;
        }
        const s = ++seq.current;
        setSearching(true);
        const handle = setTimeout(async () => {
            try {
                const res = await fetch(`/api/admin/global-search?q=${encodeURIComponent(q)}&limit=20`, {
                    credentials: "same-origin",
                });
                const body = (await res.json().catch(() => ({}))) as { ok?: boolean; results?: SearchResult[] };
                if (s !== seq.current) return;
                // Search returns SUBJECTS; a picker wants a flat record reference.
                const hits = searchSelectionsFromResults(Array.isArray(body.results) ? body.results : []);
                setResults(res.ok && body.ok ? buildRecordPickerOptions(hits) : []);
            } catch {
                if (s === seq.current) setResults([]);
            } finally {
                if (s === seq.current) setSearching(false);
            }
        }, 250);
        return () => clearTimeout(handle);
    }, [query, manual, value]);

    const clear = useCallback(() => {
        onChange(null);
        setQuery("");
        setResults(null);
        setManualErr(null);
        setManualType("");
        setManualId("");
    }, [onChange]);

    const applyManual = useCallback(
        (type: string, id: string) => {
            setManualType(type);
            setManualId(id);
            const parsed = parseLaunchFromEntityInput({ entityType: type, entityId: id });
            if (!parsed.ok) {
                setManualErr(parsed.error);
                onChange(null);
                return;
            }
            setManualErr(null);
            if (!parsed.value) {
                onChange(null);
                return;
            }
            const t = parsed.value.entity_type;
            onChange({ entity_type: t, entity_id: parsed.value.entity_id, label: parsed.value.entity_id, sublabel: LAUNCH_TYPE_LABELS[t] });
        },
        [onChange]
    );

    return (
        <div className="shrink-0 border-b border-alloy-stone/12 bg-stone-50/60 px-3 py-1.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-medium text-stone-500">{label}</span>
                <button
                    type="button"
                    onClick={() => {
                        clear();
                        setManual((m) => !m);
                    }}
                    className="text-[10px] font-medium text-stone-500 underline decoration-dotted hover:text-stone-700"
                >
                    {manual ? "Search instead" : "Enter ID manually"}
                </button>
            </div>

            {value ? (
                <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 rounded border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.08] px-2 py-0.5 text-[11px] text-alloy-bend-pine">
                        <span className="truncate font-medium">{value.label}</span>
                        <span className="shrink-0 text-alloy-bend-pine">· {value.sublabel ?? value.entity_type}</span>
                    </span>
                    <button type="button" onClick={clear} className="text-[10.5px] font-medium text-stone-500 hover:text-stone-700">
                        Change
                    </button>
                </div>
            ) : manual ? (
                <div className="mt-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={manualType}
                            onChange={(e) => applyManual(e.target.value, manualId)}
                            className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-700"
                        >
                            <option value="">None</option>
                            {LAUNCH_ENTITY_TYPES.map((t) => (
                                <option key={t} value={t}>
                                    {LAUNCH_TYPE_LABELS[t]}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={manualId}
                            onChange={(e) => applyManual(manualType, e.target.value)}
                            placeholder="record id (UUID)"
                            disabled={!manualType}
                            className="min-w-0 flex-1 rounded border border-stone-200 bg-white px-2 py-0.5 font-mono text-[10.5px] text-stone-700 disabled:bg-stone-100"
                        />
                    </div>
                    {manualErr ? <p className="mt-1 text-[10px] text-amber-700">{manualErr}</p> : null}
                </div>
            ) : (
                <div className="mt-1" ref={inputWrapRef}>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search a lead, parent, child, or household by name…"
                        className="w-full rounded border border-stone-200 bg-white px-2 py-1 text-[11.5px] text-stone-700"
                    />
                    {menuOpen && menuRect && typeof document !== "undefined"
                        ? createPortal(
                              <div
                                  style={{ position: "fixed", left: menuRect.left, top: menuRect.top, width: menuRect.width, zIndex: 90 }}
                                  className="max-h-56 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-xl"
                              >
                                  {searching && !results ? (
                                      <div className="px-3 py-2 text-[11px] text-stone-400">Searching…</div>
                                  ) : results && results.length === 0 ? (
                                      <div className="px-3 py-2 text-[11px] text-stone-400">No matching records.</div>
                                  ) : (
                                      (results ?? []).map((opt) => (
                                          <button
                                              key={`${opt.entity_type}:${opt.entity_id}`}
                                              type="button"
                                              onMouseDown={(e) => {
                                                  // mousedown (not click) so it fires before the input blurs/menu closes
                                                  e.preventDefault();
                                                  onChange(opt);
                                                  setQuery("");
                                                  setResults(null);
                                              }}
                                              className="flex w-full flex-col items-start border-b border-stone-100 px-3 py-1.5 text-left last:border-b-0 hover:bg-alloy-bend-pine/[0.07]"
                                          >
                                              <span className="truncate text-[12px] font-medium text-alloy-midnight">{opt.label}</span>
                                              {opt.sublabel ? <span className="truncate text-[10px] text-stone-400">{opt.sublabel}</span> : null}
                                          </button>
                                      ))
                                  )}
                              </div>,
                              document.body
                          )
                        : null}
                </div>
            )}
        </div>
    );
}
