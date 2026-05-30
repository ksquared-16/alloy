"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import PersonDrawerParentSummaryBosPanel from "@/components/admin/entity/PersonDrawerParentSummaryBosPanel";
import PersonDrawerIdentityAvatar from "@/components/admin/entity/PersonDrawerIdentityAvatar";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import { patchPersonDrawerFields } from "@/lib/admin/person/patchPersonDrawerFields";
import { resolvePersonDrawerParentSummaryModel } from "@/lib/admin/person/personDrawerParentSummaryModel";
import { formatPhoneUS } from "@/lib/adminFormatters";

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

/** Parent/guardian contact hero — 50/50 fields + BOS assist. */
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
    const [firstName, setFirstName] = useState(String(record.first_name ?? "").trim());
    const [lastName, setLastName] = useState(String(record.last_name ?? "").trim());
    const [email, setEmail] = useState(String(record.email ?? "").trim());
    const [phone, setPhone] = useState(String(record.phone ?? "").trim());
    const [preferredContact, setPreferredContact] = useState(summary.preferred_contact_method ?? "");
    const [optOut, setOptOut] = useState(summary.communication_opt_out);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const next = resolvePersonDrawerParentSummaryModel(record);
        setFirstName(String(record.first_name ?? "").trim());
        setLastName(String(record.last_name ?? "").trim());
        setEmail(String(record.email ?? "").trim());
        setPhone(String(record.phone ?? "").trim());
        setPreferredContact(next.preferred_contact_method ?? "");
        setOptOut(next.communication_opt_out);
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
                                        autoComplete="given-name"
                                        aria-label="Parent first name"
                                    />
                                </label>
                                <label className="flex min-w-0 flex-col gap-0.5">
                                    <span className={oppInqEyebrow}>Last name</span>
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
                                        value={email}
                                        disabled={!canMutate || saving}
                                        onChange={(e) => setEmail(e.target.value)}
                                        onBlur={() => {
                                            const next = email.trim();
                                            const prev = String(record.email ?? "").trim();
                                            if (next === prev) return;
                                            void saveFields({ email: next || null });
                                        }}
                                        className={compactFieldClassName()}
                                        autoComplete="email"
                                        aria-label="Parent email"
                                    />
                                </label>
                                <label className="flex min-w-0 flex-col gap-0.5">
                                    <span className={oppInqEyebrow}>Mobile</span>
                                    <input
                                        type="tel"
                                        value={phone}
                                        disabled={!canMutate || saving}
                                        onChange={(e) => setPhone(e.target.value)}
                                        onBlur={() => {
                                            const next = phone.trim();
                                            const prev = String(record.phone ?? "").trim();
                                            if (next === prev) return;
                                            void saveFields({ phone: next || null });
                                        }}
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
                                                value={preferredContact}
                                                disabled={!canMutate || saving}
                                                onChange={(e) => setPreferredContact(e.target.value)}
                                                onBlur={() => {
                                                    const next = preferredContact.trim();
                                                    const prev = summary.preferred_contact_method ?? "";
                                                    if (next === prev) return;
                                                    void saveFields({
                                                        preferred_contact_method: next || null,
                                                    });
                                                }}
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
                                                value={optOut ? "yes" : "no"}
                                                disabled={!canMutate || saving}
                                                onChange={(e) => {
                                                    const next = e.target.value === "yes";
                                                    setOptOut(next);
                                                    void saveFields({ communication_opt_out: next });
                                                }}
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
                            {phone && !summary.has_preferred_contact_field ? (
                                <p className="text-[10px] text-alloy-midnight/40">
                                    On file: {formatPhoneUS(phone)}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>
                <PersonDrawerParentSummaryBosPanel personId={personId} overviewData={record} />
            </div>
        </section>
    );
}
