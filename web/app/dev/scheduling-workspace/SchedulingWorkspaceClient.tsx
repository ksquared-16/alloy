"use client";

/**
 * Scheduling workspace (Milestone 1) — the Place-a-Child loop on the built,
 * tested decision engine: Overview (unplaced queue) → pick a child + pattern →
 * deterministic options (Recommended / Eligible / Blocked, calc-grounded) →
 * Commit through the schedule.create command → reflected (queue updates, the
 * child's canonical projection reads Scheduled).
 *
 * Read-first, single-decision-single-commit per the frozen product spec. Money
 * is displayed only (Billing owns it); the financial line shows the interim
 * BillingScheduleProjection state.
 */

import { useCallback, useEffect, useState } from "react";

type Site = { id: string; name: string };
type Pattern = { id: string; label: string; weekdays: number[] };
type UnplacedChild = {
    agreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    name: string;
    startDate: string | null;
};
type PlacementOption = {
    roomId: string;
    roomName: string | null;
    classification: "recommended" | "eligible" | "blocked";
    reason: string;
    beforePeakOccupancy: number;
    afterPeakOccupancy: number;
    blockers: string[];
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtDays(weekdays: number[]): string {
    return weekdays.slice().sort((a, b) => a - b).map((d) => WEEKDAY[d] ?? d).join(" ");
}

async function api(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`/api/admin/scheduling${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
    return body;
}

export default function SchedulingWorkspaceClient() {
    const [sites, setSites] = useState<Site[]>([]);
    const [siteId, setSiteId] = useState<string>("");
    const [unplaced, setUnplaced] = useState<UnplacedChild[]>([]);
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [activeChild, setActiveChild] = useState<UnplacedChild | null>(null);
    const [patternId, setPatternId] = useState<string>("");
    const [options, setOptions] = useState<PlacementOption[] | null>(null);
    const [selectedRoom, setSelectedRoom] = useState<string>("");
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [confirmation, setConfirmation] = useState<string | null>(null);

    const loadOverview = useCallback(async (site: string) => {
        const data = await api(`?view=overview&site_location_id=${encodeURIComponent(site)}`);
        setUnplaced(data.unplaced ?? []);
        setPatterns(data.patterns ?? []);
        if ((data.patterns ?? []).length > 0) setPatternId((p) => p || data.patterns[0].id);
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const data = await api("?view=sites");
                const list: Site[] = data.sites ?? [];
                setSites(list);
                if (list.length > 0) {
                    setSiteId(list[0].id);
                    await loadOverview(list[0].id);
                }
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setLoading(false);
            }
        })();
    }, [loadOverview]);

    async function onSelectSite(id: string) {
        setSiteId(id);
        setActiveChild(null);
        setOptions(null);
        setConfirmation(null);
        setLoading(true);
        try {
            await loadOverview(id);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    async function openPlace(child: UnplacedChild) {
        setActiveChild(child);
        setOptions(null);
        setConfirmation(null);
        setSelectedRoom("");
        await loadOptions(child, patternId);
    }

    async function loadOptions(child: UnplacedChild, pattern: string) {
        if (!pattern) return;
        setOptionsLoading(true);
        setError(null);
        try {
            const start = child.startDate ?? "";
            const data = await api(
                `?view=options&site_location_id=${encodeURIComponent(siteId)}&child_agreement_id=${encodeURIComponent(
                    child.agreementId
                )}&pattern_id=${encodeURIComponent(pattern)}${start ? `&start_date=${start}` : ""}`
            );
            const opts: PlacementOption[] = data.options ?? [];
            setOptions(opts);
            const rec = opts.find((o) => o.classification === "recommended");
            setSelectedRoom(rec?.roomId ?? "");
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setOptionsLoading(false);
        }
    }

    async function commit() {
        if (!activeChild || !selectedRoom || !patternId) return;
        const opt = options?.find((o) => o.roomId === selectedRoom);
        const pattern = patterns.find((p) => p.id === patternId);
        setCommitting(true);
        setError(null);
        try {
            await api("", {
                method: "POST",
                body: JSON.stringify({
                    customer_member_id: activeChild.customerMemberId,
                    enrollment_agreement_id: activeChild.agreementId,
                    schedule_pattern_id: patternId,
                    room_location_id: selectedRoom,
                    start_date: activeChild.startDate,
                    room_label: opt?.roomName ?? "",
                    pattern_label: pattern?.label ?? "",
                    child_name: activeChild.name,
                }),
            });
            setConfirmation(
                `${activeChild.name} is placed in ${opt?.roomName ?? "the room"}${
                    pattern ? `, ${fmtDays(pattern.weekdays)}` : ""
                }${activeChild.startDate ? `, from ${activeChild.startDate}` : ""}.`
            );
            setActiveChild(null);
            setOptions(null);
            await loadOverview(siteId); // reflect: the child drops out of the queue
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setCommitting(false);
        }
    }

    return (
        <div className="pt-6" data-testid="scheduling-workspace">
            <h1 className="text-xl font-semibold text-slate-900">Scheduling</h1>
            <p className="mt-1 text-sm text-slate-500">Place children who need a room.</p>

            <div className="mt-4 flex items-center gap-2">
                <label className="text-sm text-slate-600">Site</label>
                <select
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={siteId}
                    onChange={(e) => onSelectSite(e.target.value)}
                >
                    {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </div>

            {error && (
                <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    {error}
                </div>
            )}
            {confirmation && (
                <div
                    className="mt-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                    data-testid="commit-confirmation"
                >
                    {confirmation}
                </div>
            )}

            {loading ? (
                <p className="mt-6 text-sm text-slate-400">Loading…</p>
            ) : (
                <section className="mt-6">
                    <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Needs a room</h2>
                    {unplaced.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500" data-testid="queue-empty">
                            Every child has a room.
                        </p>
                    ) : (
                        <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200">
                            {unplaced.map((child) => (
                                <li key={child.agreementId} className="flex items-center justify-between px-3 py-2">
                                    <div>
                                        <div className="text-sm font-medium text-slate-800">{child.name}</div>
                                        <div className="text-xs text-slate-500">
                                            Needs a room{child.startDate ? ` · starts ${child.startDate}` : ""}
                                        </div>
                                    </div>
                                    <button
                                        className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
                                        onClick={() => openPlace(child)}
                                        data-testid={`place-${child.agreementId}`}
                                    >
                                        Place {child.name.split(/\s+/)[0]}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {activeChild && (
                <section className="mt-6 rounded border border-slate-200 p-4" data-testid="place-panel">
                    <h2 className="text-sm font-semibold text-slate-800">Place {activeChild.name}</h2>

                    <div className="mt-3 flex items-center gap-2">
                        <label className="text-sm text-slate-600">Schedule</label>
                        <select
                            className="rounded border border-slate-300 px-2 py-1 text-sm"
                            value={patternId}
                            onChange={(e) => {
                                setPatternId(e.target.value);
                                loadOptions(activeChild, e.target.value);
                            }}
                        >
                            {patterns.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.label} ({fmtDays(p.weekdays)})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="mt-4">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rooms</div>
                        {optionsLoading ? (
                            <p className="mt-2 text-sm text-slate-400">Computing options…</p>
                        ) : options && options.length > 0 ? (
                            <ul className="mt-2 space-y-2">
                                {options.map((o) => {
                                    const disabled = o.classification === "blocked";
                                    const isSel = selectedRoom === o.roomId;
                                    return (
                                        <li key={o.roomId}>
                                            <button
                                                disabled={disabled}
                                                onClick={() => setSelectedRoom(o.roomId)}
                                                data-testid={`option-${o.roomId}`}
                                                className={[
                                                    "flex w-full items-center justify-between rounded border px-3 py-2 text-left",
                                                    disabled
                                                        ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                                                        : isSel
                                                        ? "border-emerald-500 bg-emerald-50"
                                                        : "border-slate-200 hover:border-slate-300",
                                                ].join(" ")}
                                            >
                                                <span>
                                                    <span className="text-sm font-medium text-slate-800">
                                                        {o.roomName ?? o.roomId}
                                                    </span>
                                                    <span className="ml-2 text-xs text-slate-500">{o.reason}</span>
                                                </span>
                                                <span
                                                    className={[
                                                        "rounded px-2 py-0.5 text-xs font-medium",
                                                        o.classification === "recommended"
                                                            ? "bg-emerald-100 text-emerald-700"
                                                            : o.classification === "blocked"
                                                            ? "bg-slate-200 text-slate-500"
                                                            : "bg-slate-100 text-slate-600",
                                                    ].join(" ")}
                                                >
                                                    {o.classification}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="mt-2 text-sm text-slate-500">No eligible room for this schedule.</p>
                        )}
                    </div>

                    <div className="mt-4 rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-700">Recurring tuition</span> — pending Billing
                        determination
                    </div>

                    <div className="mt-4 flex gap-2">
                        <button
                            disabled={!selectedRoom || committing}
                            onClick={commit}
                            data-testid="commit-placement"
                            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                            {committing ? "Committing…" : "Commit placement"}
                        </button>
                        <button
                            onClick={() => {
                                setActiveChild(null);
                                setOptions(null);
                            }}
                            className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}
