"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    validateAddPersonSubmitPayload,
    type AddPersonSubmitPayload,
} from "@/lib/admin/actions/submitAddPersonFromDrawer";
import {
    fetchEntityCreateFormFields,
    PERSON_CREATE_FORM_FALLBACK,
    type EntityCreateFormField,
} from "@/lib/admin/actions/entityCreateFormFieldLoader";
import ConfiguredCreateFormFields from "@/components/admin/opportunity/actions/ConfiguredCreateFormFields";
import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";

const ROLE_OPTIONS = [
    { value: "parent", label: "Parent" },
    { value: "guardian", label: "Guardian" },
    { value: "primary_contact", label: "Primary person" },
    { value: "family_member", label: "Family member" },
    { value: "emergency_contact", label: "Emergency contact" },
    { value: "other", label: "Other" },
] as const;

export type AddPersonModalProps = {
    open: boolean;
    title?: string;
    onClose: () => void;
    onSubmit: (payload: AddPersonSubmitPayload) => Promise<void> | void;
    /** Default role select value when modal opens. */
    defaultRoleType?: string;
};

function buildInitialValues(fields: EntityCreateFormField[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of fields) out[field.field_key] = "";
    return out;
}

export function AddPersonModal(props: AddPersonModalProps) {
    const { open, title = "Add person", onClose, onSubmit, defaultRoleType = "parent" } = props;
    const [formFields, setFormFields] = useState<EntityCreateFormField[]>(PERSON_CREATE_FORM_FALLBACK);
    const [fieldsLoading, setFieldsLoading] = useState(false);
    const [values, setValues] = useState<Record<string, string>>(buildInitialValues(PERSON_CREATE_FORM_FALLBACK));
    const [roleType, setRoleType] = useState<string>(defaultRoleType);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setFieldsLoading(true);
        setError(null);
        setBusy(false);
        setRoleType(defaultRoleType);
        void (async () => {
            try {
                const apiFields = await fetchEntityCreateFormFields("person");
                if (cancelled) return;
                const fields =
                    apiFields.length > 0
                        ? apiFields.filter((f) => f.field_key !== "is_employee" && f.field_key !== "employee_id")
                        : PERSON_CREATE_FORM_FALLBACK;
                setFormFields(fields);
                setValues(buildInitialValues(fields));
            } catch {
                if (!cancelled) {
                    setFormFields(PERSON_CREATE_FORM_FALLBACK);
                    setValues(buildInitialValues(PERSON_CREATE_FORM_FALLBACK));
                }
            } finally {
                if (!cancelled) setFieldsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, defaultRoleType]);

    const roleOptions = useMemo(() => [...ROLE_OPTIONS], []);

    const payload = useMemo(
        (): AddPersonSubmitPayload => ({
            first_name: (values.first_name ?? "").trim(),
            last_name: (values.last_name ?? "").trim(),
            email: (values.email ?? "").trim() || undefined,
            phone: (values.phone ?? "").trim() || undefined,
            role_type: roleType.trim() || undefined,
        }),
        [roleType, values],
    );

    const canSubmit = useMemo(() => {
        if (busy || fieldsLoading) return false;
        if (!payload.first_name || !payload.last_name) return false;
        if (!payload.email && !payload.phone) return false;
        return true;
    }, [busy, fieldsLoading, payload]);

    const onFieldChange = useCallback((fieldKey: string, value: string) => {
        setValues((prev) => ({ ...prev, [fieldKey]: value }));
    }, []);

    return (
        <ActionModalOverlayShell
            open={open}
            onClose={onClose}
            busy={busy}
            panelClassName="w-[92vw] max-w-[520px] overflow-hidden rounded-2xl border border-admin-border bg-white shadow-xl"
            data-testid="add-person-modal"
        >
            <div role="dialog" aria-modal="true" aria-label={title} data-add-person-modal="true">
                <div className="flex items-start justify-between gap-3 border-b border-alloy-stone/15 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                        <div className="mt-0.5 text-[12px] text-alloy-midnight/60">
                            Uses configured person create fields where available.
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="text-xs font-semibold text-alloy-midnight/60 hover:text-alloy-midnight disabled:opacity-50"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                    {fieldsLoading ?
                        <p className="text-sm text-alloy-midnight/60">Loading configured fields…</p>
                    :   null}
                    <ConfiguredCreateFormFields
                        fields={formFields}
                        values={values}
                        onChange={onFieldChange}
                        disabled={busy}
                    />
                    <div>
                        <div className="mb-1 text-[11px] font-semibold tracking-wide text-alloy-forge/50">Role</div>
                        <select
                            value={roleType}
                            disabled={busy}
                            onChange={(e) => setRoleType(e.target.value)}
                            className="w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-[rgba(0,162,131,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(0,162,131,0.12)] disabled:opacity-60"
                        >
                            {roleOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <p className="text-[11px] text-alloy-midnight/55">Phone or email is required.</p>
                    {error ?
                        <div className="rounded-lg border border-alloy-ember/30 bg-alloy-ember/5 px-3 py-2 text-sm text-alloy-ember">
                            {error}
                        </div>
                    :   null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-alloy-stone/15 px-5 py-4">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-2 text-sm font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/5 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        data-add-person-submit="true"
                        onClick={async () => {
                            const validationError = validateAddPersonSubmitPayload(payload);
                            if (validationError) {
                                setError(validationError);
                                return;
                            }
                            setBusy(true);
                            setError(null);
                            try {
                                await onSubmit(payload);
                                onClose();
                            } catch (e) {
                                setError(e instanceof Error ? e.message : "Save failed");
                            } finally {
                                setBusy(false);
                            }
                        }}
                        className="rounded-lg border border-alloy-blue/30 bg-alloy-blue px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                        {busy ? "Saving…" : "Add person"}
                    </button>
                </div>
            </div>
        </ActionModalOverlayShell>
    );
}
