"use client";

import { useCallback, useEffect, useState } from "react";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { isPersonDrawerSeedRecord } from "@/lib/admin/drawer/personDrawerOpenSeed";
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

function FieldLabel({ children }: { children: string }) {
    return <p className={oppInqEyebrow}>{children}</p>;
}

function SummarySkeleton() {
    return (
        <div className="mt-2 flex min-w-0 items-start gap-3 px-0.5 pb-0.5" aria-hidden>
            <div className="h-11 w-11 shrink-0 rounded-full skeleton-pulse bg-alloy-stone/12" />
            <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-32 rounded skeleton-pulse bg-alloy-stone/12" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="h-9 rounded-md skeleton-pulse bg-alloy-stone/12" />
                    <div className="h-9 rounded-md skeleton-pulse bg-alloy-stone/12" />
                </div>
            </div>
        </div>
    );
}

/** Editable child summary — avatar + DOB/gender; no duplicate header context. */
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

    const seedOnly = isPersonDrawerSeedRecord(record);
    const personId = String(record.id ?? "").trim();
    const summary = resolvePersonDrawerChildSummaryModel(record);
    const genderOptions = personDrawerGenderSelectOptions(record);
    const [dob, setDob] = useState(personDrawerDobIsoFromRecord(record));
    const [gender, setGender] = useState(personDrawerGenderStoredValue(record));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
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
            {seedOnly ? (
                <SummarySkeleton />
            ) : (
                <div className="mt-2 flex min-w-0 items-start gap-3 px-0.5 pb-0.5">
                    <PersonDrawerIdentityAvatar
                        displayName={summary.display_name}
                        initials={summary.initials}
                        photoUrl={summary.photo_url}
                        size="md"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                                <FieldLabel>Date of birth</FieldLabel>
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
                                    className={oppInqFieldInput}
                                />
                            </div>
                            <div>
                                <FieldLabel>Gender</FieldLabel>
                                {genderOptions.length > 0 ? (
                                    <select
                                        value={gender}
                                        disabled={!canMutate || saving}
                                        onChange={(e) => {
                                            const next = e.target.value;
                                            setGender(next);
                                            void saveFields({ gender: next || null });
                                        }}
                                        className={oppInqFieldInput}
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
                                        className={oppInqFieldInput}
                                        placeholder="—"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
