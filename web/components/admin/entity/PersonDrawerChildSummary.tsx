"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import PersonDrawerChildSummaryBosPanel from "@/components/admin/entity/PersonDrawerChildSummaryBosPanel";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import {
    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY,
    PERSON_DRAWER_CHILD_START_DATE_KEY,
    personDrawerChildDateIsoFromRecord,
} from "@/lib/admin/person/personDrawerChildLifecycleFields";
import {
    patchPersonDrawerFields,
    personDrawerDobIsoFromRecord,
} from "@/lib/admin/person/patchPersonDrawerFields";
import {
    personDrawerGenderSelectOptions,
    personDrawerGenderStoredValue,
} from "@/lib/admin/person/personDrawerGenderField";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";

function compactFieldClassName(): string {
    return `${oppInqFieldInput} !py-1 !text-[13px]`;
}

function SummaryFieldRow({
    children,
    className = "",
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={`grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 ${className}`}>{children}</div>
    );
}

function DateField({
    label,
    value,
    disabled,
    onCommit,
}: {
    label: string;
    value: string;
    disabled: boolean;
    onCommit: (next: string) => void;
}) {
    return (
        <label className="flex min-w-0 flex-col gap-0.5">
            <span className={oppInqEyebrow}>{label}</span>
            <input
                type="date"
                value={value}
                disabled={disabled}
                onChange={(e) => onCommit(e.target.value)}
                onBlur={(e) => onCommit(e.target.value)}
                className={compactFieldClassName()}
            />
        </label>
    );
}

/** Child identity hero — editable name/DOB/gender/dates + BOS assist column. */
export default function PersonDrawerChildSummary({
    record,
    chromeHint,
    canMutate = false,
    onPersonUpdated,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerChildChromeHint | null;
    canMutate?: boolean;
    onPersonUpdated?: (next: Record<string, unknown>) => void;
}) {
    if (!personDrawerChildChromeActive(record, chromeHint)) {
        return null;
    }

    const personId = String(record.id ?? "").trim();
    const summary = resolvePersonDrawerChildSummaryModel(record);
    const genderOptions = personDrawerGenderSelectOptions(record);
    const [firstName, setFirstName] = useState(String(record.first_name ?? "").trim());
    const [lastName, setLastName] = useState(String(record.last_name ?? "").trim());
    const [dob, setDob] = useState(personDrawerDobIsoFromRecord(record));
    const [gender, setGender] = useState(personDrawerGenderStoredValue(record));
    const [enrollmentDate, setEnrollmentDate] = useState(
        personDrawerChildDateIsoFromRecord(record, PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY)
    );
    const [startDate, setStartDate] = useState(
        personDrawerChildDateIsoFromRecord(record, PERSON_DRAWER_CHILD_START_DATE_KEY)
    );
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFirstName(String(record.first_name ?? "").trim());
        setLastName(String(record.last_name ?? "").trim());
        setDob(personDrawerDobIsoFromRecord(record));
        setGender(personDrawerGenderStoredValue(record));
        setEnrollmentDate(personDrawerChildDateIsoFromRecord(record, PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY));
        setStartDate(personDrawerChildDateIsoFromRecord(record, PERSON_DRAWER_CHILD_START_DATE_KEY));
    }, [record]);

    const saveFields = useCallback(
        async (patch: Record<string, unknown>) => {
            if (!personId || !canMutate) return;
            setSaving(true);
            try {
                const json = await patchPersonDrawerFields(personId, patch);
                onPersonUpdated?.({ ...record, ...json, ...patch });
            } finally {
                setSaving(false);
            }
        },
        [canMutate, onPersonUpdated, personId, record]
    );

    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-child-summary="true"
            aria-label="Child summary"
        >
            <p className={`${oppInqEyebrow} px-0.5`}>Child summary</p>
            <div className="mt-2 flex min-w-0 items-start gap-3 px-0.5 pb-1">
                <PersonDrawerIdentityAvatar
                    displayName={summary.display_name}
                    initials={summary.initials}
                    photoUrl={summary.photo_url}
                    size="lg"
                />
                <div className="min-w-0 flex-1 space-y-2">
                    <SummaryFieldRow>
                        <label className="flex min-w-0 flex-col gap-0.5">
                            <span className={oppInqEyebrow}>Child first name</span>
                            <input
                                type="text"
                                value={firstName}
                                disabled={!canMutate || saving}
                                onChange={(e) => setFirstName(e.target.value)}
                                onBlur={() => {
                                    const next = firstName.trim();
                                    const prev = String(record.first_name ?? "").trim();
                                    if (next === prev) return;
                                    void saveFields({ first_name: next || null });
                                }}
                                className={`${compactFieldClassName()} font-semibold text-alloy-midnight`}
                                placeholder="First name"
                                autoComplete="given-name"
                                aria-label="Child first name"
                            />
                        </label>
                        <label className="flex min-w-0 flex-col gap-0.5">
                            <span className={oppInqEyebrow}>Child last name</span>
                            <input
                                type="text"
                                value={lastName}
                                disabled={!canMutate || saving}
                                onChange={(e) => setLastName(e.target.value)}
                                onBlur={() => {
                                    const next = lastName.trim();
                                    const prev = String(record.last_name ?? "").trim();
                                    if (next === prev) return;
                                    void saveFields({ last_name: next || null });
                                }}
                                className={`${compactFieldClassName()} font-semibold text-alloy-midnight`}
                                placeholder="Last name"
                                autoComplete="family-name"
                                aria-label="Child last name"
                            />
                        </label>
                    </SummaryFieldRow>
                    <SummaryFieldRow>
                        <DateField
                            label="DOB"
                            value={dob}
                            disabled={!canMutate || saving}
                            onCommit={(next) => {
                                setDob(next);
                                const prev = personDrawerDobIsoFromRecord(record);
                                if (next.trim() === prev) return;
                                void saveFields({ date_of_birth: next.trim() || null });
                            }}
                        />
                        <label className="flex min-w-0 flex-col gap-0.5">
                            <span className={oppInqEyebrow}>Gender</span>
                            <select
                                value={gender}
                                disabled={!canMutate || saving}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setGender(next);
                                    void saveFields({ gender: next || null });
                                }}
                                className={compactFieldClassName()}
                                data-person-drawer-gender-select="true"
                            >
                                <option value="">—</option>
                                {genderOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </SummaryFieldRow>
                    <SummaryFieldRow>
                        <DateField
                            label="Enrollment date"
                            value={enrollmentDate}
                            disabled={!canMutate || saving}
                            onCommit={(next) => {
                                setEnrollmentDate(next);
                                const prev = personDrawerChildDateIsoFromRecord(
                                    record,
                                    PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY
                                );
                                if (next.trim() === prev) return;
                                void saveFields({ [PERSON_DRAWER_CHILD_ENROLLMENT_DATE_KEY]: next.trim() || null });
                            }}
                        />
                        <DateField
                            label="Start date"
                            value={startDate}
                            disabled={!canMutate || saving}
                            onCommit={(next) => {
                                setStartDate(next);
                                const prev = personDrawerChildDateIsoFromRecord(
                                    record,
                                    PERSON_DRAWER_CHILD_START_DATE_KEY
                                );
                                if (next.trim() === prev) return;
                                void saveFields({ [PERSON_DRAWER_CHILD_START_DATE_KEY]: next.trim() || null });
                            }}
                        />
                    </SummaryFieldRow>
                </div>
                <PersonDrawerChildSummaryBosPanel
                    personId={personId}
                    primaryOpportunityId={summary.primary_opportunity_id}
                    overviewData={record}
                />
            </div>
        </section>
    );
}
