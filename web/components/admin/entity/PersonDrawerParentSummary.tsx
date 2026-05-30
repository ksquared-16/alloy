"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import PersonDrawerParentSummaryBosPanel from "@/components/admin/entity/PersonDrawerParentSummaryBosPanel";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import PersonDrawerSummarySaveBar from "@/components/admin/entity/PersonDrawerSummarySaveBar";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import { patchPersonDrawerFields } from "@/lib/admin/person/patchPersonDrawerFields";
import {
    buildParentSummaryPatch,
    parentSummaryDraftFromRecord,
    parentSummaryDraftIsDirty,
    type ParentSummaryDraft,
} from "@/lib/admin/person/personDrawerSummaryDraft";
import { resolvePersonDrawerParentSummaryModel } from "@/lib/admin/person/personDrawerParentSummaryModel";
import { setPersonDrawerUnsavedChecker } from "@/lib/admin/person/personDrawerUnsavedGuard";

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

/** Parent/guardian contact hero — explicit save (no field blur autosave). */
export default function PersonDrawerParentSummary({
    record,
    chromeHint,
    canMutate = false,
    onPersonUpdated,
}: {
    record: Record<string, unknown>;
    chromeHint?: PersonDrawerParentChromeHint | null;
    canMutate?: boolean;
    onPersonUpdated?: (next: Record<string, unknown>) => void;
}) {
    if (!personDrawerParentChromeActive(record, chromeHint)) {
        return null;
    }

    const personId = String(record.id ?? "").trim();
    const summary = resolvePersonDrawerParentSummaryModel(record);
    const [draft, setDraft] = useState<ParentSummaryDraft>(() => parentSummaryDraftFromRecord(record));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setDraft(parentSummaryDraftFromRecord(record));
    }, [record]);

    const dirty = useMemo(() => parentSummaryDraftIsDirty(record, draft), [draft, record]);

    useEffect(() => {
        setPersonDrawerUnsavedChecker(() => dirty);
        return () => setPersonDrawerUnsavedChecker(null);
    }, [dirty]);

    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!dirty) return;
            e.preventDefault();
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);

    const saveAll = useCallback(async () => {
        if (!personId || !canMutate || !dirty) return;
        const patch = buildParentSummaryPatch(record, draft);
        if (Object.keys(patch).length === 0) return;
        setSaving(true);
        try {
            const json = await patchPersonDrawerFields(personId, patch);
            onPersonUpdated?.({ ...record, ...json, ...patch });
        } finally {
            setSaving(false);
        }
    }, [canMutate, dirty, draft, onPersonUpdated, personId, record]);

    return (
        <section
            className={`${oppInqLeadSummaryShellClassName} mb-2`}
            data-person-drawer-parent-summary="true"
            aria-label="Parent summary"
        >
            <p className={`${oppInqEyebrow} px-0.5`}>Parent summary</p>
            <div
                className="mt-3 grid min-w-0 grid-cols-1 gap-4 px-0.5 pb-1 md:grid-cols-2 md:items-stretch"
                data-person-drawer-parent-summary-columns="true"
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
                                        autoComplete="given-name"
                                        aria-label="Parent first name"
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
                                        autoComplete="family-name"
                                        aria-label="Parent last name"
                                    />
                                </label>
                            </SummaryFieldRow>
                            <SummaryFieldRow>
                                <label className="flex min-w-0 flex-col gap-0.5">
                                    <span className={oppInqEyebrow}>Email</span>
                                    <input
                                        type="email"
                                        value={draft.email}
                                        disabled={!canMutate || saving}
                                        onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                                        className={compactFieldClassName()}
                                        autoComplete="email"
                                        aria-label="Parent email"
                                    />
                                </label>
                                <label className="flex min-w-0 flex-col gap-0.5">
                                    <span className={oppInqEyebrow}>Mobile</span>
                                    <input
                                        type="tel"
                                        value={draft.phone}
                                        disabled={!canMutate || saving}
                                        onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
                                        className={compactFieldClassName()}
                                        autoComplete="tel"
                                        aria-label="Parent phone"
                                    />
                                </label>
                            </SummaryFieldRow>
                            {(summary.has_preferred_contact_field || summary.has_communication_opt_out_field) && (
                                <SummaryFieldRow>
                                    {summary.has_preferred_contact_field ? (
                                        <label className="flex min-w-0 flex-col gap-0.5">
                                            <span className={oppInqEyebrow}>Preferred contact</span>
                                            <input
                                                type="text"
                                                value={draft.preferred_contact_method}
                                                disabled={!canMutate || saving}
                                                onChange={(e) =>
                                                    setDraft((p) => ({
                                                        ...p,
                                                        preferred_contact_method: e.target.value,
                                                    }))
                                                }
                                                className={compactFieldClassName()}
                                                aria-label="Preferred contact method"
                                            />
                                        </label>
                                    ) : (
                                        <span />
                                    )}
                                    {summary.has_communication_opt_out_field ? (
                                        <label className="flex min-w-0 flex-col gap-0.5">
                                            <span className={oppInqEyebrow}>Communication opt-out</span>
                                            <select
                                                value={draft.communication_opt_out ? "yes" : "no"}
                                                disabled={!canMutate || saving}
                                                onChange={(e) =>
                                                    setDraft((p) => ({
                                                        ...p,
                                                        communication_opt_out: e.target.value === "yes",
                                                    }))
                                                }
                                                className={compactFieldClassName()}
                                                data-person-drawer-communication-opt-out="true"
                                                aria-label="Communication opt-out"
                                            >
                                                <option value="no">No</option>
                                                <option value="yes">Yes</option>
                                            </select>
                                        </label>
                                    ) : null}
                                </SummaryFieldRow>
                            )}
                            <PersonDrawerSummarySaveBar
                                dirty={dirty}
                                saving={saving}
                                canMutate={canMutate}
                                onSave={() => void saveAll()}
                            />
                        </div>
                    </div>
                </div>
                <PersonDrawerParentSummaryBosPanel personId={personId} overviewData={record} />
            </div>
        </section>
    );
}
