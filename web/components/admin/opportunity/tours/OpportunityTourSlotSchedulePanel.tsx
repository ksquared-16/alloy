"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";

export type OpportunityTourSlotSchedulePanelProps = {
    opportunityId: string;
    locationId: string;
    mode: "schedule" | "reschedule";
    /** Required when mode is reschedule */
    primaryBooking: TourBookingRow | null;
    onCancel: () => void;
    onSuccess: () => void | Promise<void>;
    /** Optional link row above actions (e.g. legacy fallback) */
    footerSlot?: ReactNode;
};

export function OpportunityTourSlotSchedulePanel(props: OpportunityTourSlotSchedulePanelProps) {
    const { opportunityId, locationId, mode, primaryBooking, onCancel, onSuccess, footerSlot } = props;
    const [rulesById, setRulesById] = useState<Record<string, { approval_required: boolean }>>({});
    const [slots, setSlots] = useState<AvailableTourSlot[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(true);
    const [slotsErr, setSlotsErr] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AvailableTourSlot | null>(null);
    const [saving, setSaving] = useState(false);

    const loadRules = useCallback(async () => {
        const res = await fetch(`/api/admin/tours/availability-rules?location_id=${encodeURIComponent(locationId)}`, {
            credentials: "include",
        });
        const j = (await res.json()) as { rules?: { id: string; approval_required: boolean }[] };
        const map: Record<string, { approval_required: boolean }> = {};
        for (const r of j.rules ?? []) {
            map[r.id] = { approval_required: Boolean(r.approval_required) };
        }
        setRulesById(map);
    }, [locationId]);

    const loadSlots = useCallback(async () => {
        setSlotsErr(null);
        setSlotsLoading(true);
        setSelectedSlot(null);
        if (mode === "schedule") {
            await loadRules();
        }
        const from = new Date();
        from.setUTCHours(0, 0, 0, 0);
        const to = new Date(from);
        to.setUTCDate(to.getUTCDate() + 21);
        try {
            const qs = new URLSearchParams({
                location_id: locationId,
                from: from.toISOString(),
                to: to.toISOString(),
            });
            const res = await fetch(`/api/admin/tours/slots?${qs.toString()}`, { credentials: "include" });
            const j = (await res.json()) as { slots?: AvailableTourSlot[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setSlots(j.slots ?? []);
        } catch (e) {
            setSlotsErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSlotsLoading(false);
        }
    }, [locationId, mode, loadRules]);

    useEffect(() => {
        void loadSlots();
    }, [loadSlots]);

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
                const j = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? res.statusText);
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
                const j = (await res.json()) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? res.statusText);
            }
            await onSuccess();
        } catch (e) {
            setSlotsErr(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    };

    const title = useMemo(() => (mode === "reschedule" ? "Reschedule tour" : "Pick a time slot"), [mode]);

    return (
        <div className="text-sm text-alloy-midnight" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-alloy-stone/15 px-5 py-4">
                <div className="text-base font-semibold">{title}</div>
                <div className="mt-0.5 text-xs text-alloy-midnight/60">
                    Uses live availability rules and <code className="rounded bg-alloy-stone/10 px-1">tour_bookings</code>.
                </div>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-auto px-5 py-4">
                {slotsLoading ? <p className="text-xs text-alloy-midnight/55">Loading slots…</p> : null}
                {slotsErr ? <p className="text-xs text-red-700">{slotsErr}</p> : null}
                {!slotsLoading && slots.length === 0 ? <p className="text-xs text-alloy-midnight/60">No slots in range.</p> : null}
                <ul className="max-h-56 space-y-1 overflow-auto text-xs">
                    {slots.map((s) => (
                        <li key={`${s.startAt}-${s.ruleId}`}>
                            <button
                                type="button"
                                className={`w-full rounded border px-2 py-1.5 text-left ${
                                    selectedSlot?.startAt === s.startAt && selectedSlot?.ruleId === s.ruleId
                                        ? "border-alloy-midnight bg-alloy-midnight/5"
                                        : "border-alloy-stone/15 hover:bg-alloy-stone/5"
                                }`}
                                onClick={() => setSelectedSlot(s)}
                            >
                                {new Date(s.startAt).toLocaleString(undefined, { timeZone: s.timezone })} —{" "}
                                {new Date(s.endAt).toLocaleString(undefined, { timeZone: s.timezone })}{" "}
                                <span className="text-alloy-midnight/50">({s.timezone})</span>
                                {rulesById[s.ruleId]?.approval_required ? (
                                    <span className="ml-1 text-amber-700"> · needs approval</span>
                                ) : null}
                            </button>
                        </li>
                    ))}
                </ul>
                {footerSlot ? <div className="border-t border-alloy-stone/10 pt-3">{footerSlot}</div> : null}
                <div className="flex justify-end gap-2 border-t border-alloy-stone/10 pt-3">
                    <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-midnight px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!selectedSlot || saving}
                        onClick={() => void createFromSlot()}
                    >
                        {saving ? "Saving…" : mode === "reschedule" ? "Save reschedule" : "Book tour"}
                    </button>
                </div>
            </div>
        </div>
    );
}
