"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import {
    formatTourDayTabLabel,
    formatTourSlotTimeRangeLabel,
    groupTourSlotsByLocalDate,
    localDateKeyForSlot,
} from "@/lib/tours/availability/groupTourSlotsByLocalDate";
import {
    TOUR_SLOT_PAGE_DAYS,
    formatTourSlotWindowRangeLabel,
    tourSlotWindowBoundsUtc,
} from "@/lib/tours/availability/tourSlotWindowPagination";
import { peekWarmTourSchedule, peekWarmTourScheduleForQuery } from "@/lib/tours/tourScheduleWarmCache";

/** Furthest page (0-based) — ~1 year of 14-day windows without unbounded queries. */
const MAX_RANGE_PAGE_INDEX = 26;

export type OpportunityTourSlotSchedulePanelProps = {
    opportunityId: string;
    locationId: string;
    mode: "schedule" | "reschedule";
    /** Required when mode is reschedule */
    primaryBooking: TourBookingRow | null;
    onCancel: () => void;
    onSuccess: (result?: { booking?: TourBookingRow }) => void | Promise<void>;
    /** Optional link row above actions (e.g. legacy fallback) */
    footerSlot?: ReactNode;
};

export function OpportunityTourSlotSchedulePanel(props: OpportunityTourSlotSchedulePanelProps) {
    const { opportunityId, locationId, mode, primaryBooking, onCancel, onSuccess, footerSlot } = props;
    // Warm-first: if operator intent already warmed this work unit's initial availability, render it
    // synchronously (no skeleton) and re-verify fresh in the background. Only the page-0 window is warm.
    const warmInitial = mode === "schedule" ? peekWarmTourSchedule(opportunityId, locationId) : null;
    const [rulesById, setRulesById] = useState<Record<string, { approval_required: boolean }>>(
        warmInitial?.rulesById ?? {},
    );
    const [slots, setSlots] = useState<AvailableTourSlot[]>(warmInitial?.slots ?? []);
    const [slotsLoading, setSlotsLoading] = useState(!warmInitial);
    const [slotsErr, setSlotsErr] = useState<string | null>(null);
    // Mirror of `slots` so the background refresh never re-flashes the skeleton when warm data is shown.
    const slotsRef = useRef<AvailableTourSlot[]>(warmInitial?.slots ?? []);
    const [selectedSlot, setSelectedSlot] = useState<AvailableTourSlot | null>(null);
    const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [rangePageIndex, setRangePageIndex] = useState(0);
    const loadGeneration = useRef(0);

    useEffect(() => {
        setRangePageIndex(0);
    }, [opportunityId, locationId, mode]);

    const { from: windowFrom, to: windowTo } = useMemo(
        () => tourSlotWindowBoundsUtc(rangePageIndex, TOUR_SLOT_PAGE_DAYS),
        [rangePageIndex]
    );
    const rangeLabel = useMemo(() => formatTourSlotWindowRangeLabel(windowFrom, windowTo), [windowFrom, windowTo]);

    const loadSlots = useCallback(async () => {
        const gen = ++loadGeneration.current;
        setSlotsErr(null);
        // Only show the skeleton when there is nothing to show yet — a warm/background refresh keeps
        // the current availability on screen (no skeleton flash) and swaps in fresh values silently.
        setSlotsLoading(slotsRef.current.length === 0);
        setSelectedSlot(null);
        const qs = new URLSearchParams({
            location_id: locationId,
            from: windowFrom.toISOString(),
            to: windowTo.toISOString(),
        });
        if (mode === "reschedule" && primaryBooking?.id) {
            qs.set("exclude_booking_id", primaryBooking.id);
        }
        const slotsUrl = `/api/admin/tours/slots?${qs.toString()}`;

        // R-005. The warm cache already holds this exact query on the common path (schedule
        // mode, page 0, nothing excluded), so re-issuing it was a guaranteed duplicate of both
        // the slots read and the approval-rules read. Ask the cache whether its entry covers
        // THIS query rather than assuming; a reschedule excludes a booking and paging moves the
        // window, and both are genuinely different queries that still fetch.
        const warmForThisQuery = peekWarmTourScheduleForQuery(opportunityId, locationId, {
            windowFrom,
            windowTo,
            excludeBookingId: mode === "reschedule" ? primaryBooking?.id ?? null : null,
        });
        if (warmForThisQuery) {
            slotsRef.current = warmForThisQuery.slots;
            setSlots(warmForThisQuery.slots);
            setRulesById(warmForThisQuery.rulesById);
            setSlotsLoading(false);
            return;
        }

        try {
            const slotsRes = await fetch(slotsUrl, { credentials: "include" });
            if (gen !== loadGeneration.current) return;
            const slotsJ = (await slotsRes.json()) as { slots?: AvailableTourSlot[]; error?: string };
            if (!slotsRes.ok) throw new Error(slotsJ.error ?? slotsRes.statusText);
            slotsRef.current = slotsJ.slots ?? [];
            setSlots(slotsJ.slots ?? []);

            if (mode === "schedule") {
                try {
                    const rulesRes = await fetch(`/api/admin/tours/availability-rules?location_id=${encodeURIComponent(locationId)}`, {
                        credentials: "include",
                    });
                    if (gen !== loadGeneration.current) return;
                    const rulesJ = (await rulesRes.json()) as { rules?: { id: string; approval_required: boolean }[] };
                    const map: Record<string, { approval_required: boolean }> = {};
                    for (const r of rulesJ.rules ?? []) {
                        map[r.id] = { approval_required: Boolean(r.approval_required) };
                    }
                    setRulesById(map);
                } catch {
                    if (gen === loadGeneration.current) setRulesById({});
                }
            } else {
                setRulesById({});
            }
        } catch (e) {
            if (gen !== loadGeneration.current) return;
            setSlotsErr(e instanceof Error ? e.message : String(e));
        } finally {
            if (gen === loadGeneration.current) {
                setSlotsLoading(false);
            }
        }
    }, [locationId, mode, primaryBooking?.id, windowFrom, windowTo]);

    useEffect(() => {
        void loadSlots();
    }, [loadSlots]);

    const grouped = useMemo(() => groupTourSlotsByLocalDate(slots), [slots]);

    useEffect(() => {
        if (slotsLoading) return;
        if (slots.length === 0) {
            setSelectedDayKey(null);
            return;
        }
        const { orderedDayKeys, byDay } = groupTourSlotsByLocalDate(slots);
        const first = orderedDayKeys[0] ?? null;
        setSelectedDayKey((prev) => {
            if (prev && byDay.has(prev)) return prev;
            return first;
        });
    }, [slotsLoading, slots]);

    const slotsForSelectedDay = useMemo(() => {
        if (!selectedDayKey) return [];
        return grouped.byDay.get(selectedDayKey) ?? [];
    }, [grouped, selectedDayKey]);

    const dayTimezoneHint = slotsForSelectedDay[0]?.timezone?.trim() ?? null;

    const createFromSlot = async () => {
        if (!selectedSlot) return;
        if (mode === "reschedule" && (!primaryBooking || ["canceled", "completed", "no_show"].includes(primaryBooking.status_key))) {
            return;
        }
        setSaving(true);
        setSlotsErr(null);
        try {
            if (mode === "reschedule" && primaryBooking) {
                const res = await fetch(`/api/admin/tours/bookings/${encodeURIComponent(primaryBooking.id)}/reschedule`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        start_at: selectedSlot.startAt,
                        end_at: selectedSlot.endAt,
                        timezone: selectedSlot.timezone,
                    }),
                });
                const j = (await res.json()) as { booking?: TourBookingRow; error?: string };
                if (!res.ok) throw new Error(j.error ?? res.statusText);
                await onSuccess({ booking: j.booking });
            } else {
                const rule = rulesById[selectedSlot.ruleId];
                const approvalRequired = Boolean(rule?.approval_required);
                const res = await fetch("/api/admin/tours/bookings", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        opportunity_id: opportunityId,
                        location_id: locationId,
                        start_at: selectedSlot.startAt,
                        end_at: selectedSlot.endAt,
                        timezone: selectedSlot.timezone,
                        approval_required: approvalRequired,
                    }),
                });
                const j = (await res.json()) as { booking?: TourBookingRow; error?: string };
                if (!res.ok) throw new Error(j.error ?? res.statusText);
                await onSuccess({ booking: j.booking });
            }
        } catch (e) {
            setSlotsErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const title = useMemo(() => (mode === "reschedule" ? "Reschedule tour" : "Pick a time slot"), [mode]);

    const slotMatchesSelection = (s: AvailableTourSlot) =>
        selectedSlot != null && selectedSlot.startAt === s.startAt && selectedSlot.ruleId === s.ruleId;

    const canGoPrev = rangePageIndex > 0;
    const canGoNext = rangePageIndex < MAX_RANGE_PAGE_INDEX;

    return (
        <div className="text-sm text-alloy-midnight" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-alloy-stone/15 px-5 py-4">
                <div className="text-base font-semibold">{title}</div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-medium text-alloy-midnight/70">{rangeLabel}</div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-40"
                            disabled={!canGoPrev || slotsLoading}
                            aria-label="Previous date range"
                            onClick={() => {
                                if (!canGoPrev) return;
                                setRangePageIndex((p) => Math.max(0, p - 1));
                            }}
                        >
                            ← Prev
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-midnight disabled:opacity-40"
                            disabled={!canGoNext || slotsLoading}
                            aria-label="Next date range"
                            onClick={() => {
                                if (!canGoNext) return;
                                setRangePageIndex((p) => Math.min(MAX_RANGE_PAGE_INDEX, p + 1));
                            }}
                        >
                            Next →
                        </button>
                    </div>
                </div>
                <div className="mt-1 text-[11px] text-alloy-midnight/50">
                    Choose a day, then an available time to book the tour.
                </div>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-auto px-5 py-4">
                {slotsLoading ? (
                    <div className="space-y-3" aria-busy="true" aria-label="Loading availability">
                        <div className="h-4 w-1/2 skeleton-pulse rounded bg-alloy-stone/15" />
                        <div className="flex gap-2 overflow-hidden">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-14 w-16 shrink-0 skeleton-pulse rounded-lg bg-alloy-stone/12" />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="h-9 w-24 skeleton-pulse rounded-md bg-alloy-stone/10" />
                            ))}
                        </div>
                    </div>
                ) : null}

                {!slotsLoading && slotsErr ? (
                    <p className="text-xs text-red-700" role="alert">
                        {slotsErr}
                    </p>
                ) : null}

                {!slotsLoading && !slotsErr && slots.length === 0 ? (
                    <p className="text-sm text-alloy-midnight/60">
                        No availability in this window. Try <strong>Next</strong> for later dates, another site, or extend rules.
                    </p>
                ) : null}

                {!slotsLoading && !slotsErr && slots.length > 0 ? (
                    <div className="space-y-3">
                        <div>
                            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Day</div>
                            <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Available days">
                                {grouped.orderedDayKeys.map((dayKey) => {
                                    const daySlots = grouped.byDay.get(dayKey) ?? [];
                                    const sample = daySlots[0];
                                    const selected = dayKey === selectedDayKey;
                                    return (
                                        <button
                                            key={dayKey}
                                            type="button"
                                            role="tab"
                                            aria-selected={selected}
                                            className={`shrink-0 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/30 ${
                                                selected
                                                    ? "border-alloy-bend-pine bg-alloy-bend-pine text-white"
                                                    : "border-alloy-stone/25 bg-white text-alloy-midnight hover:bg-alloy-stone/5"
                                            }`}
                                            onClick={() => {
                                                setSelectedDayKey(dayKey);
                                                setSelectedSlot(null);
                                            }}
                                        >
                                            <div className="leading-tight">{formatTourDayTabLabel(dayKey, sample)}</div>
                                            <div
                                                className={`mt-0.5 text-[10px] font-medium ${selected ? "text-white/80" : "text-alloy-midnight/45"}`}
                                            >
                                                {daySlots.length} slot{daySlots.length === 1 ? "" : "s"}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {selectedDayKey ? (
                            <div role="tabpanel" aria-label={`Times for ${selectedDayKey}`}>
                                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Time</div>
                                    {dayTimezoneHint ? (
                                        <span className="text-[10px] text-alloy-midnight/45" title={dayTimezoneHint}>
                                            {dayTimezoneHint}
                                        </span>
                                    ) : null}
                                </div>
                                {slotsForSelectedDay.length === 0 ? (
                                    <p className="text-xs text-alloy-midnight/55">No times for this day.</p>
                                ) : (
                                    <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                                        {slotsForSelectedDay.map((s) => {
                                            const sel = slotMatchesSelection(s);
                                            return (
                                                <button
                                                    key={`${s.startAt}-${s.ruleId}`}
                                                    type="button"
                                                    aria-pressed={sel}
                                                    className={`rounded-md border px-2.5 py-1.5 text-left text-[12px] font-medium leading-snug transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/30 ${
                                                        sel
                                                            ? "border-alloy-bend-pine bg-alloy-bend-pine/10 text-alloy-midnight"
                                                            : "border-alloy-stone/25 bg-white text-alloy-midnight hover:bg-alloy-stone/5"
                                                    }`}
                                                    onClick={() => setSelectedSlot(s)}
                                                >
                                                    {formatTourSlotTimeRangeLabel(s)}
                                                    {rulesById[s.ruleId]?.approval_required ? (
                                                        <span className="mt-0.5 block text-[10px] font-normal text-amber-800">
                                                            Needs approval
                                                        </span>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {selectedSlot ? (
                            <div className="rounded-lg border border-alloy-bend-pine/30 bg-alloy-bend-pine/5 px-3 py-2 text-[11px] text-alloy-midnight">
                                <span className="font-semibold">Selected:</span>{" "}
                                {formatTourSlotTimeRangeLabel(selectedSlot)} ({localDateKeyForSlot(selectedSlot)})
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {footerSlot ? <div className="border-t border-alloy-stone/10 pt-3">{footerSlot}</div> : null}

                <div className="flex justify-end gap-2 border-t border-alloy-stone/10 pt-3">
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-stone/30 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight transition-colors hover:bg-alloy-stone/5"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-alloy-bend-pine/90 disabled:pointer-events-none disabled:opacity-45"
                        disabled={!selectedSlot || saving || slotsLoading}
                        aria-disabled={!selectedSlot || saving || slotsLoading}
                        onClick={() => void createFromSlot()}
                    >
                        {saving ? "Saving…" : mode === "reschedule" ? "Save reschedule" : "Book tour"}
                    </button>
                </div>
            </div>
        </div>
    );
}
