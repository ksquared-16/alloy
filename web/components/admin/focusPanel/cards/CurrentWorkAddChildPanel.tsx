/**
 * Current Work — Add Child centered command surface.
 *
 * Collect child identity → preview → confirm → existing submitAddInquiryChildFromDrawer.
 * Does not lead with the relationship wizard identity mode chips.
 * Identity duplicates surface as exceptions through the existing submit path.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConfiguredCreateFormFields from "@/components/admin/opportunity/actions/ConfiguredCreateFormFields";
import {
    CHILD_IDENTITY_CREATE_FORM_FALLBACK,
    fetchEntityCreateFormFields,
    mergeInquiryChildCreateFormFields,
    type EntityCreateFormField,
} from "@/lib/admin/actions/entityCreateFormFieldLoader";
import {
    submitAddInquiryChildFromDrawer,
    validateAddInquiryChildSubmitPayload,
    type AddInquiryChildSubmitPayload,
} from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";
import { dispatchOpportunityDrawerScopedUpdate } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";

type Props = {
    action: CurrentWorkActionVM;
    opportunityId: string;
    defaultLocationId?: string | null;
    onClose: () => void;
    onComplete: () => void;
};

type Stage = "input" | "preview" | "success";

function mapValuesToPayload(values: Record<string, string>): AddInquiryChildSubmitPayload {
    return {
        first_name: (values.first_name ?? "").trim(),
        last_name: (values.last_name ?? "").trim(),
        date_of_birth: (values.date_of_birth ?? values.dob ?? "").trim() || null,
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
        out[field.field_key] =
            field.field_key === "location_id" && inheritedLocation ? inheritedLocation : "";
    }
    return out;
}

export default function CurrentWorkAddChildPanel({
    action,
    opportunityId,
    defaultLocationId = null,
    onClose,
    onComplete,
}: Props) {
    const [stage, setStage] = useState<Stage>("input");
    const [identityFields, setIdentityFields] = useState<EntityCreateFormField[]>(
        CHILD_IDENTITY_CREATE_FORM_FALLBACK,
    );
    const [participationFields, setParticipationFields] = useState<EntityCreateFormField[]>([]);
    const [fieldsLoading, setFieldsLoading] = useState(true);
    const [values, setValues] = useState<Record<string, string>>({});
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submitLock = useRef(false);

    const allFields = useMemo(
        () => [...identityFields, ...participationFields],
        [identityFields, participationFields],
    );
    const payload = useMemo(() => mapValuesToPayload(values), [values]);

    useEffect(() => {
        let cancelled = false;
        setFieldsLoading(true);
        void (async () => {
            try {
                const [memberFields, inquiryFields, oppRes] = await Promise.all([
                    fetchEntityCreateFormFields("customer_member").catch(() => []),
                    fetchEntityCreateFormFields("inquiry_child").catch(() => []),
                    fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}`, {
                        credentials: "include",
                    }).catch(() => null),
                ]);
                if (cancelled) return;
                if (oppRes?.ok) {
                    const json = (await oppRes.json().catch(() => ({}))) as {
                        data?: { customer_id?: string | null; location_id?: string | null };
                        customer_id?: string | null;
                    };
                    const cid = String(json.data?.customer_id ?? json.customer_id ?? "").trim();
                    if (cid) setCustomerId(cid);
                }
                const identity =
                    memberFields.filter((f) =>
                        ["first_name", "last_name", "date_of_birth", "dob"].includes(f.field_key),
                    ).length > 0
                        ? memberFields.filter((f) =>
                              ["first_name", "last_name", "date_of_birth", "dob", "age_group", "gender"].includes(
                                  f.field_key,
                              ),
                          )
                        : CHILD_IDENTITY_CREATE_FORM_FALLBACK;
                const participation = mergeInquiryChildCreateFormFields(inquiryFields).filter(
                    (f) => !["outcome_status_key", "notes"].includes(f.field_key),
                );
                setIdentityFields(identity);
                setParticipationFields(participation);
                setValues(buildInitialValues([...identity, ...participation], defaultLocationId));
            } catch {
                if (!cancelled) {
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
    }, [opportunityId, defaultLocationId]);

    const onFieldChange = useCallback((fieldKey: string, value: string) => {
        setValues((prev) => ({ ...prev, [fieldKey]: value }));
    }, []);

    const continueToPreview = () => {
        setError(null);
        const err = validateAddInquiryChildSubmitPayload(payload);
        if (err) {
            setError(err);
            return;
        }
        setStage("preview");
    };

    const confirmAdd = async () => {
        if (submitLock.current) return;
        const err = validateAddInquiryChildSubmitPayload(payload);
        if (err) {
            setError(err);
            return;
        }
        if (!customerId) {
            setError("This family has no household yet. Refresh and try again.");
            return;
        }
        submitLock.current = true;
        setBusy(true);
        setError(null);
        try {
            await submitAddInquiryChildFromDrawer({
                opportunityId,
                customerId,
                payload,
                opportunityLocationId: defaultLocationId,
            });
            dispatchOpportunityDrawerScopedUpdate(opportunityId, "add_child", [
                "activity",
                "header_actions",
                "children",
            ]);
            setStage("success");
            setBusy(false);
            window.setTimeout(() => onComplete(), 700);
        } catch (e) {
            setBusy(false);
            submitLock.current = false;
            setError(e instanceof Error ? e.message : "Could not add child.");
        }
    };

    return (
        <aside
            className="alloy-os-currentwork__action-panel"
            data-work-action-panel="true"
            data-work-action-panel-key={action.key}
            data-work-action-surface="inline_form"
            data-testid="current-work-add-child"
            aria-label={action.label}
        >
            <div className="alloy-os-currentwork__action-panel-header">
                <div>
                    <p className="alloy-os-currentwork__action-panel-eyebrow">Helpful action</p>
                    <h3 className="alloy-os-currentwork__action-panel-title">{action.label}</h3>
                    <p className="alloy-os-currentwork__action-panel-desc">
                        Add a child to this family. Primary contact stays on the household.
                    </p>
                </div>
                <button
                    type="button"
                    className="alloy-os-currentwork__action-panel-close"
                    onClick={onClose}
                    disabled={busy}
                    aria-label="Close action panel"
                >
                    Close
                </button>
            </div>

            {stage === "success" ?
                <div className="alloy-os-currentwork__action-panel-body" data-command-surface-section="success">
                    <p className="text-sm font-medium text-alloy-midnight">Child added to this family.</p>
                    <p className="text-xs text-alloy-midnight/60">Updating Children and What's Next…</p>
                </div>
            : stage === "preview" ?
                <div
                    className="alloy-os-currentwork__action-panel-body space-y-3"
                    data-command-surface-section="preview"
                >
                    <p className="text-sm font-medium text-alloy-midnight">Review</p>
                    <ul className="space-y-1 text-sm text-alloy-midnight/80">
                        <li>
                            Name:{" "}
                            <span className="font-semibold text-alloy-midnight">
                                {payload.first_name} {payload.last_name}
                            </span>
                        </li>
                        {payload.date_of_birth ?
                            <li>Date of birth: {payload.date_of_birth}</li>
                        :   null}
                        {payload.age_group ? <li>Age group: {payload.age_group}</li> : null}
                    </ul>
                    {error ?
                        <p className="text-sm text-red-700" role="alert">
                            {error}
                        </p>
                    :   null}
                    <div className="flex items-center justify-end gap-2 pt-1" data-command-surface-footer>
                        <button
                            type="button"
                            className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/70 hover:bg-alloy-midnight/5"
                            onClick={() => {
                                setError(null);
                                setStage("input");
                            }}
                            disabled={busy}
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={busy}
                            data-command-surface-primary
                            data-testid="current-work-add-child-confirm"
                            onClick={() => void confirmAdd()}
                        >
                            {busy ? "Saving…" : "Add Child"}
                        </button>
                    </div>
                </div>
            :   <div
                    className="alloy-os-currentwork__action-panel-body space-y-3"
                    data-command-surface-section="input_fields"
                >
                    {fieldsLoading ?
                        <p className="text-sm text-alloy-midnight/70">Loading child fields…</p>
                    :   null}
                    {!fieldsLoading && identityFields.length > 0 ?
                        <ConfiguredCreateFormFields
                            fields={identityFields}
                            values={values}
                            onChange={onFieldChange}
                            disabled={busy}
                            inheritedLocationId={defaultLocationId}
                        />
                    :   null}
                    {!fieldsLoading && participationFields.length > 0 ?
                        <ConfiguredCreateFormFields
                            fields={participationFields}
                            values={values}
                            onChange={onFieldChange}
                            disabled={busy}
                            inheritedLocationId={defaultLocationId}
                        />
                    :   null}
                    {error ?
                        <p className="text-sm text-red-700" role="alert">
                            {error}
                        </p>
                    :   null}
                    <div className="flex items-center justify-end gap-2 pt-1" data-command-surface-footer>
                        <button
                            type="button"
                            className="rounded-md px-3 py-1.5 text-sm text-alloy-midnight/70 hover:bg-alloy-midnight/5"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                            disabled={busy || fieldsLoading || !payload.first_name || !payload.last_name}
                            data-command-surface-primary
                            data-testid="current-work-add-child-continue"
                            onClick={continueToPreview}
                        >
                            Continue
                        </button>
                    </div>
                    {/* Keep fields referenced for a11y / future gender display */}
                    <span className="sr-only">{allFields.length} fields</span>
                </div>
            }
        </aside>
    );
}
