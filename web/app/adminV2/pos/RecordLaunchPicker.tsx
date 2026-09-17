"use client";

/**
 * RecordLaunchPicker — reusable operator control to search/select ONE existing record
 * (opportunity / customer / person / customer_member) for a packet's `launch_from_entity`.
 *
 * Searches through `GET /api/admin/forms/crm-entity-search`, the canonical org-scoped typeahead
 * for linking to CRM rows, which speaks exactly the four entity types this picker offers.
 *
 * It used to search `GET /api/admin/global-search` and flatten the results with
 * `searchSelectionsFromResults`. That adapter maps a CHILD subject to its PERSON id, because its
 * consumers pick records in the drawer vocabulary, which has no child grain — and a child whose
 * `person_id` is null (ordinary; the column is nullable) yields no reference at all and is dropped.
 * So searching for a child by name returned an empty menu, and selecting an existing child was
 * possible only by pasting its UUID into "Enter ID manually" — the raw-id interaction this product
 * is not supposed to require. The drawer adapter is right for drawer consumers; this picker simply
 * is not one of them.
 *
 * A raw-UUID fallback still sits behind "Enter ID manually" for the cases search cannot reach. The
 * component is controlled: it emits the selected option or null.
 *
 * ## The menu was rendering, and nobody could see it
 *
 * Typing "path" in the Packet Studio distribution picker looked like a dead control. It was not: the
 * request went to the canonical typeahead, came back with Patha Certfree and Pathb Certopp, and the
 * menu rendered — `position: fixed`, `visibility: visible`, `opacity: 1`, holding both names. Two
 * things hid it, and both were measured rather than guessed.
 *
 * FIRST, STACKING. The menu portals to `document.body` to escape the modal's `overflow-hidden`
 * ancestors, and carried a hand-written `zIndex: 90`. The Processing shell it opens inside sits at
 * panel 97 / backdrop 96, so the menu painted UNDERNEATH the very surface that owns it — a hit test
 * at the menu's own centre returned the packet body behind it. That is the same defect this
 * repository already fixed twice (`ProcessingAlloyDialog` z-[80] → z-[110], and the form-builder
 * library panel), and it has a platform answer: `ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z`. A local
 * number was always going to drift out of the layer it had to clear.
 *
 * SECOND, THE FOLD. The menu is anchored below the input unconditionally. In the section this
 * control lives in the input sits near the bottom of a very tall panel — measured at y=1120 in a
 * 1250px viewport — so even correctly stacked the results opened into the last 130 pixels of the
 * screen or past it entirely. It now opens upward when there is not room below, which is what every
 * other typeahead does and what makes the control usable at any scroll position.
 *
 * The rows are also a real listbox now. They were plain buttons with no roles, so a screen reader
 * was told nothing had appeared either.
 *
 * No packet-runtime, resolver, or duplicate-detection logic lives here.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";
import { LAUNCH_ENTITY_TYPES, parseLaunchFromEntityInput } from "@/lib/pos/packet/launchFromEntity";
import { type RecordPickerOption } from "@/lib/pos/packet/recordPickerOptions";

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
    const [menuRect, setMenuRect] = useState<
        { left: number; width: number; top: number; bottom: null } | { left: number; width: number; top: null; bottom: number } | null
    >(null);
    const menuOpen = !manual && !value && query.trim().length >= 2;

    /** The menu's own height cap (`max-h-56`), used to decide which side it will fit on. */
    const MENU_MAX_H = 224;

    const updateMenuRect = useCallback(() => {
        const el = inputWrapRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const below = window.innerHeight - r.bottom;
        /*
         * Open upward when the space below cannot hold the menu AND there is more room above. Both
         * halves matter: on a short viewport neither side fits, and dropping upward into even less
         * room would be a different way to be invisible.
         */
        const flipUp = below < MENU_MAX_H + 8 && r.top > below;
        setMenuRect(
            flipUp
                ? { left: r.left, width: r.width, top: null, bottom: Math.max(8, window.innerHeight - r.top + 4) }
                : { left: r.left, width: r.width, top: r.bottom + 4, bottom: null },
        );
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

    // Debounced search against the canonical CRM typeahead.
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
                /*
                 * One query per entity type this picker offers, in parallel.
                 *
                 * The canonical typeahead is scoped to a single entity type by design, and the four
                 * types are exactly the four this control can launch from — so asking each of them
                 * is the whole search. Children are found by name here because this endpoint speaks
                 * customer_member natively rather than through the drawer's person-shaped grain.
                 */
                const perType = await Promise.all(
                    LAUNCH_ENTITY_TYPES.map(async (entityType) => {
                        const res = await fetch(
                            `/api/admin/forms/crm-entity-search?entity_type=${entityType}&q=${encodeURIComponent(q)}`,
                            { credentials: "same-origin" },
                        );
                        if (!res.ok) return [] as RecordPickerOption[];
                        const body = (await res.json().catch(() => ({}))) as {
                            results?: { id: string; label: string; subtitle: string | null }[];
                        };
                        const rows = Array.isArray(body.results) ? body.results : [];
                        return rows.map((row) => ({
                            entity_type: entityType,
                            entity_id: row.id,
                            label: row.label,
                            // The record's own detail (household, DOB) beside the generic kind, so
                            // two children with the same name are still tellable apart.
                            sublabel: row.subtitle ?? LAUNCH_TYPE_LABELS[entityType],
                        })) satisfies RecordPickerOption[];
                    }),
                );
                if (s !== seq.current) return;
                setResults(perType.flat().slice(0, 20));
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
                                  style={{
                                      position: "fixed",
                                      left: menuRect.left,
                                      width: menuRect.width,
                                      ...(menuRect.top !== null ? { top: menuRect.top } : { bottom: menuRect.bottom }),
                                      // The platform's own answer for an overlay opened from inside
                                      // the workspace shell. A local number cannot stay above it.
                                      zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z,
                                  }}
                                  className="max-h-56 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-xl"
                                  role="listbox"
                                  aria-label="Matching records"
                                  data-testid="record-launch-picker-menu"
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
                                              role="option"
                                              aria-selected={false}
                                              data-testid="record-launch-picker-option"
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
