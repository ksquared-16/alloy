"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { neutral, derived, palette } from "@/styles/tokens/colors";
import {
    SEARCH_MIN_Q_LEN,
    type SearchDestination,
    type SearchResult,
} from "@/lib/search/searchContracts";
import { splitInlineDestinations } from "@/lib/search/searchDestinations";
import { GLOBAL_SEARCH_DROPDOWN_Z_INDEX } from "@/lib/adminV2/globalRecordSearchOpen";
import { dispatchOperatorFocusSelection } from "@/lib/runtime/focus/operatorFocusSelection";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import { warmSearchFocusTarget } from "@/lib/adminV2/globalRecordSearchWarmPrefetch";
import { ADMINV2_GLOBAL_RECORD_SEARCH_INVALIDATE_EVENT } from "@/lib/admin/globalSearch/dispatchGlobalRecordSearchInvalidate";

/**
 * Alloy Search Platform V2 — the global search control.
 *
 * Subject-centred: one row per canonical subject, carrying enough recognition
 * context to tell similar names apart, and exposing useful destinations on the
 * INITIAL result. There is no intermediate search-detail page — clicking the
 * subject opens its canonical Focus Panel; clicking a destination deep-links.
 */

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

/** Recognition line — restrained metadata, meaning before schema. */
function recognitionLine(result: SearchResult): string {
    const r = result.recognition;
    return [r.type_label, r.household_name, r.location_label, r.program_label, r.age_label]
        .filter(Boolean)
        .join(" · ");
}

function relationLine(result: SearchResult): string | null {
    const r = result.recognition;
    const parts: string[] = [];
    if (r.role_note) parts.push(r.role_note);
    if (r.relation_summary) parts.push(r.relation_summary);
    const line = parts.join(" · ");
    if (!line) return null;
    return r.related_names?.length ? `${line} — ${r.related_names.join(" · ")}` : line;
}

type ResultRowProps = {
    result: SearchResult;
    index: number;
    active: boolean;
    onHover: () => void;
    onOpenSubject: () => void;
    onOpenDestination: (destination: SearchDestination) => void;
};

function SearchResultRow({
    result,
    index,
    active,
    onHover,
    onOpenSubject,
    onOpenDestination,
}: ResultRowProps) {
    const [showAll, setShowAll] = useState(false);
    const recognition = recognitionLine(result);
    const relations = relationLine(result);
    const secondary = result.destinations.filter((d) => !d.primary);
    const { inline, overflow } = splitInlineDestinations(secondary);
    const visible = showAll ? secondary : inline;

    return (
        <li role="presentation" data-search-result-index={index}>
            <div
                className={`px-3 py-2.5 transition-colors ${active ? "bg-alloy-forge/[0.05]" : ""}`}
                onMouseEnter={onHover}
            >
                <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-search-subject-button="true"
                    className="w-full text-left"
                    onClick={onOpenSubject}
                >
                    <span className="block text-sm font-medium text-alloy-midnight">
                        {result.subject.display_name}
                    </span>
                    {recognition ?
                        <span className="mt-0.5 block text-xs text-alloy-midnight/55">{recognition}</span>
                    : null}
                    {relations ?
                        <span className="mt-0.5 block text-xs text-alloy-midnight/45">{relations}</span>
                    : null}
                </button>

                {result.contexts.length ?
                    <dl className="mt-1.5 space-y-0.5">
                        {result.contexts.map((context) => (
                            <div key={`${context.kind}:${context.key}`} className="flex gap-1.5 text-xs">
                                <dt className="text-alloy-midnight/50">{context.label}</dt>
                                {context.detail ?
                                    <dd className="text-alloy-midnight/75">— {context.detail}</dd>
                                : null}
                            </div>
                        ))}
                    </dl>
                : null}

                {visible.length ?
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {visible.map((destination) => (
                            <button
                                key={destination.key}
                                type="button"
                                data-search-destination={destination.key}
                                className="rounded-md px-2 py-1 text-xs font-medium transition-colors"
                                style={{ color: palette.bendPine, backgroundColor: "rgba(0, 162, 131, 0.09)" }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDestination(destination);
                                }}
                            >
                                {destination.label}
                            </button>
                        ))}
                        {overflow.length && !showAll ?
                            <button
                                type="button"
                                className="rounded-md px-2 py-1 text-xs text-alloy-midnight/55 transition-colors hover:text-alloy-midnight"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowAll(true);
                                }}
                            >
                                More
                            </button>
                        : null}
                    </div>
                : null}
            </div>
        </li>
    );
}

export default function GlobalSearchBox() {
    const router = useRouter();
    // Record intent goes through the SAME adapter every other record gesture uses. This control
    // renders in the top nav, above every workspace provider — which is why it may not call the
    // runtime kernel directly, and why the adapter (not this component) owns the destination.
    const focusRecord = useOperatorRecordFocus();
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const searchSeq = useRef(0);

    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

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
        const onInvalidate = () => {
            setResults([]);
            setErr(null);
            setActiveIndex(0);
        };
        window.addEventListener(ADMINV2_GLOBAL_RECORD_SEARCH_INVALIDATE_EVENT, onInvalidate);
        return () => window.removeEventListener(ADMINV2_GLOBAL_RECORD_SEARCH_INVALIDATE_EVENT, onInvalidate);
    }, []);

    // Debounced fetch with a monotonic sequence guard. A late response from an
    // older keystroke is dropped, so the list never flashes a stale or falsely
    // empty state while a newer request is still in flight.
    useEffect(() => {
        const trimmed = q.trim();
        if (!open || trimmed.length < SEARCH_MIN_Q_LEN) {
            setResults([]);
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
                        results?: SearchResult[];
                        message?: string;
                        error?: string;
                    };
                    if (seq !== searchSeq.current) return;
                    if (!r.ok || !j.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
                    setResults(Array.isArray(j.results) ? j.results : []);
                    setActiveIndex(0);
                } catch (e) {
                    if (seq !== searchSeq.current) return;
                    setResults([]);
                    setErr(e instanceof Error ? e.message : "Search failed");
                } finally {
                    if (seq === searchSeq.current) setBusy(false);
                }
            })();
        }, 180);

        return () => window.clearTimeout(handle);
    }, [open, q]);

    const dismiss = useCallback(() => {
        setOpen(false);
        setQ("");
        setResults([]);
    }, []);

    /**
     * Go to a destination.
     *
     * Search DISMISSES FIRST, before anything asynchronous: the operator's click
     * is acknowledged immediately even though the Focus Panel will not reveal the
     * destination until K3 says it is Operational. Perceived speed comes from that
     * acknowledgement plus warm prefetch — never from painting an unready card.
     *
     * This component never constructs a URL and never opens an overlay.
     */
    const openDestination = useCallback(
        (destination: SearchDestination) => {
            if (destination.target === "route" && destination.href) {
                dismiss();
                router.push(destination.href);
                return;
            }

            // ── RECORD INTENT ──
            //
            // "Show me Lennon." No lens, no host case, no Work Unit — those answer "where is this
            // WORKED", and this gesture is not asking that. The adapter owns the destination for
            // both realizations (in-workspace host, or the canonical address on a cold entry), so
            // this control states intent and nothing else.
            if (destination.target === "durable_record") {
                const subjectType = (destination.subject_type ?? "").trim();
                const subjectId = (destination.subject_id ?? "").trim();
                if (!subjectType || !subjectId) return;
                dismiss();
                void focusRecord({
                    // The adapter speaks table names; the destination speaks grains.
                    entity_type: subjectType === "child" ? "customer_members" : "persons",
                    entity_id: subjectId,
                    intent: "durable_record",
                    preferred_context_key: destination.preferred_context_key ?? null,
                });
                return;
            }
            const hostType = (destination.host_entity_type ?? "").trim();
            const hostId = (destination.host_entity_id ?? "").trim();
            if (destination.target !== "focus_panel" || !destination.card_key || !hostType || !hostId) return;

            // Dismiss FIRST — the click is acknowledged immediately even though the
            // destination is not revealed until it is Operational.
            dismiss();

            const selection = {
                entity_type: hostType,
                entity_id: hostId,
                host_work_unit_key: (destination.host_work_unit_key ?? "").trim() || null,
                // The participant's own Work View, when their stage has one. The listener prefers
                // it over the case unit above — a waitlisted child must not be sent to the family's
                // Lead queue, which does not contain them.
                host_work_view_id: (destination.host_work_view_id ?? "").trim() || null,
                // The Work View's own ROW identity, kept apart from the host above. A child-grain
                // lens evaluates participations, so the case that hosts the panel is not a row in it
                // — sending the case as the subject is what produced "That record isn't in this
                // Work View" over a destination whose membership was perfectly truthful.
                operational_member_id: (destination.operational_member_id ?? "").trim() || null,
                card_focus: {
                    card_key: destination.card_key,
                    item_id: destination.item_id ?? null,
                    context_key: destination.context_key ?? null,
                },
            };

            // ── A SEARCH CLICK IS AN ATTENTION MOVEMENT, NOT A NAVIGATION ──
            //
            // `/workspace/work-unit/:slug` is SEED-ONLY: the route renders nothing and
            // the Surface Host, mounted above it inside the Runtime Kernel, is the one
            // renderer of the work-unit surface. A URL may establish attention exactly
            // once, on cold load. So `router.push` to a work-unit route does not open
            // it — measured: the URL changed, the server rendered the route in 2.9s,
            // and the surface was blank forever with no error.
            //
            // The intent is therefore stated once and applied by `OperatorFocusAttentionListener`,
            // which sits inside the kernel — where this control cannot: it renders in the top nav,
            // outside every workspace provider, and calling the hook here throws and takes the whole
            // nav down (browser certification caught exactly that). Search is not special; the same
            // listener serves every producer that states a focus intent from outside the runtime.
            //
            // `host_work_unit_key` is a real `work_units.key`, resolved server-side from the host
            // record's own queue membership. When it is absent there is no operational surface to
            // move to and the gesture does nothing — it must never fall back to an overlay, which is
            // the product this replaces.
            dispatchOperatorFocusSelection(selection);
        },
        [dismiss, router, focusRecord]
    );

    const openSubject = useCallback(
        (result: SearchResult) => {
            const primary = result.destinations.find((d) => d.primary);
            if (primary) openDestination(primary);
        },
        [openDestination]
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
            if (!results.length) return;
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!results.length) return;
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const result = results[activeIndex];
            if (result) openSubject(result);
        }
    };

    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector<HTMLElement>(`[data-search-result-index="${activeIndex}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    const trimmed = q.trim();
    const showPanel = open && (trimmed.length > 0 || busy || err != null);
    const showEmpty = !busy && trimmed.length >= SEARCH_MIN_Q_LEN && results.length === 0 && !err;

    const activeDescendant = useMemo(
        () => (results.length ? `adminv2-search-result-${activeIndex}` : undefined),
        [results.length, activeIndex]
    );

    return (
        <div ref={wrapRef} className="relative min-w-0 flex-1 max-w-xl" data-adminv2-global-search-box="true">
            <div
                className="flex items-center gap-2 rounded-lg px-3.5 py-2.5"
                style={{ backgroundColor: derived.searchBgOnPrimary, color: neutral.surface }}
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
                    placeholder="Search…"
                    className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:opacity-75"
                    style={{ color: neutral.surface }}
                    aria-label="Search"
                    aria-expanded={showPanel}
                    aria-controls="adminv2-global-search-results"
                    aria-activedescendant={activeDescendant}
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
                    className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-[min(460px,64vh)] overflow-y-auto rounded-lg border border-alloy-forge/12 bg-white py-1 shadow-[0_4px_16px_rgba(39,63,82,0.1)]"
                    style={{ zIndex: GLOBAL_SEARCH_DROPDOWN_Z_INDEX }}
                >
                    {trimmed.length > 0 && trimmed.length < SEARCH_MIN_Q_LEN ?
                        <p className="px-3.5 py-2 text-sm text-alloy-midnight/55">
                            Type at least {SEARCH_MIN_Q_LEN} characters…
                        </p>
                    : null}
                    {busy ? <p className="px-3.5 py-2 text-sm text-alloy-midnight/55">Searching…</p> : null}
                    {err ? <p className="px-3.5 py-2 text-sm text-alloy-ember">{err}</p> : null}
                    {showEmpty ?
                        <p className="px-3.5 py-2 text-sm text-alloy-midnight/55">No matching results.</p>
                    : null}

                    <ul className="divide-y divide-alloy-forge/[0.07]">
                        {results.map((result, index) => (
                            <SearchResultRow
                                key={`${result.subject.kind}:${result.subject.id}`}
                                result={result}
                                index={index}
                                active={index === activeIndex}
                                onHover={() => {
                                    setActiveIndex(index);
                                    // Warm the subject's drawer before the click lands.
                                    // Warm the target BEFORE the click so K3's
                                    // preparation.terminal arrives sooner.
                                    const primary = result.destinations.find((d) => d.primary);
                                    if (primary) warmSearchFocusTarget(primary);
                                }}
                                onOpenSubject={() => openSubject(result)}
                                onOpenDestination={(d) => openDestination(d)}
                            />
                        ))}
                    </ul>

                    {results.length ?
                        <div className="mx-2 mt-1 border-t border-alloy-forge/8 px-1 py-2 text-[10px] text-alloy-midnight/40">
                            ↑↓ navigate · Enter open · Esc close
                        </div>
                    : null}
                </div>
            : null}
        </div>
    );
}
