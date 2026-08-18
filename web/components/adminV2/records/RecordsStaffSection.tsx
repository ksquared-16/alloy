"use client";

/**
 * Records → Staff.
 *
 * The staff directory that used to live at `/organization/staff`, recomposed as a record surface:
 * recognition-first rows, meaningful state, and cohort switching — not an HR grid.
 *
 * ── THE ROW OPENS A DURABLE RECORD ──
 *
 * `/organization/staff` wrote `?personId=` into an href that nothing read, so clicking a staff
 * member reloaded the list. That was not a wiring slip: until Durable Record Attention there was no
 * destination to write, because a staff member has no household and no case and therefore had no
 * representable attention target at all.
 *
 * Records declares durable intent and nothing else. It resolves no household, no Opportunity, no
 * Work Unit and no route — the adapter owns all of that.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";

import AddStaffModal from "@/components/adminV2/settings/staff/AddStaffModal";
import RecordsCohortBar from "@/components/adminV2/records/RecordsCohortBar";
import { applyCohort, buildStaffCohorts, type RecordCohort } from "@/lib/adminV2/records/recordCohorts";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import {
    DURABLE_RECORD_CLOSED_EVENT,
    type DurableRecordClosedDetail,
} from "@/lib/runtime/focus/DurableRecordHostContext";

export type StaffEntry = {
    employmentId: string;
    personId: string;
    displayName: string;
    email: string | null;
    positionKey: string | null;
    positionLabel: string | null;
    employmentType: string | null;
    primaryLocationId: string | null;
    primaryLocationLabel: string | null;
    employmentStatus: string;
    isOpen: boolean;
    startDate: string;
    endDate: string | null;
    /** Actor-scoped canonical photo from the platform's one projection. Null → initials. */
    photoUrl?: string | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatYmd(ymd: string | null): string {
    if (!ymd) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}

const TYPE_LABELS: Record<string, string> = {
    full_time: "Full time",
    part_time: "Part time",
    temporary: "Temporary",
    contract: "Contract",
    volunteer: "Volunteer",
};

/** The one sentence about this person's standing — meaning before fields. */
function stateSentence(s: StaffEntry, todayYmd: string): string {
    if (!s.isOpen) return `Ended ${formatYmd(s.endDate)}`;
    if (s.startDate > todayYmd) return `Starts ${formatYmd(s.startDate)}`;
    return `Since ${formatYmd(s.startDate)}`;
}

export default function RecordsStaffSection({
    positions,
    sites,
    todayYmd,
    onClose,
}: {
    positions: { id: string; key: string | null; label: string }[];
    sites: { id: string; label: string }[];
    todayYmd: string;
    onClose?: () => void;
}) {
    const [staff, setStaff] = useState<StaffEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);
    const [cohortKey, setCohortKey] = useState("all");
    const [filter, setFilter] = useState("");
    const [addOpen, setAddOpen] = useState(false);

    const focusRecord = useOperatorRecordFocus();

    // Ended employment is loaded ALWAYS, because the Inactive cohort is a view over the same
    // population — a cohort that needed its own fetch could disagree with the tab count beside it.
    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch("/api/admin/staff/directory?include_ended=true");
            const json = (await res.json()) as { staff?: StaffEntry[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not load staff");
            setStaff(json.staff ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load staff");
            setStaff([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    /** Same contract as Children: a record that was WRITTEN refreshes; one that was read does not. */
    useEffect(() => {
        const onClosed = (event: Event) => {
            const detail = (event as CustomEvent<DurableRecordClosedDetail>).detail;
            if (!detail?.changed || detail.subjectType !== "person") return;
            void load();
        };
        window.addEventListener(DURABLE_RECORD_CLOSED_EVENT, onClosed);
        return () => window.removeEventListener(DURABLE_RECORD_CLOSED_EVENT, onClosed);
    }, [load]);

    const cohorts = useMemo<RecordCohort<StaffEntry>[]>(
        () =>
            buildStaffCohorts(
                todayYmd,
                positions
                    .filter((p) => Boolean(p.key))
                    .map((p) => ({ key: p.key as string, label: p.label })),
            ) as RecordCohort<StaffEntry>[],
        [todayYmd, positions],
    );

    const rows = staff ?? [];
    const activeCohort = cohorts.find((c) => c.key === cohortKey) ?? cohorts[0]!;
    const visible = useMemo(() => {
        const inCohort = applyCohort(activeCohort, rows);
        const q = filter.trim().toLowerCase();
        if (!q) return inCohort;
        return inCohort.filter(
            (s) =>
                s.displayName.toLowerCase().includes(q) ||
                (s.positionLabel ?? "").toLowerCase().includes(q) ||
                (s.primaryLocationLabel ?? "").toLowerCase().includes(q),
        );
    }, [activeCohort, rows, filter]);

    /**
     * The record gesture. Declares durable intent and names Employment — the card a staff gesture
     * means. Records never inspects households or routes.
     */
    const openStaff = useCallback(
        (personId: string) => {
            void focusRecord({
                entity_type: "persons",
                entity_id: personId,
                intent: "durable_record",
                card_focus: { card_key: OPERATOR_FOCUS_CARDS.employment },
            }).then((moved) => {
                // A record gesture takes the operator out of this workspace; leaving the modal open
                // behind the destination is the drawer habit in another shape.
                if (moved !== false) onClose?.();
            });
        },
        [focusRecord, onClose],
    );

    return (
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col xl:max-w-[80rem]" data-records-staff="true">
            <RecordsCohortBar
                cohorts={cohorts}
                activeCohortKey={activeCohort.key}
                onCohortChange={setCohortKey}
                records={rows}
                filter={filter}
                onFilterChange={setFilter}
                filterPlaceholder="Filter staff"
                trailing={
                    <button
                        type="button"
                        className={`shrink-0 ${WS_ACTION_PRIMARY}`}
                        onClick={() => setAddOpen(true)}
                        data-staff-add-open="true"
                    >
                        Add staff
                    </button>
                }
            />

            {flash ? (
                <p
                    className="mx-1 mb-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[12px] text-emerald-800"
                    data-staff-flash="true"
                >
                    {flash}
                </p>
            ) : null}
            {error ? (
                <p className="mx-1 mb-2 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700">
                    {error}
                </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
                {staff == null ? (
                    <p className="px-2 py-6 text-[12px] text-alloy-midnight/50">Loading…</p>
                ) : visible.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-alloy-stone/30 px-4 py-8 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/75">
                            {rows.length === 0 ? "No staff yet" : "No staff in this view"}
                        </p>
                        <p className="mt-1 text-[12px] text-alloy-midnight/55">
                            {rows.length === 0
                                ? "Add the people who work here. Alloy reuses an existing person record when one already exists."
                                : "This is a real answer for the cohort, not a filter problem."}
                        </p>
                        {/* Same rule as Children: repeat the command only when the population is
                            genuinely empty, in text rather than as a second primary. */}
                        {rows.length === 0 ? (
                            <button
                                type="button"
                                className="mt-3 text-[12px] font-semibold text-alloy-bend-pine"
                                onClick={() => setAddOpen(true)}
                                data-staff-add-open-empty="true"
                            >
                                Add staff
                            </button>
                        ) : null}
                    </div>
                ) : (
                    <ul
                        className="divide-y divide-alloy-stone/15 overflow-hidden rounded-lg border border-alloy-stone/22 bg-white"
                        data-staff-list="true"
                    >
                        {visible.map((s) => (
                            <li key={s.employmentId}>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-alloy-stone/[0.06]"
                                    onClick={() => openStaff(s.personId)}
                                    // Same hover warmth as the Children rows — see that comment.
                                    onMouseEnter={() => {
                                        void dedupeAdminFetchWithTtl(
                                            `/api/admin/durable-record?subject_type=person&subject_id=${encodeURIComponent(s.personId)}`,
                                            { credentials: "include" },
                                            15_000,
                                        ).catch(() => {});
                                    }}
                                    data-staff-person={s.personId}
                                    data-staff-row="true"
                                >
                                    {/* The CANONICAL avatar — same resolver, same photo, as Work
                                        Views, Search and the Focus Panel. */}
                                    <CardAvatar
                                        name={s.displayName}
                                        imageUrl={s.photoUrl ?? null}
                                        size={28}
                                        recordId={s.personId}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[13px] font-medium text-alloy-midnight">
                                            {s.displayName}
                                        </span>
                                        <span className="block truncate text-[11px] text-alloy-midnight/55">
                                            {[
                                                s.positionLabel,
                                                s.employmentType
                                                    ? (TYPE_LABELS[s.employmentType] ?? s.employmentType)
                                                    : null,
                                                s.primaryLocationLabel,
                                            ]
                                                .filter(Boolean)
                                                .join(" · ") || "No position set"}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span
                                            className="rounded-full bg-alloy-midnight/5 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60"
                                            data-staff-state={s.isOpen ? "active" : "ended"}
                                        >
                                            {s.isOpen
                                                ? s.startDate > todayYmd
                                                    ? "Starting"
                                                    : "Active"
                                                : "Ended"}
                                        </span>
                                        <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">
                                            {stateSentence(s, todayYmd)}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <AddStaffModal
                open={addOpen}
                positions={positions.map((p) => ({ id: p.id, label: p.label }))}
                sites={sites}
                todayYmd={todayYmd}
                onClose={() => setAddOpen(false)}
                onCreated={(result) => {
                    setAddOpen(false);
                    setFlash(
                        result.identityOutcome === "linked_existing"
                            ? "Employment added to the existing person — no duplicate was created."
                            : "New person and employment created.",
                    );
                    // Reload rather than splice: cohort membership is DERIVED, so the authoritative
                    // projection decides which cohorts the new staff member belongs to.
                    void load();
                }}
            />
        </div>
    );
}
