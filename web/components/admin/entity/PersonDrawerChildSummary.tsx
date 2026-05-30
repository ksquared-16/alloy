"use client";

import { useCallback, useEffect, useState } from "react";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import {
    patchPersonDrawerFields,
    personDrawerDobIsoFromRecord,
} from "@/lib/admin/person/patchPersonDrawerFields";
import {
    personDrawerGenderDisplayLabel,
    personDrawerGenderSelectOptions,
    personDrawerGenderStoredValue,
} from "@/lib/admin/person/personDrawerGenderField";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";

function compactFieldClassName(): string {
    return `${oppInqFieldInput} !py-1 !text-[13px]`;
}

/** Child identity hero — avatar, name, editable DOB/gender; age lives in title row only. */
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
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFirstName(String(record.first_name ?? "").trim());
        setLastName(String(record.last_name ?? "").trim());
        setDob(personDrawerDobIsoFromRecord(record));
        setGender(personDrawerGenderStoredValue(record));
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
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                            className={`${compactFieldClassName()} min-w-[6rem] max-w-[10rem] flex-1 font-semibold text-alloy-midnight`}
                            placeholder="First name"
                            autoComplete="given-name"
                            aria-label="First name"
                        />
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
                            className={`${compactFieldClassName()} min-w-[6rem] max-w-[12rem] flex-1 font-semibold text-alloy-midnight`}
                            placeholder="Last name"
                            autoComplete="family-name"
                            aria-label="Last name"
                        />
                    </div>
                    <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
                        <label className="flex min-w-[8.5rem] flex-col gap-0.5">
                            <span className={oppInqEyebrow}>DOB</span>
                            <input
                                type="date"
                                value={dob}
                                disabled={!canMutate || saving}
                                onChange={(e) => setDob(e.target.value)}
                                onBlur={() => {
                                    const next = dob.trim();
                                    const prev = personDrawerDobIsoFromRecord(record);
                                    if (next === prev) return;
                                    void saveFields({ date_of_birth: next || null });
                                }}
                                className={compactFieldClassName()}
                            />
                        </label>
                        <label className="flex min-w-[7.5rem] flex-col gap-0.5">
                            <span className={oppInqEyebrow}>Gender</span>
                            {genderOptions.length > 0 ? (
                                <select
                                    value={gender}
                                    disabled={!canMutate || saving}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setGender(next);
                                        void saveFields({ gender: next || null });
                                    }}
                                    className={compactFieldClassName()}
                                >
                                    <option value="">—</option>
                                    {genderOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={personDrawerGenderDisplayLabel(record) ?? gender}
                                    disabled={!canMutate || saving}
                                    onChange={(e) => setGender(e.target.value)}
                                    onBlur={() => {
                                        const next = gender.trim();
                                        const prev = personDrawerGenderStoredValue(record);
                                        if (next === prev) return;
                                        void saveFields({ gender: next || null });
                                    }}
                                    className={compactFieldClassName()}
                                    placeholder="—"
                                />
                            )}
                        </label>
                    </div>
                </div>
            </div>
        </section>
    );
}
