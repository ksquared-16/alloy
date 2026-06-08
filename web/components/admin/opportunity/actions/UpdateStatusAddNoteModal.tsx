"use client";

import { useEffect, useMemo, useState } from "react";

type StatusOption = { value: string; label: string };

type TransitionRule = {
    entity_type: string | null;
    department_id: string | null;
    work_unit_id: string | null;
    action_key: string | null;
    to_status_key: string | null;
    required_payload_fields: string[] | null;
    blocked: boolean | null;
    is_active: boolean | null;
};

let transitionRulesCache: { atMs: number; items: TransitionRule[] } | null = null;
let transitionRulesInflight: Promise<TransitionRule[]> | null = null;
const TRANSITION_RULES_TTL_MS = 60_000;

async function loadTransitionRules(signal?: AbortSignal): Promise<TransitionRule[]> {
    const timingEnabled = process.env.NODE_ENV !== "production";
    const t0 = timingEnabled ? performance.now() : 0;
    const now = Date.now();
    if (transitionRulesCache && now - transitionRulesCache.atMs < TRANSITION_RULES_TTL_MS) {
        if (timingEnabled) {
            console.info("[timing][drawer]", {
                phase: "status_transition_rules_cache_hit",
                ms: 0,
            });
        }
        return transitionRulesCache.items;
    }
    if (transitionRulesInflight) return transitionRulesInflight;
    transitionRulesInflight = (async () => {
        const res = await fetch("/api/admin/status-transition-rules", { credentials: "include", signal });
        const json = (await res.json().catch(() => ({}))) as { items?: unknown[]; rules?: unknown[] };
        if (!res.ok) return [];
        const raw = Array.isArray(json.items) ? json.items : Array.isArray(json.rules) ? json.rules : [];
        const list = Array.isArray(raw) ? (raw as any[]) : [];
        const normalized: TransitionRule[] = list
            .map((r) => ({
                entity_type: r?.entity_type ?? null,
                department_id: r?.department_id ?? null,
                work_unit_id: r?.work_unit_id ?? null,
                action_key: r?.action_key ?? null,
                to_status_key: r?.to_status_key ?? null,
                required_payload_fields: Array.isArray(r?.required_payload_fields)
                    ? (r.required_payload_fields as unknown[]).filter((x): x is string => typeof x === "string")
                    : null,
                blocked: r?.blocked ?? null,
                is_active: r?.is_active ?? null,
            }))
            .filter((r) => r.is_active !== false);
        transitionRulesCache = { atMs: Date.now(), items: normalized };
        if (timingEnabled) {
            console.info("[timing][drawer]", {
                phase: "status_transition_rules_fetch",
                url: "/api/admin/status-transition-rules",
                ms: Math.round((performance.now() - t0) * 10) / 10,
            });
        }
        return normalized;
    })().finally(() => {
        transitionRulesInflight = null;
    });
    return transitionRulesInflight;
}

export function UpdateStatusAddNoteModal(props: {
    open: boolean;
    title?: string;
    statusOptions: StatusOption[];
    initialStatusKey?: string | null;
    onClose: () => void;
    transitionContext?: {
        entityType: "opportunities";
        departmentId: string | null;
        workUnitId: string | null;
        actionKey: string | null;
    };
    onSubmit: (payload: Record<string, string>) => Promise<void>;
}) {
    const { open, title = "Update status", statusOptions, initialStatusKey, onClose, onSubmit, transitionContext } = props;
    const [statusKey, setStatusKey] = useState("");
    const [note, setNote] = useState("");
    const [nextStep, setNextStep] = useState("");
    const [extra, setExtra] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rules, setRules] = useState<TransitionRule[]>([]);

    useEffect(() => {
        if (!open) return;
        setStatusKey(initialStatusKey ?? "");
        setNote("");
        setNextStep("");
        setExtra({});
        setError(null);
        setBusy(false);
    }, [open, initialStatusKey]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        const ac = new AbortController();
        (async () => {
            try {
                const normalized = await loadTransitionRules(ac.signal);
                if (!cancelled) setRules(normalized);
            } catch {
                if (!cancelled) setRules([]);
            }
        })();
        return () => {
            cancelled = true;
            ac.abort();
        };
    }, [open]);

    const requiredPayloadFields = useMemo(() => {
        const to = statusKey.trim();
        if (!to) return [];
        const ctx = transitionContext ?? null;
        const matches = rules.filter((r) => {
            if (r.blocked) return false;
            const et = String(r.entity_type ?? "").trim().toLowerCase();
            if (et !== "opportunities" && et !== "opportunity") return false;
            if (String(r.to_status_key ?? "").trim() !== to) return false;
            if (r.department_id && (!ctx?.departmentId || r.department_id !== ctx.departmentId)) return false;
            if (r.work_unit_id && (!ctx?.workUnitId || r.work_unit_id !== ctx.workUnitId)) return false;
            if (r.action_key && (!ctx?.actionKey || r.action_key !== ctx.actionKey)) return false;
            return true;
        });
        const out: string[] = [];
        for (const m of matches) {
            for (const f of m.required_payload_fields ?? []) out.push(f);
        }
        return [...new Set(out)];
    }, [rules, statusKey, transitionContext]);

    const overlay = "fixed inset-0 z-[80] bg-black/20 backdrop-blur-[1px]";
    const panel = "fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-admin-border bg-white shadow-xl";
    const label = "text-[11px] font-semibold tracking-wide text-alloy-forge/50";
    const input =
        "w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue/45 focus:outline-none focus:ring-2 focus:ring-alloy-blue/15 disabled:opacity-60";

    const statusOptionsResolved = useMemo(() => {
        const base = statusOptions ?? [];
        const sorted = [...base].sort((a, b) => a.label.localeCompare(b.label));
        return sorted;
    }, [statusOptions]);

    if (!open) return null;

    return (
        <>
            <div className={overlay} onClick={() => (!busy ? onClose() : null)} />
            <div className={panel} role="dialog" aria-modal="true" aria-label={title}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-alloy-stone/15">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Update the opportunity status and log a quick note.
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <div>
                        <div className={label}>Status</div>
                        <select
                            value={statusKey}
                            disabled={busy}
                            onChange={(e) => setStatusKey(e.target.value)}
                            className={input}
                        >
                            <option value="">Select…</option>
                            {statusOptionsResolved.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {requiredPayloadFields.length ? (
                        <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-2">
                            <div className={label}>Required for this transition</div>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {requiredPayloadFields.map((k) => {
                                    const v = extra[k] ?? "";
                                    const inputType =
                                        k.toLowerCase().includes("date") ? "date" : k.toLowerCase().includes("time") ? "time" : "text";
                                    return (
                                        <label key={k} className="block">
                                            <div className="text-xs font-semibold text-alloy-midnight/70">{k}</div>
                                            <input
                                                type={inputType}
                                                value={v}
                                                disabled={busy}
                                                onChange={(e) =>
                                                    setExtra((prev) => ({
                                                        ...prev,
                                                        [k]: e.target.value,
                                                    }))
                                                }
                                                className={`${input} mt-1`}
                                            />
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                    <div>
                        <div className={label}>Note</div>
                        <textarea
                            value={note}
                            disabled={busy}
                            onChange={(e) => setNote(e.target.value)}
                            className={input}
                            rows={4}
                            placeholder="Add a quick note (optional)."
                        />
                        <div className="mt-1 text-[11px] text-alloy-midnight/45">
                            Notes are stored on the opportunity for now (Enrollment V1).
                        </div>
                    </div>
                    <div>
                        <div className={label}>Next step (optional)</div>
                        <input
                            value={nextStep}
                            disabled={busy}
                            onChange={(e) => setNextStep(e.target.value)}
                            className={input}
                            placeholder="e.g. Confirm tour date with parent"
                        />
                    </div>
                    {error ? (
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-alloy-stone/15">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={busy || !statusKey.trim()}
                        onClick={async () => {
                            if (!statusKey.trim()) return;
                            for (const k of requiredPayloadFields) {
                                const v = String(extra[k] ?? "").trim();
                                if (!v) {
                                    setError(`Missing required field: ${k}`);
                                    return;
                                }
                            }
                            setBusy(true);
                            setError(null);
                            try {
                                await onSubmit({
                                    status_key: statusKey.trim(),
                                    note: note.trim(),
                                    next_step: nextStep.trim(),
                                    ...Object.fromEntries(requiredPayloadFields.map((k) => [k, String(extra[k] ?? "").trim()])),
                                });
                                onClose();
                            } catch (e) {
                                setError(e instanceof Error ? e.message : "Save failed");
                            } finally {
                                setBusy(false);
                            }
                        }}
                        className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {busy ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </>
    );
}

