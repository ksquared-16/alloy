"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AddInquiryChildSubmitPayload } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";
import { validateAddInquiryChildSubmitPayload } from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";
import {
    CHILD_IDENTITY_CREATE_FORM_FALLBACK,
    fetchEntityCreateFormFields,
    mergeInquiryChildCreateFormFields,
    type EntityCreateFormField,
} from "@/lib/admin/actions/entityCreateFormFieldLoader";
import {
    BOS_EXECUTION_LOADER_PHASES_ADD_CHILD,
    BosExecutionLoader,
} from "@/components/admin/actions/BosExecutionLoader";
import ConfiguredCreateFormFields from "@/components/admin/opportunity/actions/ConfiguredCreateFormFields";
import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";

export type AddInquiryChildModalProps = {
    open: boolean;
    mode: "child" | "sibling";
    /** Lead location inherited for child enrollment cascade when form omits location_id. */
    defaultLocationId?: string | null;
    onClose: () => void;
    onSubmit: (payload: AddInquiryChildSubmitPayload) => Promise<void> | void;
};

function mapValuesToPayload(values: Record<string, string>): AddInquiryChildSubmitPayload {
    return {
        first_name: (values.first_name ?? "").trim(),
        last_name: (values.last_name ?? "").trim(),
        date_of_birth: (values.date_of_birth ?? "").trim() || null,
        program_category_id: (values.program_category_id ?? values.program ?? "").trim() || null,
        location_id: (values.location_id ?? "").trim() || null,
        program_room_cohort_key: (values.program_room_cohort_key ?? "").trim() || null,
        age_group: (values.age_group ?? "").trim() || null,
        schedule_type: (values.schedule_type ?? "").trim() || null,
        start_date: (values.start_date ?? "").trim() || null,
    };
}

function buildInitialValues(
    fields: EntityCreateFormField[],
    defaultLocationId?: string | null,
): Record<string, string> {
    const out: Record<string, string> = {};
    const inheritedLocation = (defaultLocationId ?? "").trim();
    for (const field of fields) {
        if (field.field_key === "location_id" && inheritedLocation) {
            out[field.field_key] = inheritedLocation;
        } else {
            out[field.field_key] = "";
        }
    }
    return out;
}

export function AddInquiryChildModal(props: AddInquiryChildModalProps) {
    const { open, mode, defaultLocationId, onClose, onSubmit } = props;
    const [identityFields, setIdentityFields] = useState<EntityCreateFormField[]>(CHILD_IDENTITY_CREATE_FORM_FALLBACK);
    const [participationFields, setParticipationFields] = useState<EntityCreateFormField[]>([]);
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const [fieldsError, setFieldsError] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const allFields = useMemo(
        () => [...identityFields, ...participationFields],
        [identityFields, participationFields],
    );

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setFieldsLoading(true);
        setFieldsError(null);
        setError(null);
        setSubmitting(false);
        void (async () => {
            try {
                const [memberFields, inquiryFields] = await Promise.all([
                    fetchEntityCreateFormFields("customer_member").catch(() => []),
                    fetchEntityCreateFormFields("inquiry_child").catch(() => []),
                ]);
                if (cancelled) return;
                const identity =
                    memberFields.filter((f) =>
                        ["first_name", "last_name", "date_of_birth", "dob"].includes(f.field_key),
                    ).length > 0
                        ? memberFields.filter((f) =>
                              ["first_name", "last_name", "date_of_birth", "dob", "age_group"].includes(f.field_key),
                          )
                        : CHILD_IDENTITY_CREATE_FORM_FALLBACK;
                const participation = mergeInquiryChildCreateFormFields(inquiryFields).filter(
                    (f) => !["outcome_status_key", "notes"].includes(f.field_key),
                );
                setIdentityFields(identity);
                setParticipationFields(participation);
                setValues(buildInitialValues([...identity, ...participation], defaultLocationId));
            } catch (e) {
                if (!cancelled) {
                    setFieldsError((e as Error).message);
                    setIdentityFields(CHILD_IDENTITY_CREATE_FORM_FALLBACK);
                    setParticipationFields(mergeInquiryChildCreateFormFields([]));
                    setValues(
                        buildInitialValues(
                            [...CHILD_IDENTITY_CREATE_FORM_FALLBACK, ...mergeInquiryChildCreateFormFields([])],
                            defaultLocationId,
                        ),
                    );
                }
            } finally {
                if (!cancelled) setFieldsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, mode, defaultLocationId]);

    const payload = useMemo(() => mapValuesToPayload(values), [values]);

    const validationError = useMemo(() => {
        if (!payload.first_name.trim() || !payload.last_name.trim()) return null;
        return validateAddInquiryChildSubmitPayload(payload);
    }, [payload]);

    const canSubmit = useMemo(
        () =>
            Boolean(payload.first_name.trim() && payload.last_name.trim() && !validationError && !submitting && !fieldsLoading),
        [payload.first_name, payload.last_name, validationError, submitting, fieldsLoading],
    );

    const onFieldChange = useCallback((fieldKey: string, value: string) => {
        setValues((prev) => ({ ...prev, [fieldKey]: value }));
    }, []);

    const title = mode === "sibling" ? "Add sibling" : "Add child";

    return (
        <ActionModalOverlayShell open={open} onClose={onClose} busy={submitting} data-testid="add-inquiry-child-modal">
            <div data-add-inquiry-child-modal="true" data-add-inquiry-child-mode={mode}>
                <div className="border-b border-alloy-stone/15 px-5 py-4">
                    <div className="text-base font-semibold text-alloy-midnight">{title}</div>
                    <div className="mt-0.5 text-sm text-alloy-midnight/65">
                        Uses configured child and inquiry participation fields where available.
                    </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {submitting ?
                        <BosExecutionLoader
                            variant="panel"
                            title={mode === "sibling" ? "Adding sibling…" : "Adding child…"}
                            subtitle="Saving child record and inquiry participation."
                            steps={BOS_EXECUTION_LOADER_PHASES_ADD_CHILD}
                            data-testid="add-inquiry-child-execute-loader"
                        />
                    : null}
                    {!submitting && fieldsLoading ?
                        <p className="text-sm text-alloy-midnight/60">Loading configured fields…</p>
                    :   null}
                    {fieldsError ?
                        <p className="text-sm text-alloy-midnight/55">{fieldsError}</p>
                    :   null}
                    {!submitting && identityFields.length > 0 ?
                        <div>
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                Child identity
                            </div>
                            <ConfiguredCreateFormFields
                                fields={identityFields}
                                values={values}
                                onChange={onFieldChange}
                                disabled={submitting}
                                inheritedLocationId={defaultLocationId}
                            />
                        </div>
                    :   null}
                    {!submitting && participationFields.length > 0 ?
                        <div>
                            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                                Inquiry participation
                            </div>
                            <ConfiguredCreateFormFields
                                fields={participationFields}
                                values={values}
                                onChange={onFieldChange}
                                disabled={submitting}
                                inheritedLocationId={defaultLocationId}
                            />
                        </div>
                    :   null}
                    {validationError ?
                        <p className="text-sm text-alloy-ember">{validationError}</p>
                    :   null}
                    {error ?
                        <p className="text-sm text-alloy-ember">{error}</p>
                    :   null}
                </div>

                <div className="flex justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <button
                        type="button"
                        className="rounded-lg border border-alloy-stone/25 px-3 py-2 text-sm font-semibold text-alloy-midnight hover:bg-alloy-stone/10"
                        disabled={submitting}
                        onClick={onClose}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-bend-pine px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={!canSubmit}
                        data-add-inquiry-child-submit="true"
                        onClick={async () => {
                            setError(null);
                            const err = validateAddInquiryChildSubmitPayload(payload);
                            if (err) {
                                setError(err);
                                return;
                            }
                            setSubmitting(true);
                            try {
                                await onSubmit(payload);
                            } catch (e) {
                                setError((e as Error).message);
                            } finally {
                                setSubmitting(false);
                            }
                        }}
                    >
                        {submitting ? "Saving…" : "Add child"}
                    </button>
                </div>
            </div>
        </ActionModalOverlayShell>
    );
}
