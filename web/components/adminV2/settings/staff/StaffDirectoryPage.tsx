"use client";

/**
 * Staff directory — the organization's people, and where Add Staff lives.
 *
 * Placement rationale: this is an Organization chapter, deliberately NOT under
 * Organization → Access. Access answers "who can sign in and what may they do";
 * employment answers "who works here". Hosting Add Staff inside Access would
 * blur exactly the boundary the Staff Foundation was built to keep.
 *
 * Selecting a staff member opens the canonical Person surface. There is no staff
 * record, no staff drawer, and no staff view model.
 */

import { useCallback, useEffect, useState } from "react";

import AddStaffModal from "@/components/adminV2/settings/staff/AddStaffModal";

type StaffEntry = {
    employmentId: string;
    personId: string;
    displayName: string;
    email: string | null;
    positionLabel: string | null;
    employmentType: string | null;
    primaryLocationLabel: string | null;
    employmentStatus: string;
    isOpen: boolean;
    startDate: string;
    endDate: string | null;
};

export type StaffDirectoryPageProps = {
    positions: { id: string; label: string }[];
    sites: { id: string; label: string }[];
    todayYmd: string;
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

export default function StaffDirectoryPage({ positions, sites, todayYmd }: StaffDirectoryPageProps) {
    const [staff, setStaff] = useState<StaffEntry[] | null>(null);
    const [includeEnded, setIncludeEnded] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [flash, setFlash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(`/api/admin/staff/directory?include_ended=${includeEnded ? "true" : "false"}`);
            const json = (await res.json()) as { staff?: StaffEntry[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Could not load staff");
            setStaff(json.staff ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load staff");
            setStaff([]);
        }
    }, [includeEnded]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="px-6 py-6" data-staff-directory="true">
            <header className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">
                        Organization
                    </p>
                    <h1 className="text-[19px] font-semibold text-alloy-midnight">Staff</h1>
                    <p className="mt-1 max-w-[62ch] text-[12px] leading-snug text-alloy-midnight/60">
                        Who works for this organization, in what capacity, and since when. Employment is separate
                        from Alloy access — a staff member does not need a sign-in to exist here.
                    </p>
                </div>
                <button
                    type="button"
                    className="shrink-0 rounded bg-alloy-blue px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-blue/90"
                    onClick={() => setAddOpen(true)}
                    data-staff-add-open="true"
                >
                    Add staff
                </button>
            </header>

            {flash ? (
                <p
                    className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[12px] text-emerald-800"
                    data-staff-flash="true"
                >
                    {flash}
                </p>
            ) : null}
            {error ? (
                <p className="mb-3 rounded border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700">
                    {error}
                </p>
            ) : null}

            <label className="mb-3 inline-flex items-center gap-2 text-[12px] text-alloy-midnight/65">
                <input
                    type="checkbox"
                    checked={includeEnded}
                    onChange={(e) => setIncludeEnded(e.target.checked)}
                    data-staff-include-ended="true"
                />
                Include former staff
            </label>

            {staff == null ? (
                <p className="text-[12px] text-alloy-midnight/50">Loading…</p>
            ) : staff.length === 0 ? (
                <div className="rounded border border-dashed border-admin-border px-4 py-8 text-center">
                    <p className="text-[13px] font-medium text-alloy-midnight/75">No staff yet</p>
                    <p className="mt-1 text-[12px] text-alloy-midnight/55">
                        Add the people who work here. Alloy will reuse an existing person record when one already
                        exists.
                    </p>
                </div>
            ) : (
                <ul className="divide-y divide-admin-border rounded border border-admin-border" data-staff-list="true">
                    {staff.map((s) => (
                        <li key={s.employmentId} className="flex items-center justify-between gap-4 px-3 py-2.5">
                            <div className="min-w-0">
                                <a
                                    href={`/organization/staff?personId=${encodeURIComponent(s.personId)}`}
                                    className="block truncate text-[13px] font-medium text-alloy-midnight hover:underline"
                                    data-staff-person={s.personId}
                                >
                                    {s.displayName}
                                </a>
                                <p className="truncate text-[11px] text-alloy-midnight/55">
                                    {[
                                        s.positionLabel,
                                        s.employmentType ? (TYPE_LABELS[s.employmentType] ?? s.employmentType) : null,
                                        s.primaryLocationLabel,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ") || "No position set"}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <span
                                    className="rounded-full bg-alloy-midnight/5 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60"
                                    data-staff-state={s.employmentStatus}
                                >
                                    {s.isOpen ? "Active" : "Ended"}
                                </span>
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/45">
                                    {s.isOpen
                                        ? `Since ${formatYmd(s.startDate)}`
                                        : `Until ${formatYmd(s.endDate)}`}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <AddStaffModal
                open={addOpen}
                positions={positions}
                sites={sites}
                todayYmd={todayYmd}
                onClose={() => setAddOpen(false)}
                onCreated={(result) => {
                    setAddOpen(false);
                    setFlash(
                        result.identityOutcome === "linked_existing"
                            ? "Employment added to the existing person — no duplicate was created."
                            : "New person and employment created."
                    );
                    void load();
                }}
            />
        </div>
    );
}
