"use client";

import { formatDate } from "@/lib/adminFormatters";
import { useEffect, useMemo, useRef, useState } from "react";

export type InquiryChildRow = {
    id: string;
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    dob: string | null;
    age: string | null;
    desired_program_type: string | null;
    desired_program_label: string | null;
    desired_schedule_type: string | null;
    desired_schedule_label: string | null;
    outcome_status_key: string | null;
    outcome_status_label: string | null;
    notes: string | null;
};

type OptionItem = { item_key: string; label: string | null };
type StatusRow = { status_key: string; status_label: string | null; sort_order?: number | null };

function normalizeKey(v: string | null | undefined): string {
    return (v ?? "").trim();
}

function useDebouncedPatch(ms: number) {
    const timers = useRef(new Map<string, number>());
    const queue = useRef(new Map<string, Record<string, unknown>>());

    const schedule = (id: string, patch: Record<string, unknown>, run: (id: string, patch: Record<string, unknown>) => void) => {
        const next = { ...(queue.current.get(id) ?? {}), ...patch };
        queue.current.set(id, next);
        const existing = timers.current.get(id);
        if (existing) window.clearTimeout(existing);
        const t = window.setTimeout(() => {
            timers.current.delete(id);
            const p = queue.current.get(id);
            if (!p) return;
            queue.current.delete(id);
            run(id, p);
        }, ms);
        timers.current.set(id, t);
    };

    const flush = (id: string, run: (id: string, patch: Record<string, unknown>) => void) => {
        const existing = timers.current.get(id);
        if (existing) window.clearTimeout(existing);
        timers.current.delete(id);
        const p = queue.current.get(id);
        if (!p) return;
        queue.current.delete(id);
        run(id, p);
    };

    useEffect(() => {
        return () => {
            for (const t of timers.current.values()) window.clearTimeout(t);
            timers.current.clear();
            queue.current.clear();
        };
    }, []);

    return { schedule, flush };
}

export default function OpportunityInquiryChildrenSection({
    rows,
    canEdit,
    onOpenChild,
}: {
    rows: InquiryChildRow[];
    canEdit: boolean;
    onOpenChild?: (row: Pick<InquiryChildRow, "person_id" | "customer_member_id" | "display_name">) => void;
}) {
    if (!rows.length) {
        return (
            <div className="md:col-span-2 rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight/60">
                No children added to this inquiry yet.
            </div>
        );
    }

    const [programItems, setProgramItems] = useState<OptionItem[]>([]);
    const [scheduleItems, setScheduleItems] = useState<OptionItem[]>([]);
    const [statusItems, setStatusItems] = useState<StatusRow[]>([]);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const [local, setLocal] = useState<Record<string, { desired_program_type: string; desired_schedule_type: string; outcome_status_key: string; notes: string }>>(
        {}
    );
    const [savingById, setSavingById] = useState<Record<string, boolean>>({});
    const [errorById, setErrorById] = useState<Record<string, string | null>>({});

    useEffect(() => {
        setLocal((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                if (!r.id) continue;
                next[r.id] = {
                    desired_program_type: normalizeKey(r.desired_program_type),
                    desired_schedule_type: normalizeKey(r.desired_schedule_type),
                    outcome_status_key: normalizeKey(r.outcome_status_key),
                    notes: (r.notes ?? "").toString(),
                };
            }
            return next;
        });
    }, [rows]);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                setLoadErr(null);
                const [progRes, schedRes, statusRes] = await Promise.all([
                    fetch("/api/admin/option-sets/childcare_program_type"),
                    fetch("/api/admin/option-sets/childcare_schedule_type"),
                    fetch("/api/admin/status-definitions?entity_type=opportunity_customer_members"),
                ]);
                const progJson = (await progRes.json().catch(() => ({}))) as { items?: OptionItem[]; error?: string };
                const schedJson = (await schedRes.json().catch(() => ({}))) as { items?: OptionItem[]; error?: string };
                const statusJson = (await statusRes.json().catch(() => ({}))) as { statuses?: StatusRow[]; error?: string };
                if (!progRes.ok) throw new Error(progJson.error ?? "Failed to load program types");
                if (!schedRes.ok) throw new Error(schedJson.error ?? "Failed to load schedule types");
                if (!statusRes.ok) throw new Error(statusJson.error ?? "Failed to load outcome statuses");
                if (cancelled) return;
                setProgramItems((progJson.items ?? []).slice());
                setScheduleItems((schedJson.items ?? []).slice());
                setStatusItems((statusJson.statuses ?? []).slice().sort((a, b) => (Number(a.sort_order ?? 100) - Number(b.sort_order ?? 100))));
            } catch (e) {
                if (cancelled) return;
                setLoadErr((e as Error).message);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const programLabelByKey = useMemo(() => new Map(programItems.map((i) => [i.item_key, i.label ?? i.item_key])), [programItems]);
    const scheduleLabelByKey = useMemo(() => new Map(scheduleItems.map((i) => [i.item_key, i.label ?? i.item_key])), [scheduleItems]);
    const statusLabelByKey = useMemo(
        () => new Map(statusItems.map((s) => [s.status_key, s.status_label ?? s.status_key])),
        [statusItems]
    );

    const debounced = useDebouncedPatch(600);

    const savePatch = async (id: string, patch: Record<string, unknown>) => {
        setSavingById((p) => ({ ...p, [id]: true }));
        setErrorById((p) => ({ ...p, [id]: null }));
        try {
            const res = await fetch(`/api/admin/opportunity-customer-members/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Save failed");
        } catch (e) {
            setErrorById((p) => ({ ...p, [id]: (e as Error).message }));
        }
        setSavingById((p) => ({ ...p, [id]: false }));
    };

    return (
        <div className="md:col-span-2">
            <div className="overflow-x-auto rounded-lg border border-alloy-stone/25 bg-white">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-alloy-stone/25 bg-alloy-stone/10">
                        <tr className="text-[11px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/55">
                            <th className="px-3 py-2">Child</th>
                            <th className="px-3 py-2">DOB / Age</th>
                            <th className="px-3 py-2">Desired program</th>
                            <th className="px-3 py-2">Desired schedule</th>
                            <th className="px-3 py-2">Outcome</th>
                            <th className="px-3 py-2">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadErr ? (
                            <tr className="border-b border-alloy-stone/20 last:border-b-0">
                                <td className="px-3 py-2 text-sm text-red-700" colSpan={6}>
                                    {loadErr}
                                </td>
                            </tr>
                        ) : null}
                        {rows.map((r) => {
                            const name = (r.display_name ?? "").trim() || "—";
                            const dob = r.dob ? formatDate(r.dob) : "—";
                            const age = (r.age ?? "").trim();
                            const dobAge = age ? `${dob} · ${age}` : dob;
                            const st = local[r.id] ?? {
                                desired_program_type: normalizeKey(r.desired_program_type),
                                desired_schedule_type: normalizeKey(r.desired_schedule_type),
                                outcome_status_key: normalizeKey(r.outcome_status_key),
                                notes: (r.notes ?? "").toString(),
                            };
                            const saving = !!savingById[r.id];
                            const err = errorById[r.id];

                            const fallbackProgram = (r.desired_program_label ?? "").trim() || (st.desired_program_type ? (programLabelByKey.get(st.desired_program_type) ?? st.desired_program_type) : "—");
                            const fallbackSchedule = (r.desired_schedule_label ?? "").trim() || (st.desired_schedule_type ? (scheduleLabelByKey.get(st.desired_schedule_type) ?? st.desired_schedule_type) : "—");
                            const fallbackOutcome = (r.outcome_status_label ?? "").trim() || (st.outcome_status_key ? (statusLabelByKey.get(st.outcome_status_key) ?? st.outcome_status_key) : "—");
                            return (
                                <tr key={r.id} className="border-b border-alloy-stone/20 last:border-b-0">
                                    <td className="px-3 py-2 font-medium text-alloy-midnight/85">
                                        {onOpenChild && name !== "—" ? (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onOpenChild({
                                                        person_id: r.person_id,
                                                        customer_member_id: r.customer_member_id,
                                                        display_name: r.display_name,
                                                    })
                                                }
                                                className="text-left text-alloy-blue hover:underline font-semibold"
                                            >
                                                {name}
                                            </button>
                                        ) : (
                                            name
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-alloy-midnight/65 tabular-nums">{dobAge}</td>
                                    <td className="px-3 py-2 text-alloy-midnight/65">
                                        {canEdit ? (
                                            <select
                                                value={st.desired_program_type}
                                                disabled={!canEdit || saving}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setLocal((p) => ({ ...p, [r.id]: { ...st, desired_program_type: v } }));
                                                    debounced.schedule(r.id, { desired_program_type: v || null }, savePatch);
                                                }}
                                                className="w-full min-w-[150px] rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60"
                                                aria-label={`Desired program for ${name}`}
                                            >
                                                <option value="">(inherit)</option>
                                                {programItems.map((i) => (
                                                    <option key={i.item_key} value={i.item_key}>
                                                        {i.label ?? i.item_key}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            fallbackProgram
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-alloy-midnight/65">
                                        {canEdit ? (
                                            <select
                                                value={st.desired_schedule_type}
                                                disabled={!canEdit || saving}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setLocal((p) => ({ ...p, [r.id]: { ...st, desired_schedule_type: v } }));
                                                    debounced.schedule(r.id, { desired_schedule_type: v || null }, savePatch);
                                                }}
                                                className="w-full min-w-[150px] rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60"
                                                aria-label={`Desired schedule for ${name}`}
                                            >
                                                <option value="">(inherit)</option>
                                                {scheduleItems.map((i) => (
                                                    <option key={i.item_key} value={i.item_key}>
                                                        {i.label ?? i.item_key}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            fallbackSchedule
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-alloy-midnight/65">
                                        {canEdit ? (
                                            <select
                                                value={st.outcome_status_key}
                                                disabled={!canEdit || saving}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setLocal((p) => ({ ...p, [r.id]: { ...st, outcome_status_key: v } }));
                                                    debounced.schedule(r.id, { outcome_status_key: v || null }, savePatch);
                                                }}
                                                className="w-full min-w-[150px] rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60"
                                                aria-label={`Outcome for ${name}`}
                                            >
                                                <option value="">—</option>
                                                {statusItems.map((s) => (
                                                    <option key={s.status_key} value={s.status_key}>
                                                        {s.status_label ?? s.status_key}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            fallbackOutcome
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-alloy-midnight/65">
                                        {canEdit ? (
                                            <div className="min-w-[260px] max-w-[420px]">
                                                <input
                                                    value={st.notes}
                                                    disabled={!canEdit || saving}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setLocal((p) => ({ ...p, [r.id]: { ...st, notes: v } }));
                                                        debounced.schedule(r.id, { notes: v }, savePatch);
                                                    }}
                                                    onBlur={() => debounced.flush(r.id, savePatch)}
                                                    className="w-full rounded-md border border-alloy-stone/40 bg-white px-2 py-1 text-sm disabled:opacity-60"
                                                    placeholder="Add notes…"
                                                    aria-label={`Notes for ${name}`}
                                                />
                                                {err ? <div className="mt-1 text-[11px] font-medium text-red-700">{err}</div> : null}
                                                {saving ? <div className="mt-1 text-[11px] font-medium text-alloy-midnight/45">Saving…</div> : null}
                                            </div>
                                        ) : (
                                            <span className="block max-w-[280px] truncate" title={normalizeKey(r.notes) ? String(r.notes) : undefined}>
                                                {normalizeKey(r.notes) ? String(r.notes).trim() : "—"}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

