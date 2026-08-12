"use client";

/**
 * ⚠ RETAINED, UNMOUNTED — do not delete on an orphan scan alone.
 *
 * The PRESENTATION here now lives on the Focus Panel as
 * `components/admin/focusPanel/cards/EmploymentCard.tsx`, which carries the headline, the state
 * chip, the current-period fields, the configured facts and the history list across unchanged.
 * On presentation this file is fully superseded.
 *
 * What is NOT superseded is the MUTATION surface: Add staff / Re-hire / Edit employment / End
 * employment. Those callbacks are the only UI anywhere in the product for the registered
 * `employment.update` and `employment.end` capabilities — the Staff Directory
 * (`components/adminV2/settings/staff/StaffDirectoryPage.tsx`) offers Add Staff and nothing else,
 * and the Focus Panel card is deliberately read-only so one capability keeps one execution path.
 *
 * Deleting this file therefore destroys the only implementation of two live capabilities, which is
 * the exact trap the drawer eradication recorded: an orphan scan proves "no importer", never "safe
 * to delete". It is kept until Edit/End employment are mounted on an operator surface, and is
 * tracked as a stranded capability in the same class PR #412 resolved.
 *
 * Person → Employment card (legacy drawer-era presentation).
 *
 * Meaning first: the card answers "does this person work here, in what capacity,
 * where, and since when" in one readable line before it shows any field. It is
 * not a rendering of the `employments` row.
 *
 * When the person has never been employed here the card does not render an empty
 * "Staff" shell — an empty card asserts a relationship that does not exist. The
 * caller decides whether an Add Staff affordance belongs in that slot.
 *
 * Reuses the existing person-drawer card shell and typography. No new card
 * runtime, no Staff theme.
 */

import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";
import {
    oppInqEyebrow,
    oppInqInnerCardCompact,
    oppInqLeadSummaryShellClassName,
    oppInqMutedEmpty,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

export type PersonEmploymentSectionProps = {
    employment: PersonEmploymentComposition | null;
    canMutate: boolean;
    onAddStaff?: () => void;
    onEditEmployment?: (employmentId: string) => void;
    onEndEmployment?: (employmentId: string) => void;
};

const LABEL = "text-[10px] font-medium text-alloy-midnight/45";
const VALUE = "text-[12px] leading-snug text-alloy-midnight/85";
const ACTION =
    "text-[11px] font-medium text-alloy-blue hover:underline disabled:cursor-not-allowed disabled:opacity-50";

function formatYmd(ymd: string | null): string {
    if (!ymd) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return ymd;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}`;
}

/** The one sentence the operator actually needs. */
function headline(employment: PersonEmploymentComposition): string {
    const current = employment.current;
    if (!current) {
        const last = employment.periods[0];
        if (!last) return "Not staff";
        const role = last.position_label ? ` as ${last.position_label}` : "";
        return `Worked here${role} until ${formatYmd(last.end_date)}`;
    }
    const role = current.position_label ?? "Staff";
    const where = current.primary_location_label ? ` at ${current.primary_location_label}` : "";
    if (current.status === "pending_start") {
        return `${role}${where}, starting ${formatYmd(current.start_date)}`;
    }
    if (current.status === "ending") {
        return `${role}${where}, leaving ${formatYmd(current.end_date)}`;
    }
    return `${role}${where}, since ${formatYmd(current.start_date)}`;
}

function Field({ label, value }: { label: string; value: string | null }) {
    if (!value) return null;
    return (
        <div className="flex flex-col gap-0.5">
            <span className={LABEL}>{label}</span>
            <span className={VALUE}>{value}</span>
        </div>
    );
}

export default function PersonEmploymentSection({
    employment,
    canMutate,
    onAddStaff,
    onEditEmployment,
    onEndEmployment,
}: PersonEmploymentSectionProps) {
    // No employment history at all: offer the capability, never a hollow card.
    if (!employment || employment.never_employed) {
        if (!canMutate || !onAddStaff) return null;
        return (
            <section
                className={`${oppInqLeadSummaryShellClassName} mb-2`}
                data-person-drawer-employment="absent"
                aria-label="Employment"
            >
                <p className={`${oppInqEyebrow} px-0.5`}>Employment</p>
                <div className={`${oppInqInnerCardCompact} mt-2 flex items-center justify-between px-0.5 pb-1`}>
                    <span className={oppInqMutedEmpty}>Not staff at this organization</span>
                    <button type="button" className={ACTION} onClick={onAddStaff}>
                        Add staff
                    </button>
                </div>
            </section>
        );
    }

    const current = employment.current;
    const history = employment.periods.filter((p) => p.id !== current?.id);

    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-employment={employment.is_staff ? "active" : "ended"}
            aria-label="Employment"
        >
            <p className={`${oppInqEyebrow} px-0.5`}>Employment</p>

            <div className={`${oppInqInnerCardCompact} mt-2 px-0.5 pb-1`}>
                <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-semibold leading-snug text-alloy-midnight/90">
                        {headline(employment)}
                    </p>
                    {current ? (
                        <span
                            className="shrink-0 rounded-full bg-alloy-midnight/5 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/60"
                            data-employment-state={current.status}
                        >
                            {current.state_label}
                        </span>
                    ) : null}
                </div>

                {current ? (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                        <Field label="Position" value={current.position_label} />
                        <Field label="Type" value={current.employment_type_label} />
                        <Field label="Primary location" value={current.primary_location_label} />
                        <Field label="Start date" value={formatYmd(current.start_date)} />
                        {current.end_date ? <Field label="Last day" value={formatYmd(current.end_date)} /> : null}
                        <Field label="Employee ID" value={current.external_employee_id} />
                    </div>
                ) : null}

                {employment.configured_facts.length > 0 ? (
                    <div className="mt-3 border-t border-alloy-midnight/8 pt-2">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {employment.configured_facts.map((f) => (
                                <Field key={f.field_key} label={f.label} value={f.display || "—"} />
                            ))}
                        </div>
                    </div>
                ) : null}

                {current && canMutate ? (
                    <div className="mt-3 flex items-center gap-3 border-t border-alloy-midnight/8 pt-2">
                        {onEditEmployment ? (
                            <button type="button" className={ACTION} onClick={() => onEditEmployment(current.id)}>
                                Edit employment
                            </button>
                        ) : null}
                        {onEndEmployment ? (
                            <button type="button" className={ACTION} onClick={() => onEndEmployment(current.id)}>
                                End employment
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {!current && canMutate && onAddStaff ? (
                    <div className="mt-3 flex items-center gap-3 border-t border-alloy-midnight/8 pt-2">
                        <button type="button" className={ACTION} onClick={onAddStaff}>
                            Re-hire
                        </button>
                    </div>
                ) : null}

                {history.length > 0 ? (
                    <div className="mt-3 border-t border-alloy-midnight/8 pt-2">
                        <p className={LABEL}>Employment history</p>
                        <ul className="mt-1 space-y-1">
                            {history.map((p) => (
                                <li key={p.id} className="text-[11px] leading-snug text-alloy-midnight/55">
                                    {p.position_label ? `${p.position_label} · ` : ""}
                                    {formatYmd(p.start_date)} – {formatYmd(p.end_date)}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
