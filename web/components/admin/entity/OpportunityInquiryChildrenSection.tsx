"use client";

import { AdminV2DrawerLoadingState } from "@/components/admin/workspace/AdminV2DrawerLoadingState";
import { formatDate } from "@/lib/adminFormatters";
import {
    buildCustomerMemberPatch,
    ensureOpportunityCustomerMemberLink,
    patchCustomerMemberFromInquiryChild,
    patchOpportunityCustomerMemberFromInquiryChild,
    resolveInquiryChildOcmId,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { loadWorkspaceChildcareInquiryOptionSets } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { useEffect, useMemo, useRef, useState } from "react";

export type InquiryChildRow = {
    id: string;
    customer_member_id: string;
    person_id: string | null;
    display_name: string | null;
    first_name?: string | null;
    last_name?: string | null;
    linked_on_inquiry?: boolean;
    ocm_id?: string | null;
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

/** Matches opportunity inquiry outcome keys/labels that imply waitlist (subtle attention styling). */
function isWaitlistedInquiryOutcome(outcomeKey: string, outcomeLabel: string): boolean {
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    return k.includes("waitlist") || l.includes("waitlist");
}

function inquiryChildRowAttention(args: {
    dob: string | null;
    desiredProgramType: string;
    desiredScheduleType: string;
    outcomeKey: string;
    outcomeLabel: string;
}): boolean {
    const { dob, desiredProgramType, desiredScheduleType, outcomeKey, outcomeLabel } = args;
    const missingDob = !normalizeKey(dob);
    const missingProgram = !normalizeKey(desiredProgramType);
    const missingSchedule = !normalizeKey(desiredScheduleType);
    const waitlisted = isWaitlistedInquiryOutcome(outcomeKey, outcomeLabel);
    const k = outcomeKey.toLowerCase();
    const l = outcomeLabel.toLowerCase();
    const noFitOrBlocked =
        /no_?fit|no_classroom|blocked|enrollment_?block/i.test(k) ||
        /no fit|no classroom|blocked enrollment|enrollment block/i.test(l);
    return waitlisted || missingDob || missingProgram || missingSchedule || noFitOrBlocked;
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

type IdentityLocal = { first_name: string; last_name: string; dob: string };

export default function OpportunityInquiryChildrenSection({
    rows,
    canEdit,
    opportunityId,
    onOpenChild,
    onChildrenMutated,
    /** When true and rows are empty, show a loading shell (full inquiry payload still fetching). */
    recordDetailPending = false,
    /** When true, outer EntityDrawerSection already provides premium card chrome — avoid nested heavy cards. */
    embeddedInPremiumSection = false,
}: {
    rows: InquiryChildRow[];
    canEdit: boolean;
    opportunityId?: string;
    onOpenChild?: (row: Pick<InquiryChildRow, "person_id" | "customer_member_id" | "display_name">) => void;
    onChildrenMutated?: () => void;
    recordDetailPending?: boolean;
    embeddedInPremiumSection?: boolean;
}) {
    const rootCol = embeddedInPremiumSection ? "min-w-0 w-full" : "md:col-span-2";
    const emptyBox = embeddedInPremiumSection
        ? "rounded-md border border-dashed border-alloy-stone/25 bg-white/50 px-3 py-2.5 text-sm text-alloy-midnight/60"
        : "rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm text-alloy-midnight/60";

    const [programItems, setProgramItems] = useState<OptionItem[]>([]);
    const [scheduleItems, setScheduleItems] = useState<OptionItem[]>([]);
    const [statusItems, setStatusItems] = useState<StatusRow[]>([]);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const [local, setLocal] = useState<Record<string, { desired_program_type: string; desired_schedule_type: string; outcome_status_key: string; notes: string }>>(
        {}
    );
    const [identityLocal, setIdentityLocal] = useState<Record<string, IdentityLocal>>({});
    const [ocmIdByRowKey, setOcmIdByRowKey] = useState<Record<string, string>>({});
    const [savingById, setSavingById] = useState<Record<string, boolean>>({});
    const [savedById, setSavedById] = useState<Record<string, boolean>>({});
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
        setIdentityLocal((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                if (!r.id) continue;
                const display = (r.display_name ?? "").trim();
                let first = (r.first_name ?? "").trim();
                let last = (r.last_name ?? "").trim();
                if (!first && !last && display) {
                    const parts = display.split(/\s+/).filter(Boolean);
                    first = parts[0] ?? "";
                    last = parts.length > 1 ? parts.slice(1).join(" ") : "";
                }
                next[r.id] = {
                    first_name: first,
                    last_name: last,
                    dob: r.dob ? String(r.dob).slice(0, 10) : "",
                };
            }
            return next;
        });
        setOcmIdByRowKey((prev) => {
            const next = { ...prev };
            for (const r of rows) {
                const ocm = resolveInquiryChildOcmId(r);
                if (ocm) next[r.id] = ocm;
            }
            return next;
        });
    }, [rows]);

    useEffect(() => {
        if (rows.length === 0) {
            setProgramItems([]);
            setScheduleItems([]);
            setStatusItems([]);
            setLoadErr(null);
            return undefined;
        }
        let cancelled = false;
        async function load() {
            try {
                setLoadErr(null);
                const init = workspaceDataFetchInit();
                const [bundle, statusRes] = await Promise.all([
                    loadWorkspaceChildcareInquiryOptionSets(init),
                    dedupeAdminFetchWithTtl("/api/admin/status-definitions?entity_type=opportunity_customer_members", init, 1500),
                ]);
                const progRes = bundle.programRes;
                const schedRes = bundle.scheduleRes;
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
    }, [rows.length]);

    const programLabelByKey = useMemo(() => new Map(programItems.map((i) => [i.item_key, i.label ?? i.item_key])), [programItems]);
    const scheduleLabelByKey = useMemo(() => new Map(scheduleItems.map((i) => [i.item_key, i.label ?? i.item_key])), [scheduleItems]);
    const statusLabelByKey = useMemo(
        () => new Map(statusItems.map((s) => [s.status_key, s.status_label ?? s.status_key])),
        [statusItems]
    );

    const debounced = useDebouncedPatch(600);

    const resolveOcmIdForRow = async (row: InquiryChildRow): Promise<string> => {
        const cached = ocmIdByRowKey[row.id];
        if (cached) return cached;
        const existing = resolveInquiryChildOcmId(row);
        if (existing) return existing;
        const oppId = opportunityId?.trim() ?? "";
        const cmId = row.customer_member_id?.trim() ?? "";
        if (!oppId || !cmId) throw new Error("Cannot save inquiry fields for this child row");
        const linked = await ensureOpportunityCustomerMemberLink({
            opportunityId: oppId,
            customerMemberId: cmId,
        });
        setOcmIdByRowKey((p) => ({ ...p, [row.id]: linked.ocmId }));
        onChildrenMutated?.();
        return linked.ocmId;
    };

    const markRowSaveState = (rowKey: string, phase: "saving" | "saved" | "error", message?: string) => {
        if (phase === "saving") {
            setSavingById((p) => ({ ...p, [rowKey]: true }));
            setSavedById((p) => ({ ...p, [rowKey]: false }));
            setErrorById((p) => ({ ...p, [rowKey]: null }));
            return;
        }
        setSavingById((p) => ({ ...p, [rowKey]: false }));
        if (phase === "saved") {
            setSavedById((p) => ({ ...p, [rowKey]: true }));
            window.setTimeout(() => setSavedById((p) => ({ ...p, [rowKey]: false })), 2000);
        }
        if (phase === "error") setErrorById((p) => ({ ...p, [rowKey]: message ?? "Save failed" }));
    };

    const saveOcmPatch = async (row: InquiryChildRow, patch: Record<string, unknown>) => {
        markRowSaveState(row.id, "saving");
        try {
            const ocmId = await resolveOcmIdForRow(row);
            await patchOpportunityCustomerMemberFromInquiryChild(ocmId, patch);
            markRowSaveState(row.id, "saved");
        } catch (e) {
            markRowSaveState(row.id, "error", (e as Error).message);
        }
    };

    const debouncedIdentity = useDebouncedPatch(600);

    const scheduleIdentitySave = (row: InquiryChildRow) => {
        const isMetadataOnly = (row.customer_member_id ?? "").startsWith("metadata_child:");
        if (!canEdit || isMetadataOnly || !row.customer_member_id) return;
        const draft = identityLocal[row.id];
        if (!draft) return;
        const baseline = {
            first_name: (row.first_name ?? "").trim(),
            last_name: (row.last_name ?? "").trim(),
            dob: row.dob ? String(row.dob).slice(0, 10) : "",
        };
        const patch = buildCustomerMemberPatch(draft, baseline);
        if (Object.keys(patch).length === 0) return;
        debouncedIdentity.schedule(`${row.id}:identity`, patch, async (_id, p) => {
            markRowSaveState(row.id, "saving");
            try {
                await patchCustomerMemberFromInquiryChild(row.customer_member_id, p);
                markRowSaveState(row.id, "saved");
                onChildrenMutated?.();
            } catch (e) {
                markRowSaveState(row.id, "error", (e as Error).message);
            }
        });
    };

    if (!rows.length) {
        if (recordDetailPending) {
            return (
                <div className={rootCol}>
                    <AdminV2DrawerLoadingState
                        density="inline"
                        title="Loading inquiry children"
                        description="Programs, schedules, and child rows appear after the full enrollment payload loads."
                        className="border-alloy-stone/12 bg-alloy-stone/[0.02]"
                    />
                </div>
            );
        }
        return (
            <div className={`${rootCol} ${emptyBox}`}>No children added to this inquiry yet.</div>
        );
    }

    const listWrap = embeddedInPremiumSection
        ? "rounded-md border border-alloy-stone/15 bg-white/75 divide-y divide-alloy-stone/15"
        : "rounded-lg border border-alloy-stone/25 bg-white divide-y divide-alloy-stone/20";
    const fieldInput =
        "w-full min-w-0 rounded-md border border-alloy-stone/35 bg-white px-1.5 py-1 text-[12px] text-alloy-midnight/85 disabled:opacity-60";
    const fieldSelect = `${fieldInput} pr-6`;
    const cardPad = embeddedInPremiumSection ? "px-2.5 py-2" : "px-3 py-2.5";

    const rowStatus = (rowId: string) => {
        const err = errorById[rowId];
        if (err) return <span className="text-[11px] font-medium text-red-700">{err}</span>;
        if (savingById[rowId]) return <span className="text-[11px] text-alloy-midnight/45">Saving…</span>;
        if (savedById[rowId]) return <span className="text-[11px] font-medium text-emerald-800/75">Saved</span>;
        return null;
    };

    return (
        <div className={rootCol}>
            {loadErr ? <p className="mb-2 text-sm text-red-700">{loadErr}</p> : null}
            <div className={listWrap}>
                {rows.map((r) => {
                    const name = (r.display_name ?? "").trim() || "—";
                    const isMetadataOnly = (r.customer_member_id ?? "").startsWith("metadata_child:");
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
                    const rowCanEdit = canEdit && !isMetadataOnly;
                    const identity = identityLocal[r.id] ?? {
                        first_name: "",
                        last_name: "",
                        dob: r.dob ? String(r.dob).slice(0, 10) : "",
                    };
                    const fallbackProgram =
                        (r.desired_program_label ?? "").trim() ||
                        (st.desired_program_type
                            ? (programLabelByKey.get(st.desired_program_type) ?? st.desired_program_type)
                            : "—");
                    const fallbackSchedule =
                        (r.desired_schedule_label ?? "").trim() ||
                        (st.desired_schedule_type
                            ? (scheduleLabelByKey.get(st.desired_schedule_type) ?? st.desired_schedule_type)
                            : "—");
                    const fallbackOutcome =
                        (r.outcome_status_label ?? "").trim() ||
                        (st.outcome_status_key
                            ? (statusLabelByKey.get(st.outcome_status_key) ?? st.outcome_status_key)
                            : "—");
                    const attention = inquiryChildRowAttention({
                        dob: r.dob,
                        desiredProgramType: st.desired_program_type || normalizeKey(r.desired_program_type),
                        desiredScheduleType: st.desired_schedule_type || normalizeKey(r.desired_schedule_type),
                        outcomeKey: st.outcome_status_key,
                        outcomeLabel: fallbackOutcome,
                    });
                    const rowAttentionClass = attention
                        ? "bg-amber-50/[0.35] ring-1 ring-inset ring-amber-200/60"
                        : "";
                    const outcomeSelectAttention =
                        attention && isWaitlistedInquiryOutcome(st.outcome_status_key, fallbackOutcome)
                            ? "border-amber-300/80 bg-amber-50/50"
                            : "";

                    return (
                        <div key={r.id} className={`${cardPad} ${rowAttentionClass}`} data-inquiry-child-card="true">
                            <div className="flex flex-wrap items-start justify-between gap-1.5">
                                <div className="min-w-0 flex-1 rounded-md border border-alloy-stone/12 bg-alloy-stone/[0.03] px-2 py-1.5 space-y-1">
                                    {rowCanEdit ? (
                                        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-[1fr_1fr_minmax(8.5rem,10rem)]">
                                            <div>
                                                <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                    First
                                                </label>
                                                <input
                                                    value={identity.first_name}
                                                    disabled={saving}
                                                    onChange={(e) => {
                                                        setIdentityLocal((p) => ({
                                                            ...p,
                                                            [r.id]: { ...identity, first_name: e.target.value },
                                                        }));
                                                        scheduleIdentitySave(r);
                                                    }}
                                                    className={fieldInput}
                                                    placeholder="First"
                                                    aria-label={`First name for ${name}`}
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                    Last
                                                </label>
                                                <input
                                                    value={identity.last_name}
                                                    disabled={saving}
                                                    onChange={(e) => {
                                                        setIdentityLocal((p) => ({
                                                            ...p,
                                                            [r.id]: { ...identity, last_name: e.target.value },
                                                        }));
                                                        scheduleIdentitySave(r);
                                                    }}
                                                    className={fieldInput}
                                                    placeholder="Last"
                                                    aria-label={`Last name for ${name}`}
                                                />
                                            </div>
                                            <div>
                                                <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                                    DOB
                                                </label>
                                                <input
                                                    type="date"
                                                    value={identity.dob}
                                                    disabled={saving}
                                                    onChange={(e) => {
                                                        setIdentityLocal((p) => ({
                                                            ...p,
                                                            [r.id]: { ...identity, dob: e.target.value },
                                                        }));
                                                        scheduleIdentitySave(r);
                                                    }}
                                                    className={fieldInput}
                                                    aria-label={`Date of birth for ${name}`}
                                                />
                                                {age ? (
                                                    <div className="mt-0.5 text-[10px] text-alloy-midnight/45">{age}</div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-[13px] font-semibold text-alloy-midnight/85">
                                            {onOpenChild && name !== "—" && !isMetadataOnly ? (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        onOpenChild({
                                                            person_id: r.person_id,
                                                            customer_member_id: r.customer_member_id,
                                                            display_name: r.display_name,
                                                        })
                                                    }
                                                    className="text-alloy-blue hover:underline"
                                                >
                                                    {name}
                                                </button>
                                            ) : (
                                                name
                                            )}
                                            <div className="mt-0.5 text-[12px] font-normal tabular-nums text-alloy-midnight/60">
                                                {dobAge}
                                            </div>
                                        </div>
                                    )}
                                    {!r.linked_on_inquiry && rowCanEdit ? (
                                        <p className="text-[10px] font-medium text-alloy-midnight/45">
                                            Not on inquiry yet — inquiry fields will link on save
                                        </p>
                                    ) : null}
                                </div>
                                {onOpenChild && rowCanEdit ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onOpenChild({
                                                person_id: r.person_id,
                                                customer_member_id: r.customer_member_id,
                                                display_name: r.display_name,
                                            })
                                        }
                                        className="shrink-0 text-[11px] font-semibold text-alloy-blue hover:underline"
                                    >
                                        View record
                                    </button>
                                ) : null}
                            </div>

                            <div className="mt-1.5 border-t border-alloy-stone/10 pt-1.5">
                                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                    Program & outcome
                                </div>
                                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                                <div>
                                    <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Program
                                    </label>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.desired_program_type}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({ ...p, [r.id]: { ...st, desired_program_type: v } }));
                                                debounced.schedule(r.id, { desired_program_type: v || null }, (_id, patch) => {
                                                    void saveOcmPatch(r, patch);
                                                });
                                            }}
                                            className={fieldSelect}
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
                                        <span className="text-[12px] text-alloy-midnight/70">{fallbackProgram}</span>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Schedule
                                    </label>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.desired_schedule_type}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({ ...p, [r.id]: { ...st, desired_schedule_type: v } }));
                                                debounced.schedule(r.id, { desired_schedule_type: v || null }, (_id, patch) => {
                                                    void saveOcmPatch(r, patch);
                                                });
                                            }}
                                            className={fieldSelect}
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
                                        <span className="text-[12px] text-alloy-midnight/70">{fallbackSchedule}</span>
                                    )}
                                </div>
                                <div>
                                    <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                        Outcome
                                    </label>
                                    {rowCanEdit ? (
                                        <select
                                            value={st.outcome_status_key}
                                            disabled={saving}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setLocal((p) => ({ ...p, [r.id]: { ...st, outcome_status_key: v } }));
                                                debounced.schedule(r.id, { outcome_status_key: v || null }, (_id, patch) => {
                                                    void saveOcmPatch(r, patch);
                                                });
                                            }}
                                            className={`${fieldSelect} ${outcomeSelectAttention}`}
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
                                        <span className="text-[12px] text-alloy-midnight/70">{fallbackOutcome}</span>
                                    )}
                                </div>
                                </div>
                            </div>

                            <div className="mt-1.5 border-t border-dashed border-alloy-stone/12 pt-1.5">
                                <label className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    Notes
                                </label>
                                {rowCanEdit ? (
                                    <input
                                        value={st.notes}
                                        disabled={saving}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setLocal((p) => ({ ...p, [r.id]: { ...st, notes: v } }));
                                            debounced.schedule(r.id, { notes: v }, (_id, patch) => {
                                                void saveOcmPatch(r, patch);
                                            });
                                        }}
                                        onBlur={() =>
                                            debounced.flush(r.id, (_id, patch) => {
                                                void saveOcmPatch(r, patch);
                                            })
                                        }
                                        className={fieldInput}
                                        placeholder="Add notes…"
                                        aria-label={`Notes for ${name}`}
                                    />
                                ) : (
                                    <p className="text-[12px] text-alloy-midnight/70">
                                        {normalizeKey(r.notes) ? String(r.notes).trim() : "—"}
                                    </p>
                                )}
                            </div>

                            {rowCanEdit ? (
                                <div className="mt-1 min-h-[0.875rem]">{rowStatus(r.id)}</div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

