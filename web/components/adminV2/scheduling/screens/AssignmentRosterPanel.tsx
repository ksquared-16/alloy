"use client";

/**
 * Assignment roster — consumes operational assignments (Primary / Secondary, room, type, status).
 * Staff subject expansion is structurally ready via subjectType on each row.
 */

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, ChevronRight } from "lucide-react";

import { AlloySelect } from "@/components/workspace/AlloySelect";
import CardAvatar from "@/components/admin/focusPanel/CardAvatar";
import type { OrgAssignmentTypeOption } from "@/lib/operationalAssignments/loadOrgAssignmentTypes";

export type AssignmentRosterSubject = {
    subjectKey: string;
    /** Null for staff subjects — the assignment ledger requires it. */
    customerMemberId: string | null;
    /** Null for staff subjects and for proposed member-scoped child rows. */
    enrollmentAgreementId: string | null;
    subjectName: string;
    /** Staff subjects only — configured position from the covering employment. */
    positionLabel?: string | null;
    subjectType: "child" | "staff";
    assignmentCount: number;
    primaryRoom: string | null;
    /** Profile image URL when the child/staff person record carries one, else initials avatar. */
    imageUrl?: string | null;
    assignments: {
        assignmentId: string;
        isPrimary: boolean;
        roleLabel: "Primary" | "Secondary";
        assignmentTypeLabel: string | null;
        roomName: string | null;
        weekdaysLabel: string;
        timeLabel?: string | null;
        effectiveFrom: string;
        effectiveTo: string | null;
        status: string;
        lifecycleLabel?: string;
        commitmentKind?: "proposed" | "committed";
    }[];
};

export type BulkAssignmentPreviewRow = {
    customerMemberId: string | null;
    subjectName: string;
    status: "ready" | "blocked";
    reason?: string;
    payload: Record<string, unknown>;
};

export type AssignmentRosterBulkHandlers = {
    onCreateForChild?: (customerMemberId: string) => void;
    onBulkArchive?: (assignmentIds: string[]) => void | Promise<void>;
    onBulkMakePrimary?: (payload: { subjectKey: string; assignmentId: string; effectiveFrom: string }[]) => void | Promise<void>;
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
    initialBulkMode = null,
}: {
    subjects: AssignmentRosterSubject[];
    loading: boolean;
    siteName: string;
    bulk?: AssignmentRosterBulkHandlers;
    /** Header Actions → Roster deep-link into a bulk preview. */
    initialBulkMode?: "assignment" | "room" | null;
}) {
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [bulkMode, setBulkMode] = useState<"assignment" | "room" | null>(initialBulkMode);
    const [bulkTypeId, setBulkTypeId] = useState("");
    const [bulkPatternId, setBulkPatternId] = useState("");
    const [bulkRoomId, setBulkRoomId] = useState("");
    const [bulkStartDate, setBulkStartDate] = useState(new Date().toISOString().slice(0, 10));

    useEffect(() => {
        if (initialBulkMode) setBulkMode(initialBulkMode);
    }, [initialBulkMode]);

    const [detailAssignmentId, setDetailAssignmentId] = useState<string | null>(null);
    const detailAssignment = useMemo(() => {
        if (!detailAssignmentId) return null;
        for (const s of subjects) {
            const a = s.assignments.find((x) => x.assignmentId === detailAssignmentId);
            if (a) return { subject: s, assignment: a };
        }
        return null;
    }, [detailAssignmentId, subjects]);

    const totalAssignments = useMemo(
        () => subjects.reduce((n, s) => n + s.assignmentCount, 0),
        [subjects]
    );

    const toggle = (subjectKey: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(subjectKey)) next.delete(subjectKey);
            else next.add(subjectKey);
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
        const rows: { subjectKey: string; assignmentId: string; isPrimary: boolean; effectiveFrom: string }[] = [];
        for (const s of subjects) {
            for (const a of s.assignments) {
                if (selected.has(a.assignmentId)) {
                    rows.push({
                        subjectKey: s.subjectKey,
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
        const selectedKeys = new Set(selectedAssignments.map((r) => r.subjectKey));
        return subjects.filter((s) => selectedKeys.has(s.subjectKey));
    }, [subjects, selectedAssignments]);

    const bulkAssignmentPreview = useMemo((): BulkAssignmentPreviewRow[] => {
        if (!bulkMode || bulkMode !== "assignment") return [];
        const type = bulk?.assignmentTypes?.find((t) => t.id === bulkTypeId);
        return selectedSubjects.map((s) => {
            // Staff assignments are authored through the assignment action with a
            // person subject; this bulk path builds child payloads only. Blocking
            // is deliberate — coercing a staff subject into an enrollment-shaped
            // payload is exactly the bug this phase removed from the read model.
            const isStaff = s.subjectType === "staff";
            const incomplete = !bulkTypeId || !bulkPatternId || !bulkRoomId || !bulkStartDate;
            const blocked = isStaff || incomplete || !s.enrollmentAgreementId;
            return {
                customerMemberId: s.customerMemberId,
                subjectName: s.subjectName,
                status: blocked ? "blocked" : "ready",
                reason: isStaff
                    ? "Staff assignments are authored from the staff member, not bulk child assignment"
                    : !s.enrollmentAgreementId
                      ? "This child has no enrollment agreement yet"
                      : incomplete
                        ? "Complete type, pattern, room, and start date"
                        : undefined,
                payload: {
                    subject_type: "child",
                    enrollment_agreement_id: s.enrollmentAgreementId,
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
                <p className="text-[13px] font-semibold text-alloy-midnight">No assignments at {siteName}</p>
                <p className="mt-1 max-w-md text-[12px] text-alloy-slate">
                    Proposed and committed assignments appear here with room, Assignment Category, role, and lifecycle state.
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
                                onClick={() => {
                                    const memberId = selectedSubjects[0]?.customerMemberId;
                                    if (memberId) bulk.onCreateForChild?.(memberId);
                                }}
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
                            placeholder="Assignment Category"
                            options={(bulk?.assignmentTypes ?? []).map((t) => ({
                                value: t.id ?? "",
                                label: t.label ?? "",
                            }))}
                            aria-label="Bulk Assignment Category"
                        />
                        <input
                            type="text"
                            value={bulkPatternId}
                            onChange={(e) => setBulkPatternId(e.target.value)}
                            placeholder="Schedule Pattern"
                            className="rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                        <input
                            type="text"
                            value={bulkRoomId}
                            onChange={(e) => setBulkRoomId(e.target.value)}
                            placeholder="Choose room"
                            className="rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />                        <input
                            type="date"
                            value={bulkStartDate}
                            onChange={(e) => setBulkStartDate(e.target.value)}
                            className="rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                    </div>
                    <ul className="mt-2 space-y-1">
                        {bulkAssignmentPreview.map((row) => (
                            <li key={row.customerMemberId} className="text-[11px] text-alloy-slate">
                                {row.subjectName} ·{" "}
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
                            placeholder="Choose room"
                            className="min-w-[200px] flex-1 rounded-lg border border-alloy-stone/25 px-2 py-1.5 text-[12px]"
                        />
                        <button
                            type="button"
                            className="rounded-lg bg-alloy-bend-pine px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            disabled={bulk?.busy || !bulkRoomId || selectedAssignments.length === 0}
                            onClick={() => {
                                const rows = selectedAssignments.map((r) => {
                                    const subject = subjects.find((s) => s.subjectKey === r.subjectKey);
                                    const assignment = subject?.assignments.find(
                                        (a) => a.assignmentId === r.assignmentId,
                                    );
                                    return {
                                        customerMemberId: subject?.customerMemberId ?? "",
                                        payload: {
                                            subject_type: "child",
                                            enrollment_agreement_id: subject?.enrollmentAgreementId ?? null,
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

            <div
                className="overflow-hidden rounded-xl border border-alloy-stone/12 bg-white"
                data-assignment-roster-list="true"
            >
                <ul className="divide-y divide-alloy-stone/8">
                    {subjects.map((subject) => {
                        const isOpen = expanded.has(subject.subjectKey);
                        const primary = subject.assignments.find((a) => a.isPrimary) ?? subject.assignments[0];
                        const primaryLifecycle = primary?.lifecycleLabel ?? null;
                        const subjectSelected = subject.assignments.some((a) => selected.has(a.assignmentId));
                        return (
                            <li
                                key={subject.subjectKey}
                                className="px-3 py-2.5"
                                data-assignment-roster-subject={subject.subjectKey}
                            >
                                <div className="flex items-start gap-2.5">
                                    <label className="mt-1.5 flex shrink-0 items-center justify-center">
                                        <input
                                            type="checkbox"
                                            className="h-3.5 w-3.5 accent-alloy-bend-pine"
                                            checked={subjectSelected}
                                            onChange={() => {
                                                if (subjectSelected) {
                                                    setSelected((prev) => {
                                                        const next = new Set(prev);
                                                        for (const a of subject.assignments) next.delete(a.assignmentId);
                                                        return next;
                                                    });
                                                } else if (primary) {
                                                    toggleSelect(primary.assignmentId);
                                                }
                                            }}
                                            aria-label={`Select ${subject.subjectName}`}
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className="min-w-0 flex-1 text-left"
                                        onClick={() => {
                                            if (subject.assignmentCount > 1) {
                                                toggle(subject.subjectKey);
                                                return;
                                            }
                                            if (primary) setDetailAssignmentId(primary.assignmentId);
                                        }}
                                        aria-expanded={isOpen}
                                        data-assignment-roster-child={subject.subjectKey}
                                    >
                                        <div className="flex items-start gap-2.5">
                                            <span className="mt-0.5 shrink-0" data-assignment-roster-avatar={subject.subjectKey}>
                                                <CardAvatar name={subject.subjectName} imageUrl={subject.imageUrl} size={32} />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                    <span className="text-[13px] font-semibold text-alloy-midnight">
                                                        {subject.subjectName}
                                                    </span>
                                                    {primaryLifecycle ? (
                                                        <span
                                                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                                                primaryLifecycle === "Proposed" ||
                                                                primary?.commitmentKind === "proposed"
                                                                    ? "bg-[#00458C]/12 text-[#00458C]"
                                                                    : "bg-alloy-stone/50 text-alloy-midnight/70"
                                                            }`}
                                                            data-assignment-roster-lifecycle={primaryLifecycle}
                                                        >
                                                            {primaryLifecycle}
                                                        </span>
                                                    ) : null}
                                                    {subject.assignmentCount > 1 ? (
                                                        isOpen ?
                                                            <ChevronDown className="h-3.5 w-3.5 text-alloy-slate" aria-hidden />
                                                        :   <ChevronRight className="h-3.5 w-3.5 text-alloy-slate" aria-hidden />
                                                    ) : null}
                                                </div>
                                                <p className="mt-0.5 text-[11.5px] text-alloy-slate">
                                                    Primary: {subject.primaryRoom ?? "—"}
                                                    <span className="mx-1.5 text-alloy-stone">·</span>
                                                    {subject.assignmentCount}{" "}
                                                    {subject.assignmentCount === 1 ? "Assignment" : "Assignments"}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                </div>

                                {(isOpen || subject.assignmentCount === 1) ? (
                                    <ul className="mt-2 space-y-1.5 pl-[42px]">
                                        {subject.assignments.map((a) => {
                                            const scheduleBits = [a.weekdaysLabel, a.timeLabel].filter(Boolean).join(" · ");
                                            return (
                                                <li
                                                    key={a.assignmentId}
                                                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-alloy-stone/[0.04]"
                                                    data-assignment-roster-row={a.assignmentId}
                                                    data-assignment-roster-line={a.assignmentId}
                                                >
                                                    <label className="mt-0.5 flex shrink-0 items-center justify-center">
                                                        <input
                                                            type="checkbox"
                                                            className="h-3.5 w-3.5 accent-alloy-bend-pine"
                                                            checked={selected.has(a.assignmentId)}
                                                            onChange={() => toggleSelect(a.assignmentId)}
                                                            aria-label={`Select ${a.assignmentTypeLabel ?? "assignment"}`}
                                                        />
                                                    </label>
                                                    <button
                                                        type="button"
                                                        className="min-w-0 flex-1 text-left"
                                                        onClick={() => setDetailAssignmentId(a.assignmentId)}
                                                        data-assignment-roster-open={a.assignmentId}
                                                    >
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="text-[12px] font-semibold text-alloy-midnight">
                                                                {a.assignmentTypeLabel ?? "Assignment"}
                                                            </span>
                                                            {a.isPrimary ? (
                                                                <span className="inline-flex items-center gap-0.5 rounded-full bg-alloy-bend-pine/10 px-1.5 py-0.5 text-[10px] font-semibold text-alloy-bend-pine">
                                                                    <BadgeCheck className="h-3 w-3" aria-hidden />
                                                                    Primary
                                                                </span>
                                                            ) : null}
                                                            {a.lifecycleLabel === "Proposed" ||
                                                            a.commitmentKind === "proposed" ? (
                                                                <span
                                                                    className="rounded-full bg-[#00458C]/12 px-1.5 py-0.5 text-[10px] font-semibold text-[#00458C]"
                                                                    data-assignment-roster-proposed="true"
                                                                >
                                                                    Proposed
                                                                </span>
                                                            ) : a.lifecycleLabel && a.lifecycleLabel !== "Active" ? (
                                                                <span className="text-[10px] font-medium text-alloy-slate">
                                                                    {a.lifecycleLabel}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <p className="mt-0.5 text-[11px] text-alloy-slate">
                                                            {[a.roomName, scheduleBits].filter(Boolean).join(" · ") || "—"}
                                                        </p>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </div>

            {detailAssignment ? (
                <aside
                    className="rounded-xl border border-alloy-stone/15 bg-white px-4 py-3 shadow-[0_2px_8px_rgba(24,39,58,0.06)]"
                    data-assignment-roster-detail={detailAssignment.assignment.assignmentId}
                >
                    <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Assignment detail
                            </p>
                            <p className="text-[13px] font-semibold text-alloy-midnight">
                                {detailAssignment.subject.subjectName}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                            onClick={() => setDetailAssignmentId(null)}
                        >
                            Close
                        </button>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">Role</dt>
                            <dd className="text-alloy-midnight">{detailAssignment.assignment.roleLabel}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">Type</dt>
                            <dd className="text-alloy-midnight">
                                {detailAssignment.assignment.assignmentTypeLabel ?? "—"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">Room</dt>
                            <dd className="text-alloy-midnight">{detailAssignment.assignment.roomName ?? "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">Days</dt>
                            <dd className="text-alloy-midnight">{detailAssignment.assignment.weekdaysLabel || "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">
                                Effective
                            </dt>
                            <dd className="text-alloy-midnight">
                                {detailAssignment.assignment.effectiveFrom}
                                {detailAssignment.assignment.effectiveTo
                                    ? ` → ${detailAssignment.assignment.effectiveTo}`
                                    : ""}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-alloy-slate">Status</dt>
                            <dd
                                className={
                                    detailAssignment.assignment.lifecycleLabel === "Proposed" ||
                                    detailAssignment.assignment.commitmentKind === "proposed"
                                        ? "font-semibold text-[#00458C]"
                                        : "text-alloy-midnight"
                                }
                            >
                                {detailAssignment.assignment.lifecycleLabel
                                    ?? (detailAssignment.assignment.commitmentKind === "proposed"
                                        ? "Proposed"
                                        : "—")}
                            </dd>
                        </div>
                    </dl>
                    {bulk?.onCreateForChild ? (
                        <button
                            type="button"
                            className="mt-3 text-[11.5px] font-semibold text-alloy-bend-pine hover:underline"
                            onClick={() => {
                                const memberId = detailAssignment.subject.customerMemberId;
                                if (memberId) bulk.onCreateForChild?.(memberId);
                            }}
                        >
                            + Add Assignment for this child
                        </button>
                    ) : null}
                </aside>
            ) : null}
        </div>
    );
}
