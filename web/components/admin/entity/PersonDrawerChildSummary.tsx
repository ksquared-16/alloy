"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import PersonDrawerChildSummaryBosPanel from "@/components/admin/entity/PersonDrawerChildSummaryBosPanel";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import { registerPersonDrawerEditSection } from "@/lib/admin/person/personDrawerEditingCoordinator";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { PersonDrawerChildChromeHint } from "@/lib/admin/person/personDrawerChildChrome";
import { patchPersonDrawerFields } from "@/lib/admin/person/patchPersonDrawerFields";
import {
    buildChildSummaryPatch,
    childSummaryDraftFromRecord,
    childSummaryDraftIsDirty,
    type ChildSummaryDraft,
} from "@/lib/admin/person/personDrawerSummaryDraft";
import { personDrawerGenderSelectOptions } from "@/lib/admin/person/personDrawerGenderField";
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
    return <div className={`grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 ${className}`}>{children}</div>;
}

function DateField({
    label,
    value,
    disabled,
    onChange,
}: {
    label: string;
    value: string;
    disabled: boolean;
    onChange: (next: string) => void;
}) {
    return (
        <label className="flex min-w-0 flex-col gap-0.5">
            <span className={oppInqEyebrow}>{label}</span>
            <input
                type="date"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className={compactFieldClassName()}
            />
        </label>
    );
}

/** Child identity hero — explicit save (no DOB blur autosave). */
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
    const [draft, setDraft] = useState<ChildSummaryDraft>(() => childSummaryDraftFromRecord(record));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(childSummaryDraftFromRecord(record));
    }, [record]);

    const dirty = useMemo(() => childSummaryDraftIsDirty(record, draft), [draft, record]);

    const saveAll = useCallback(async () => {
        if (!personId || !canMutate || !dirty) return;
        const patch = buildChildSummaryPatch(record, draft);
        if (Object.keys(patch).length === 0) return;
        setSaving(true);
        try {
            const json = await patchPersonDrawerFields(personId, patch);
            onPersonUpdated?.({ ...record, ...json, ...patch });
        } finally {
            setSaving(false);
        }
    }, [canMutate, dirty, draft, onPersonUpdated, personId, record]);

    useEffect(() => {
        registerPersonDrawerEditSection("child_summary", {
            isDirty: () => childSummaryDraftIsDirty(record, draft),
            save: saveAll,
            revert: () => setDraft(childSummaryDraftFromRecord(record)),
        });
        return () => registerPersonDrawerEditSection("child_summary", null);
    }, [draft, record, saveAll]);

    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-child-summary="true"
            aria-label="Child summary"
        >
            <p className={`${oppInqEyebrow} px-0.5`}>Child summary</p>
            <div
                className="mt-3 grid min-w-0 grid-cols-1 gap-4 px-0.5 pb-1 md:grid-cols-2 md:items-stretch"
                data-person-drawer-child-summary-columns="true"
            >
                <div className="min-w-0 space-y-3">
                    <div className="flex items-start gap-3">
                        <PersonDrawerIdentityAvatar
                            displayName={summary.display_name}
                            initials={summary.initials}
                            photoUrl={summary.photo_url}
                            size="lg"
                        />
                        <div className="min-w-0 flex-1 space-y-3">
                            <SummaryFieldRow>
                                <label className="flex min-w-0 flex-col gap-0.5">
                                    <span className={oppInqEyebrow}>First name</span>
                                    <input
                                        type="text"
                                        value={draft.first_name}
                                        disabled={!canMutate || saving}
                                        onChange={(e) =>
                                            setDraft((p) => ({ ...p, first_name: e.target.value }))
                                        }
                                        className={`${compactFieldClassName()} font-semibold text-alloy-midnight`}
                                        placeholder="First name"
                                        autoComplete="given-name"
                                        aria-label="Child first name"
                                    />
                                </label>
                                <label className="flex min-w-0 flex-col gap-0.5">
                                    <span className={oppInqEyebrow}>Last name</span>
                                    <input
                                        type="text"
                                        value={draft.last_name}
                                        disabled={!canMutate || saving}
                                        onChange={(e) =>
                                            setDraft((p) => ({ ...p, last_name: e.target.value }))
                                        }
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
                                    value={draft.date_of_birth}
                                    disabled={!canMutate || saving}
                                    onChange={(next) => setDraft((p) => ({ ...p, date_of_birth: next }))}
                                />
                                <label className="flex min-w-0 flex-col gap-0.5">
                                    <span className={oppInqEyebrow}>Gender</span>
                                    <select
                                        value={draft.gender}
                                        disabled={!canMutate || saving}
                                        onChange={(e) =>
                                            setDraft((p) => ({ ...p, gender: e.target.value }))
                                        }
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
                                    value={draft.enrollment_date}
                                    disabled={!canMutate || saving}
                                    onChange={(next) =>
                                        setDraft((p) => ({ ...p, enrollment_date: next }))
                                    }
                                />
                                <DateField
                                    label="Start date"
                                    value={draft.start_date}
                                    disabled={!canMutate || saving}
                                    onChange={(next) => setDraft((p) => ({ ...p, start_date: next }))}
                                />
                            </SummaryFieldRow>
                        </div>
                    </div>
                </div>
                <PersonDrawerChildSummaryBosPanel personId={personId} overviewData={record} />
            </div>
        </section>
    );
}
