"use client";

import { useCallback, useMemo } from "react";
import SelectFieldControl from "@/components/admin/fields/SelectFieldControl";
import { useInquiryChildPlacementCascade } from "@/lib/admin/hooks/useInquiryChildPlacementCascade";
import { useOptionSetSelectOptions } from "@/lib/admin/hooks/useOptionSetSelectOptions";
import { commitRecordToPayloadValues } from "@/lib/admin/actions/createLead/household/commitRecordFieldMapping";
import type { CreateLeadHouseholdCardEditField } from "@/lib/admin/actions/createLead/household/resolveCreateLeadHouseholdCardEditFields";
import type { CreateLeadCommitEntityType, CreateLeadCommitRecord } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { CREATE_LEAD_DERIVED_FIELD_BINDINGS, resolveDerivedFieldDisplay } from "@/lib/fields/derived/resolveDerivedFieldDisplay";
import { formatIsoDateForDisplay } from "@/lib/intake/normalize/date";

const LABEL = "text-[11px] font-medium text-alloy-midnight/70";
const INPUT =
    "w-full rounded-md border border-alloy-stone/12 bg-white px-2 py-1 text-[12px] text-alloy-midnight focus:border-[#00A283]/35 focus:outline-none focus:ring-1 focus:ring-[#00A283]/10";

type Props = {
    entityType: CreateLeadCommitEntityType;
    record: CreateLeadCommitRecord;
    requiredFields: readonly CreateLeadHouseholdCardEditField[];
    additionalFields?: readonly CreateLeadHouseholdCardEditField[];
    draft: Record<string, string>;
    onDraftChange: (next: Record<string, string>) => void;
    contextValues: Record<string, string>;
    dataTestIdPrefix: string;
};

function inputTypeForField(field: CreateLeadHouseholdCardEditField): string {
    if (field.value_kind === "email") return "email";
    if (field.value_kind === "phone") return "tel";
    if (field.value_kind === "date") return "date";
    return "text";
}

function CardFieldList({
    fields,
    entityType,
    record,
    draft,
    onDraftChange,
    contextValues,
    dataTestIdPrefix,
    optionsBySetKey,
    cascade,
}: {
    fields: readonly CreateLeadHouseholdCardEditField[];
    entityType: CreateLeadCommitEntityType;
    record: CreateLeadCommitRecord;
    draft: Record<string, string>;
    onDraftChange: (next: Record<string, string>) => void;
    contextValues: Record<string, string>;
    dataTestIdPrefix: string;
    optionsBySetKey: Record<string, Array<{ value: string; label: string }>>;
    cascade: ReturnType<typeof useInquiryChildPlacementCascade>;
}) {
    const setPayloadValue = useCallback(
        (payloadKey: string, value: string) => {
            onDraftChange({ ...draft, [payloadKey]: value });
        },
        [draft, onDraftChange],
    );

    return (
        <>
            {fields.map((field) => {
                if (field.derived) {
                    const derivedValues = commitRecordToPayloadValues(
                        entityType,
                        {
                            ...record,
                            dob: draft.child_date_of_birth?.trim() || record.dob,
                            program_interest: draft.child_program?.trim() || record.program_interest,
                            extra_payload_values: {
                                ...(record.extra_payload_values ?? {}),
                                ...draft,
                            },
                        },
                        contextValues,
                    );
                    const derivedDisplay = resolveDerivedFieldDisplay({
                        target_key: field.payload_key,
                        values: derivedValues,
                        bindings: CREATE_LEAD_DERIVED_FIELD_BINDINGS,
                    });
                    return (
                        <div
                            key={field.payload_key}
                            data-testid={`${dataTestIdPrefix}-derived-${field.payload_key}`}
                        >
                            <p className={LABEL}>{field.field_label}</p>
                            <p className="mt-0.5 rounded-md border border-alloy-stone/10 bg-alloy-stone/5 px-2 py-1 text-[12px] text-alloy-midnight">
                                {derivedDisplay?.display ?? "—"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-alloy-midnight/45">Calculated from date of birth</p>
                        </div>
                    );
                }

                const value = draft[field.payload_key] ?? "";
                const testId = `${dataTestIdPrefix}-${field.payload_key.replace(/_/g, "-")}`;

                if (field.value_kind === "select" || field.placement_select) {
                    let selectOptions: Array<{ value: string; label: string }> = [];
                    let disabled = false;
                    let placeholder = "Select…";

                    if (field.placement_select === "site") {
                        selectOptions = cascade.siteOptions;
                        placeholder = "Select a school";
                    } else if (field.placement_select === "site_program") {
                        selectOptions = cascade.programOptions;
                        disabled = cascade.programDisabled;
                        placeholder = cascade.programDisabled ? "Select a school first" : "Select a program";
                    } else if (field.placement_select === "site_room") {
                        selectOptions = cascade.roomOptions;
                        disabled = cascade.roomDisabled;
                        placeholder = cascade.roomDisabled ? "Select a school first" : "Select a room";
                    } else if (field.option_set_key) {
                        selectOptions = optionsBySetKey[field.option_set_key] ?? [];
                    }

                    return (
                        <label key={field.payload_key} className="block" data-testid={testId}>
                            <span className={LABEL}>
                                {field.field_label}
                                {field.tier === "required" ?
                                    <span className="text-alloy-ember"> *</span>
                                :   null}
                            </span>
                            <SelectFieldControl
                                value={value}
                                onChange={(next) => setPayloadValue(field.payload_key, next)}
                                options={selectOptions}
                                disabled={disabled}
                                placeholder={placeholder}
                                className={`${INPUT} mt-0.5`}
                                data-testid={`${testId}-control`}
                            />
                        </label>
                    );
                }

                if (field.multiline) {
                    return (
                        <label key={field.payload_key} className="block" data-testid={testId}>
                            <span className={LABEL}>{field.field_label}</span>
                            <textarea
                                value={value}
                                onChange={(e) => setPayloadValue(field.payload_key, e.target.value)}
                                rows={3}
                                className={`${INPUT} mt-0.5 resize-y`}
                            />
                        </label>
                    );
                }

                return (
                    <label key={field.payload_key} className="block" data-testid={testId}>
                        <span className={LABEL}>
                            {field.field_label}
                            {field.tier === "required" ?
                                <span className="text-alloy-ember"> *</span>
                            :   null}
                            {field.value_kind === "date" && value ?
                                <span
                                    className="ml-1 font-normal text-alloy-midnight/45"
                                    data-testid={`${testId}-display-format`}
                                >
                                    ({formatIsoDateForDisplay(value)})
                                </span>
                            :   null}
                        </span>
                        <input
                            type={inputTypeForField(field)}
                            value={value}
                            onChange={(e) => setPayloadValue(field.payload_key, e.target.value)}
                            className={`${INPUT} mt-0.5`}
                            data-testid={`${testId}-control`}
                        />
                    </label>
                );
            })}
        </>
    );
}

/** Compact spec-driven field editor for Create Lead household commit cards. */
export function CreateLeadHouseholdCardEditFields({
    entityType,
    record,
    requiredFields,
    additionalFields = [],
    draft,
    onDraftChange,
    contextValues,
    dataTestIdPrefix,
}: Props) {
    const allFields = useMemo(() => [...requiredFields, ...additionalFields], [requiredFields, additionalFields]);
    const { optionsBySetKey } = useOptionSetSelectOptions(allFields.map((field) => field.option_set_key));
    const cascade = useInquiryChildPlacementCascade({
        locationValue: (contextValues.location_id ?? "").trim(),
        programValue: (draft.child_program ?? "").trim(),
    });

    return (
        <div className="space-y-1.5">
            <CardFieldList
                fields={requiredFields}
                entityType={entityType}
                record={record}
                draft={draft}
                onDraftChange={onDraftChange}
                contextValues={contextValues}
                dataTestIdPrefix={dataTestIdPrefix}
                optionsBySetKey={optionsBySetKey}
                cascade={cascade}
            />
            {additionalFields.length > 0 ?
                <details className="rounded-md border border-alloy-stone/10 bg-alloy-stone/5 px-2 py-1.5" data-testid={`${dataTestIdPrefix}-additional-fields`}>
                    <summary className="cursor-pointer text-[11px] font-semibold text-alloy-midnight/60">
                        Additional fields
                    </summary>
                    <div className="mt-2 space-y-1.5">
                        <CardFieldList
                            fields={additionalFields}
                            entityType={entityType}
                            record={record}
                            draft={draft}
                            onDraftChange={onDraftChange}
                            contextValues={contextValues}
                            dataTestIdPrefix={`${dataTestIdPrefix}-additional`}
                            optionsBySetKey={optionsBySetKey}
                            cascade={cascade}
                        />
                    </div>
                </details>
            :   null}
        </div>
    );
}
