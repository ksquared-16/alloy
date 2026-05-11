"use client";

import { useEffect, useState } from "react";
import type { AvailableTourSlot } from "@/lib/tours/availability/types";

type ResolveJson = { ok?: boolean; opportunity_label?: string; location_label?: string; error?: string };

export default function TourBookingPublicClient({ token }: { token: string }) {
    const [resolved, setResolved] = useState<ResolveJson | null>(null);
    const [slots, setSlots] = useState<AvailableTourSlot[]>([]);
    const [pick, setPick] = useState<AvailableTourSlot | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void (async () => {
            try {
                const r = await fetch(`/api/public/tour-booking/${encodeURIComponent(token)}/resolve`);
                const j = (await r.json()) as ResolveJson;
                if (!r.ok) {
                    setErr((j as { error?: string }).error ?? r.statusText);
                    return;
                }
                setResolved(j);
                const from = new Date();
                from.setUTCHours(0, 0, 0, 0);
                const to = new Date(from);
                to.setUTCDate(to.getUTCDate() + 21);
                const sr = await fetch(
                    `/api/public/tour-booking/${encodeURIComponent(token)}/slots?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
                );
                const sj = (await sr.json()) as { ok?: boolean; slots?: AvailableTourSlot[]; error?: string };
                if (!sr.ok) {
                    setErr(sj.error ?? sr.statusText);
                    return;
                }
                setSlots(sj.slots ?? []);
            } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
            }
        })();
    }, [token]);

    const book = async () => {
        if (!pick) return;
        setBusy(true);
        setErr(null);
        try {
            const res = await fetch(`/api/public/tour-booking/${encodeURIComponent(token)}/book`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rule_id: pick.ruleId,
                    start_at: pick.startAt,
                    end_at: pick.endAt,
                    timezone: pick.timezone,
                }),
            });
            const j = (await res.json()) as { ok?: boolean; error?: string; booking?: { status_key?: string } };
            if (!res.ok) throw new Error(j.error ?? res.statusText);
            setErr(null);
            setResolved((prev) => ({ ...prev, opportunity_label: `${prev?.opportunity_label ?? "Tour"} — booked (${j.booking?.status_key ?? "ok"})` }));
            setSlots([]);
            setPick(null);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    if (err && !resolved) {
        return <div className="mx-auto max-w-md p-6 text-sm text-red-800">{err}</div>;
    }

    return (
        <div className="mx-auto max-w-lg space-y-4 p-6">
            <h1 className="text-lg font-semibold text-alloy-midnight">Book a tour</h1>
            {resolved ? (
                <p className="text-sm text-alloy-midnight/70">
                    {resolved.opportunity_label} · {resolved.location_label}
                </p>
            ) : (
                <p className="text-sm text-alloy-midnight/55">Loading…</p>
            )}
            {err ? <p className="text-sm text-red-700">{err}</p> : null}
            <ul className="max-h-80 space-y-1 overflow-auto rounded border border-alloy-stone/15 p-2 text-sm">
                {slots.map((s) => (
                    <li key={`${s.startAt}-${s.ruleId}`}>
                        <button
                            type="button"
                            className={`w-full rounded px-2 py-2 text-left ${pick?.startAt === s.startAt && pick?.ruleId === s.ruleId ? "bg-alloy-midnight/10" : "hover:bg-alloy-stone/10"}`}
                            onClick={() => setPick(s)}
                        >
                            {new Date(s.startAt).toLocaleString(undefined, { timeZone: s.timezone })} —{" "}
                            {new Date(s.endAt).toLocaleString(undefined, { timeZone: s.timezone })}
                        </button>
                    </li>
                ))}
            </ul>
            <button
                type="button"
                className="rounded-lg bg-alloy-midnight px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!pick || busy || slots.length === 0}
                onClick={() => void book()}
            >
                Request booking
            </button>
            <p className="text-[11px] text-alloy-midnight/50">
                If this site requires approval, your request stays pending until staff confirms. No account is created on this page.
            </p>
        </div>
    );
}
