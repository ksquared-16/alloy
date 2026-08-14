"use client";

/**
 * Records → Children.
 *
 * The durable child population. A child is here because the household record exists — not because an
 * enrollment is running — so this is emphatically NOT an Enrollment queue. Participation state is
 * shown when the platform holds it and is simply absent when it does not.
 *
 * ── THE ROW IS KEYED BY THE MEMBER ──
 *
 * `customer_members.id`, never `person_id`. `person_id` is nullable, and in the certification tenant
 * every child has a null person — a surface keyed on the person would show an empty Children section
 * while 1500 children existed.
 *
 * ── ADD CHILD IS DELIBERATELY ABSENT ──
 *
 * Phase 0 found the existing child-create path resolves ambiguous identity SILENTLY (an org-wide
 * name match with no operator gate), where Add Staff refuses to guess. Shipping the affordance would
 * make Records the surface that quietly merges two children. The product need is real, so it is
 * named in the empty state rather than hidden — and it is not wired to Create Lead, which answers a
 * different question.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import RecordsCohortBar from "@/components/adminV2/records/RecordsCohortBar";
import { applyCohort, buildChildCohorts, type RecordCohort } from "@/lib/adminV2/records/recordCohorts";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";

export type ChildEntry = {
    customerMemberId: string;
    personId: string | null;
    displayName: string;
    dateOfBirth: string | null;
    householdId: string | null;
    householdName: string | null;
    isActive: boolean;
    participationState: "in_process" | "enrolled" | "closed" | null;
    participationStageKey: string | null;
    siteLocationId: string | null;
    siteLocationLabel: string | null;
};

/** The child identity card key — the aspect a child gesture names. */
const CHILD_IDENTITY_CARD = "child_identity";

const PARTICIPATION_LABEL: Record<string, string> = {
    in_process: "In process",
    enrolled: "Enrolled",
    closed: "Closed",
};

function ageLabel(dob: string | null, todayYmd: string): string | null {
    if (!dob) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
    const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayYmd);
    if (!m || !t) return null;
    let months = (Number(t[1]) - Number(m[1])) * 12 + (Number(t[2]) - Number(m[2]));
    if (Number(t[3]) < Number(m[3])) months -= 1;
    if (months < 0) return null;
    if (months < 24) return `${months} mo`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
}

export default function RecordsChildrenSection({
    todayYmd,
    onClose,
}: {
    todayYmd: string;
    onClose?: () => void;
}) {
    const [children, setChildren] = useState<ChildEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cohortKey, setCohortKey] = useState("all");
    const [filter, setFilter] = useState("");

    const focusRecord = useOperatorRecordFocus();

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch("/api/admin/records/children", { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; children?: ChildEntry[]; message?: string };
            if (!res.ok || !json.ok) throw new Error(json.message ?? "Could not load children");
            setChildren(json.children ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load children");
            setChildren([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const cohorts = useMemo(() => buildChildCohorts() as RecordCohort<ChildEntry>[], []);
    const rows = children ?? [];
    const activeCohort = cohorts.find((c) => c.key === cohortKey) ?? cohorts[0]!;

    const visible = useMemo(() => {
        const inCohort = applyCohort(activeCohort, rows);
        const q = filter.trim().toLowerCase();
        if (!q) return inCohort;
        return inCohort.filter(
            (c) =>
                c.displayName.toLowerCase().includes(q) ||
                (c.householdName ?? "").toLowerCase().includes(q) ||
                (c.siteLocationLabel ?? "").toLowerCase().includes(q),
        );
    }, [activeCohort, rows, filter]);

    /** The record gesture — the member id, durable intent, and the child identity aspect. */
    const openChild = useCallback(
        (customerMemberId: string) => {
            void focusRecord({
                entity_type: "customer_members",
                entity_id: customerMemberId,
                intent: "durable_record",
                card_focus: { card_key: CHILD_IDENTITY_CARD },
            }).then((moved) => {
                if (moved !== false) onClose?.();
            });
        },
        [focusRecord, onClose],
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-records-children="true">
            <RecordsCohortBar
                cohorts={cohorts}
                activeCohortKey={activeCohort.key}
                onCohortChange={setCohortKey}
                records={rows}
                filter={filter}
                onFilterChange={setFilter}
                filterPlaceholder="Filter children"
            />

            {error ? (
                <p className="mx-1 mb-2 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700">
                    {error}
                </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
                {children == null ? (
                    <p className="px-2 py-6 text-[12px] text-alloy-midnight/50">Loading…</p>
                ) : visible.length === 0 ? (
                    <div className="rounded border border-dashed border-admin-border px-4 py-8 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/75">
                            {rows.length === 0 ? "No children yet" : "No children in this view"}
                        </p>
                        <p className="mt-1 mx-auto max-w-[54ch] text-[12px] text-alloy-midnight/55">
                            {rows.length === 0
                                ? "Children appear here from the household record. Adding a child directly from Records is coming next — it is held back until child identity resolution is as safe as Add Staff."
                                : "This is a real answer for the cohort, not a filter problem."}
                        </p>
                    </div>
                ) : (
                    <ul
                        className="divide-y divide-admin-border rounded border border-admin-border bg-white"
                        data-children-list="true"
                    >
                        {visible.map((c) => {
                            const age = ageLabel(c.dateOfBirth, todayYmd);
                            return (
                                <li key={c.customerMemberId}>
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left hover:bg-alloy-midnight/[0.03]"
                                        onClick={() => openChild(c.customerMemberId)}
                                        data-child-member={c.customerMemberId}
                                        data-child-row="true"
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-[13px] font-medium text-alloy-midnight">
                                                {c.displayName}
                                            </span>
                                            <span className="block truncate text-[11px] text-alloy-midnight/55">
                                                {[age, c.householdName, c.siteLocationLabel]
                                                    .filter(Boolean)
                                                    .join(" · ") || "No household on record"}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-right">
                                            <span
                                                className="rounded-full bg-alloy-midnight/5 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60"
                                                data-child-state={c.participationState ?? "none"}
                                            >
                                                {c.participationState
                                                    ? (PARTICIPATION_LABEL[c.participationState] ??
                                                      c.participationState)
                                                    : c.isActive
                                                      ? "On record"
                                                      : "Inactive"}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
