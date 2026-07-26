"use client";

/**
 * Assignment roster — consumes operational assignments (Primary / Secondary, room, type, status).
 * Staff subject expansion is structurally ready via subjectType on each row.
 */

import { useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, ChevronRight } from "lucide-react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import type { OrgAssignmentTypeOption } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";

export type AssignmentRosterSubject = {
    agreementId: string;
    customerMemberId: string;
    childName: string;
    subjectType: "child" | "staff";
    assignmentCount: number;
    primaryRoom: string | null;
    assignments: {
        assignmentId: string;
        isPrimary: boolean;
        roleLabel: "Primary" | "Secondary";
        assignmentTypeLabel: string | null;
        roomName: string | null;
        weekdaysLabel: string;
        effectiveFrom: string;
        effectiveTo: string | null;
        status: string;
    }[];
};

export type BulkAssignmentPreviewRow = {
    customerMemberId: string;
    childName: string;
    status: "ready" | "blocked";
    reason?: string;
    payload: Record<string, unknown>;
};

export type AssignmentRosterBulkHandlers = {
    onCreateForChild?: (customerMemberId: string) => void;
    onBulkArchive?: (assignmentIds: string[]) => void | Promise<void>;
    onBulkMakePrimary?: (payload: { agreementId: string; assignmentId: string; effectiveFrom: string }[]) => void | Promise<void>;
    onBulkAssignment?: (
        subjects: AssignmentRosterSubject[],
        preview: BulkAssignmentPreviewRow[],
    ) => void | Promise<void>;
    onBulkRoomChange?: (
        rows: { customerMemberId: string; payload: Record<string, unknown> }[],
    ) => void | Promise<void>;
    assignmentTypes?: OrgAssignmentTypeOption[];
    siteId?: string;
    busy?: boolean;
};

export default function AssignmentRosterPanel({
    subjects,
    loading,
    siteName,
    bulk,
}: {
    subjects: AssignmentRosterSubject[];
    loading: boolean;
    siteName: string;
    bulk?: AssignmentRosterBulkHandlers;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [bulkMode, setBulkMode] = useState<"assignment" | "room" | null>(null);
    const [bulkTypeId, setBulkTypeId] = useState("");
    const [bulkPatternId, setBulkPatternId] = useState("");
    const [bulkRoomId, setBulkRoomId] = useState("");
    const [bulkStartDate, setBulkStartDate] = useState(new Date().toISOString().slice(0, 10));

    const totalAssignments = useMemo(
        () => subjects.reduce((n, s) => n + s.assignmentCount, 0),
        [subjects]
    );

    const toggle = (agreementId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(agreementId)) next.delete(agreementId);
            else next.add(agreementId);
            return next;
        });
    };

    const toggleSelect = (assignmentId: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(assignmentId)) next.delete(assignmentId);
            else next.add(assignmentId);
            return next;
        });
    };

    const selectedAssignments = useMemo(() => {
        const rows: { agreementId: string; assignmentId: string; isPrimary: boolean; effectiveFrom: string }[] = [];
        for (const s of subjects) {
            for (const a of s.assignments) {
                if (selected.has(a.assignmentId)) {
                    rows.push({
                        agreementId: s.agreementId,
                        assignmentId: a.assignmentId,
                        isPrimary: a.isPrimary,
                        effectiveFrom: a.effectiveFrom,
                    });
                }
            }
        }
        return rows;
    }, [subjects, selected]);

    const selectedSubjects = useMemo(() => {
        const agreementIds = new Set(selectedAssignments.map((r) => r.agreementId));
        return subjects.filter((s) => agreementIds.has(s.agreementId));
    }, [subjects, selectedAssignments]);

    const bulkAssignmentPreview = useMemo((): BulkAssignmentPreviewRow[] => {
        if (!bulkMode || bulkMode !== "assignment") return [];
        const type = bulk?.assignmentTypes?.find((t) => t.id === bulkTypeId);
        return selectedSubjects.map((s) => {
            const blocked = !bulkTypeId || !bulkPatternId || !bulkRoomId || !bulkStartDate;
            return {
                customerMemberId: s.customerMemberId,
                childName: s.childName,
                status: blocked ? "blocked" : "ready",
                reason: blocked ? "Complete type, pattern, room, and start date" : undefined,
                payload: {
                    subject_type: "child",
                    enrollment_agreement_id: s.agreementId,
                    schedule_pattern_id: bulkPatternId,
                    start_date: bulkStartDate,
                    room_location_id: bulkRoomId,
                    assignment_type_id: bulkTypeId,
                    assignment_type_label: type?.label ?? "Assignment",
                    is_primary: false,
                },
            };
        });
    }, [bulkMode, selectedSubjects, bulkTypeId, bulkPatternId, bulkRoomId, bulkStartDate, bulk?.assignmentTypes]);

    if (loading && subjects.length === 0) {
        return <p className="px-1 text-[12px] text-alloy-slate">Loading assignment roster…</p>;
    }

    if (subjects.length === 0) {
        return (
            <div
                className="flex flex-col items-center justify-center rounded-xl border border-alloy-stone/20 bg-white px-6 py-14 text-center"
                data-assignment-roster-empty="true"
            >
                <p className="text-[13px] font-semibold text-alloy-midnight">No operational assignments at {siteName}</p>
                <p className="mt-1 max-w-md text-[12px] text-alloy-slate">
                    Children with active assignments appear here with Primary / Secondary roles, room, type, and status.
                </p>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-col gap-3" data-assignment-roster="true">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-alloy-slate">
                    {subjects.length} {subjects.length === 1 ? "child" : "children"} · {totalAssignments}{" "}
                    {totalAssignments === 1 ? "assignment" : "assignments"} · {siteName}
                </p>
                {selected.size > 0 ? (
                    <div
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-alloy-stone/20 bg-white px-2.5 py-1.5"
                        data-assignment-roster-bulk="true"
                    >
                        <span className="text-[11px] font-semibold text-alloy-midnight">{selected.size} selected</span>
                        {selectedSubjects.length === 1 && bulk?.onCreateForChild ? (
                            <button
                                type="button"
                                className="text-[11px] font-semibold text-alloy-bend-pine"
                                onClick={() => bulk.onCreateForChild?.(selectedSubjects[0]!.customerMemberId)}
                                data-roster-add-assignment="true"
                            >
                                Add Assignment
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-bend-pine disabled:opacity-50"
                            disabled={bulk?.busy || selectedSubjects.length === 0}
                            onClick={() => setBulkMode("assignment")}
                            data-bulk-assignment="true"
                        >
                            Bulk assign
                        </button>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-bend-pine disabled:opacity-50"
                            disabled={bulk?.busy || selectedAssignments.length === 0}
                            onClick={() => setBulkMode("room")}
                            data-bulk-room-change="true"
                        >
                            Bulk room change
                        </button>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-bend-pine disabled:opacity-50"
                            disabled={bulk?.busy || selectedAssignments.every((r) => r.isPrimary)}
                            onClick={() => {
                                const targets = selectedAssignments.filter((r) => !r.isPrimary);
                                void bulk?.onBulkMakePrimary?.(targets);
                            }}
                            data-bulk-make-primary="true"
                        >
                            Make primary
                        </button>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-ember disabled:opacity-50"
                            disabled={bulk?.busy || selectedAssignments.every((r) => r.isPrimary)}
                            onClick={() => {
                                const ids = selectedAssignments.filter((r) => !r.isPrimary).map((r) => r.assignmentId);
                                void bulk?.onBulkArchive?.(ids);
                            }}
                            data-bulk-archive="true"
                        >
                            Archive
                        </button>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-slate"
                            onClick={() => {
                                setSelected(new Set());
                                setBulkMode(null);
                            }}
                        >
                            Clear
                        </button>
                    </div>
                ) : null}
            </div>

            {bulkMode === "assignment" ? (
                <div
                    className="rounded-lg border border-alloy-stone/20 bg-white p-3"
                    data-bulk-assignment-panel="true"
                >
                    <p className="text-[12px] font-semibold text-alloy-midnight">Bulk Assignment</p>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <AlloySelect
                            value={bulkTypeId}
                            onChange={setBulkTypeId}
                            placeholder="Assignment type"
                            options={(bulk?.assignmentTypes ?? []).map((t) => ({
                                value: t.id ?? "",
                                label: t.label ?? "",
                            }))}
                            aria-label="Bulk assignment type"
                        />
                        <input
                            type="text"
                            value={bulkPatternId}
                            onChange={(e) => setBulkPatternId(e.target.value)}
                            placeholder="Schedule pattern id"
                            className="rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                        <input
                            type="text"
                            value={bulkRoomId}
                            onChange={(e) => setBulkRoomId(e.target.value)}
                            placeholder="Room location id"
                            className="rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                        <input
                            type="date"
                            value={bulkStartDate}
                            onChange={(e) => setBulkStartDate(e.target.value)}
                            className="rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                    </div>
                    <ul className="mt-2 space-y-1">
                        {bulkAssignmentPreview.map((row) => (
                            <li key={row.customerMemberId} className="text-[11px] text-alloy-slate">
                                {row.childName} ·{" "}
                                <span
                                    className={
                                        row.status === "ready" ? "text-alloy-bend-pine" : "text-alloy-ember"
                                    }
                                >
                                    {row.status === "ready" ? "Ready" : "Blocked"}
                                </span>
                                {row.reason ? ` — ${row.reason}` : null}
                            </li>
                        ))}
                    </ul>
                    <div className="mt-2 flex gap-2">
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            disabled={
                                bulk?.busy
                                || bulkAssignmentPreview.every((r) => r.status !== "ready")
                            }
                            onClick={() =>
                                void bulk?.onBulkAssignment?.(selectedSubjects, bulkAssignmentPreview)
                            }
                        >
                            Apply ready
                        </button>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-slate"
                            onClick={() => setBulkMode(null)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}

            {bulkMode === "room" ? (
                <div className="rounded-lg border border-alloy-stone/20 bg-white p-3" data-bulk-room-panel="true">
                    <p className="text-[12px] font-semibold text-alloy-midnight">Bulk Room Change</p>
                    <p className="mt-1 text-[11px] text-alloy-slate">
                        Supersedes selected assignments with a new room effective {bulkStartDate}.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <input
                            type="date"
                            value={bulkStartDate}
                            onChange={(e) => setBulkStartDate(e.target.value)}
                            className="rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                        <input
                            type="text"
                            value={bulkRoomId}
                            onChange={(e) => setBulkRoomId(e.target.value)}
                            placeholder="New room location id"
                            className="min-w-[200px] flex-1 rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            disabled={bulk?.busy || !bulkRoomId || selectedAssignments.length === 0}
                            onClick={() => {
                                const rows = selectedAssignments.map((r) => {
                                    const subject = subjects.find((s) => s.agreementId === r.agreementId);
                                    const assignment = subject?.assignments.find(
                                        (a) => a.assignmentId === r.assignmentId,
                                    );
                                    return {
                                        customerMemberId: subject?.customerMemberId ?? "",
                                        payload: {
                                            subject_type: "child",
                                            enrollment_agreement_id: r.agreementId,
                                            schedule_pattern_id: bulkPatternId || undefined,
                                            start_date: bulkStartDate,
                                            room_location_id: bulkRoomId,
                                            assignment_type_id: undefined,
                                            is_primary: r.isPrimary,
                                            supersedes_assignment_id: r.assignmentId,
                                            assignment_type_label: assignment?.assignmentTypeLabel ?? "Assignment",
                                        },
                                    };
                                });
                                void bulk?.onBulkRoomChange?.(rows.filter((r) => r.customerMemberId));
                                setBulkMode(null);
                            }}
                        >
                            Apply room change
                        </button>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-slate"
                            onClick={() => setBulkMode(null)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-alloy-stone/15 bg-white shadow-[0_2px_8px_rgba(24,39,58,0.06)]">
                <div className="grid grid-cols-[28px_minmax(180px,1.4fr)_minmax(80px,0.6fr)_minmax(100px,0.7fr)_minmax(90px,0.6fr)_minmax(120px,0.8fr)_minmax(80px,0.5fr)] gap-2 border-b border-alloy-stone/12 bg-alloy-stone/[0.55] px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-alloy-slate">
                    <span className="sr-only">Select</span>
                    <span>Child</span>
                    <span>Count</span>
                    <span>Primary room</span>
                    <span>Role</span>
                    <span>Type · Days</span>
                    <span>Status</span>
                </div>
                <ul className="divide-y divide-alloy-stone/10">
                    {subjects.map((subject) => {
                        const isOpen = expanded.has(subject.agreementId) || subject.assignmentCount <= 1;
                        const primary = subject.assignments.find((a) => a.isPrimary) ?? subject.assignments[0];
                        const primarySelected = primary ? selected.has(primary.assignmentId) : false;
                        return (
                            <li key={subject.agreementId} data-assignment-roster-subject={subject.agreementId}>
                                <div className="grid w-full grid-cols-[28px_minmax(180px,1.4fr)_minmax(80px,0.6fr)_minmax(100px,0.7fr)_minmax(90px,0.6fr)_minmax(120px,0.8fr)_minmax(80px,0.5fr)] gap-2 px-3 py-2.5 hover:bg-alloy-stone/[0.04]">
                                    <label className="flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 accent-alloy-bend-pine"
                                            checked={primarySelected}
                                            disabled={!primary}
                                            onChange={() => primary && toggleSelect(primary.assignmentId)}
                                            aria-label={`Select ${subject.childName}`}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="col-span-6 grid grid-cols-[minmax(180px,1.4fr)_minmax(80px,0.6fr)_minmax(100px,0.7fr)_minmax(90px,0.6fr)_minmax(120px,0.8fr)_minmax(80px,0.5fr)] gap-2 text-left"
                                        onClick={() => subject.assignmentCount > 1 && toggle(subject.agreementId)}
                                        aria-expanded={isOpen}
                                    >
                                        <span className="flex min-w-0 items-center gap-1.5">
                                            {subject.assignmentCount > 1 ? (
                                                isOpen ?
                                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-alloy-slate" aria-hidden />
                                                :   <ChevronRight className="h-3.5 w-3.5 shrink-0 text-alloy-slate" aria-hidden />
                                            ) : (
                                                <span className="w-3.5 shrink-0" aria-hidden />
                                            )}
                                            <span className="truncate text-[12.5px] font-semibold text-alloy-midnight">
                                                {subject.childName}
                                            </span>
                                        </span>
                                        <span className="text-[12px] tabular-nums text-alloy-midnight">{subject.assignmentCount}</span>
                                        <span className="truncate text-[11.5px] text-alloy-slate">
                                            {subject.primaryRoom ?? "—"}
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-alloy-midnight">
                                            {primary?.isPrimary ?
                                                <BadgeCheck className="h-3 w-3 text-alloy-bend-pine" aria-hidden />
                                            :   null}
                                            {primary?.roleLabel ?? "—"}
                                        </span>
                                        <span className="truncate text-[11px] text-alloy-slate">
                                            {primary?.assignmentTypeLabel ?? "—"} · {primary?.weekdaysLabel ?? "—"}
                                        </span>
                                        <span className="text-[11px] capitalize text-alloy-slate">{primary?.status ?? "—"}</span>
                                    </button>
                                </div>
                                {isOpen && subject.assignmentCount > 1 ?
                                    <ul className="border-t border-alloy-stone/8 bg-alloy-stone/[0.03]">
                                        {subject.assignments.map((a) => (
                                            <li
                                                key={a.assignmentId}
                                                className="grid grid-cols-[28px_minmax(180px,1.4fr)_minmax(80px,0.6fr)_minmax(100px,0.7fr)_minmax(90px,0.6fr)_minmax(120px,0.8fr)_minmax(80px,0.5fr)] gap-2 px-3 py-2 text-[11px] text-alloy-slate"
                                                data-assignment-roster-row={a.assignmentId}
                                            >
                                                <label className="flex items-center justify-center">
                                                    <input
                                                        type="checkbox"
                                                        className="h-3.5 w-3.5 accent-alloy-bend-pine"
                                                        checked={selected.has(a.assignmentId)}
                                                        onChange={() => toggleSelect(a.assignmentId)}
                                                        aria-label={`Select assignment ${a.assignmentTypeLabel ?? a.assignmentId}`}
                                                    />
                                                </label>
                                                <span className="pl-6 text-alloy-midnight/70">↳ assignment</span>
                                                <span />
                                                <span className="truncate">{a.roomName ?? "—"}</span>
                                                <span className="inline-flex items-center gap-1 font-medium text-alloy-midnight">
                                                    {a.isPrimary ?
                                                        <BadgeCheck className="h-3 w-3 text-alloy-bend-pine" aria-hidden />
                                                    :   null}
                                                    {a.roleLabel}
                                                </span>
                                                <span className="truncate">
                                                    {a.assignmentTypeLabel ?? "—"} · {a.weekdaysLabel}
                                                </span>
                                                <span className="capitalize">{a.status}</span>
                                            </li>
                                        ))}
                                    </ul>
                                :   null}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}
