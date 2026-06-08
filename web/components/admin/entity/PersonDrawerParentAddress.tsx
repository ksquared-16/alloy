"use client";

import { useCallback, useEffect, useState } from "react";
import {
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqLeadSummaryShellClassName,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { personDrawerParentChromeActive } from "@/lib/admin/person/personDrawerParentChrome";
import type { PersonDrawerParentChromeHint } from "@/lib/admin/person/personDrawerParentChrome";
import {
    resolvePersonDrawerParentAddressFields,
    type PersonDrawerParentAddressField,
} from "@/lib/admin/person/personDrawerParentAddressFields";
import { patchPersonDrawerFields } from "@/lib/admin/person/patchPersonDrawerFields";

function compactFieldClassName(): string {
    return `${oppInqFieldInput} !py-1 !text-[13px]`;
}

/** Parent/guardian mailing address — field_definitions driven, PATCH via persons API. */
export default function PersonDrawerParentAddress({
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

    const fields = resolvePersonDrawerParentAddressFields(record);
    if (fields.length === 0) {
        return null;
    }

    const personId = String(record.id ?? "").trim();
    const [values, setValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(fields.map((f) => [f.key, String(record[f.key] ?? "").trim()]))
    );
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const nextFields = resolvePersonDrawerParentAddressFields(record);
        setValues(Object.fromEntries(nextFields.map((f) => [f.key, String(record[f.key] ?? "").trim()])));
    }, [record]);

    const saveField = useCallback(
        async (field: PersonDrawerParentAddressField, next: string) => {
            if (!personId || !canMutate) return;
            const prev = String(record[field.key] ?? "").trim();
            if (next === prev) return;
            setSaving(true);
            try {
                const patch = { [field.key]: next || null };
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
            data-person-drawer-parent-address="true"
            aria-label="Address"
        >
            <p className={`${oppInqEyebrow} px-0.5`}>Address</p>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 px-0.5 pb-1 sm:grid-cols-2">
                {fields.map((field) => (
                    <label key={field.key} className="flex min-w-0 flex-col gap-0.5 sm:col-span-2">
                        <span className={oppInqEyebrow}>{field.label}</span>
                        <input
                            type="text"
                            value={values[field.key] ?? ""}
                            disabled={!canMutate || saving}
                            onChange={(e) =>
                                setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            onBlur={() => {
                                void saveField(field, (values[field.key] ?? "").trim());
                            }}
                            className={compactFieldClassName()}
                            autoComplete={
                                field.key === "postal_code"
                                    ? "postal-code"
                                    : field.key === "city"
                                      ? "address-level2"
                                      : field.key === "state"
                                        ? "address-level1"
                                        : "street-address"
                            }
                            aria-label={field.label}
                        />
                    </label>
                ))}
            </div>
        </section>
    );
}
