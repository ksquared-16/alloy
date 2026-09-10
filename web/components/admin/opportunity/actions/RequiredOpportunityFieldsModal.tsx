"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ConfiguredCreateFormFields from "@/components/admin/opportunity/actions/ConfiguredCreateFormFields";
import { ActionModalOverlayShell } from "@/components/admin/opportunity/actions/ActionModalOverlayShell";
import {
    fetchEntityCreateFormFields,
    type EntityCreateFormField,
} from "@/lib/admin/actions/entityCreateFormFieldLoader";
import { FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW } from "@/lib/fields/fieldPlacementV1";
import { fieldPolicyWriteSurfaceHeader } from "@/lib/fields/fieldPolicyWriteContext";

/**
 * Collect required opportunity fields the operator has no other way to set.
 *
 * This is not a record editor and must not become one. It renders exactly the fields it is asked
 * for — the ones readiness reported as missing — using the configured field definition for each, so
 * a select stays a select bound to its option set and a label stays the admin's label. Nothing here
 * is specific to any one field; adding another required scalar needs no code.
 *
 * It saves declaring `drawer_overview`, because that is the surface the requirement was authored
 * against: this IS the operator answering that requirement, so the write is in its scope and is
 * validated by it. A save that dodged the rule it exists to satisfy would be theatre.
 */

type Props = {
    open: boolean;
    opportunityId: string;
    fieldKeys: string[];
    onClose: () => void;
    onSaved?: () => void;
};

export default function RequiredOpportunityFieldsModal({
    open,
    opportunityId,
    fieldKeys,
    onClose,
    onSaved,
}: Props) {
    const [catalog, setCatalog] = useState<EntityCreateFormField[]>([]);
    const [values, setValues] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const wanted = useMemo(() => fieldKeys.map((k) => k.trim()).filter(Boolean), [fieldKeys]);

    useEffect(() => {
        if (!open || wanted.length === 0) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        void fetchEntityCreateFormFields("opportunity")
            .then((fields) => {
                if (cancelled) return;
                const byKey = new Map(fields.map((f) => [f.field_key, f]));
                // Preserve the order readiness asked for — that is the order the operator was shown.
                setCatalog(wanted.map((k) => byKey.get(k)).filter((f): f is EntityCreateFormField => !!f));
            })
            .catch((e: unknown) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Could not load fields.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [open, wanted]);

    useEffect(() => {
        if (!open) {
            setValues({});
            setError(null);
        }
    }, [open]);

    const onChange = useCallback((fieldKey: string, value: string) => {
        setValues((prev) => ({ ...prev, [fieldKey]: value }));
    }, []);

    const missing = catalog.filter((f) => !(values[f.field_key] ?? "").trim());

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        try {
            const body: Record<string, unknown> = {};
            for (const field of catalog) {
                const v = (values[field.field_key] ?? "").trim();
                if (v) body[field.field_key] = v;
            }
            if (Object.keys(body).length === 0) {
                setError("Enter a value before saving.");
                return;
            }
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}`, {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...fieldPolicyWriteSurfaceHeader(FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW),
                },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as {
                error?: string;
                violations?: Array<{ field_key: string; message: string }>;
            };
            if (!res.ok) {
                // Show what the gate actually said, per field, rather than a generic failure.
                setError(json.violations?.map((v) => v.message).join(" ") ?? json.error ?? "Save failed.");
                return;
            }
            onSaved?.();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed.");
        } finally {
            setSaving(false);
        }
    }, [catalog, onClose, onSaved, opportunityId, values]);

    if (!open) return null;

    return (
        <ActionModalOverlayShell
            open={open}
            onClose={onClose}
            busy={saving}
            data-testid="required-opportunity-fields-modal"
        >
            <div className="px-5 py-4" data-required-fields-modal="true">
                <h2 className="text-sm font-semibold text-alloy-midnight">Add required information</h2>
                <p className="mt-1 text-xs leading-snug text-alloy-midnight/60">
                    {catalog.length === 1
                        ? "This lead needs one more detail before it can be saved."
                        : "This lead needs a few more details before it can be saved."}
                </p>

                {loading ? (
                    <p className="mt-4 text-xs text-alloy-midnight/55">Loading…</p>
                ) : catalog.length === 0 ? (
                    <p className="mt-4 text-xs text-alloy-midnight/55" data-required-fields-empty="true">
                        These fields are not configured as editable here. Ask an administrator to place them on
                        the lead layout.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        <ConfiguredCreateFormFields
                            fields={catalog}
                            values={values}
                            onChange={onChange}
                            disabled={saving}
                            dataPrefix="required-opportunity-field"
                        />
                    </div>
                )}

                {error ? (
                    <p className="mt-3 text-xs text-alloy-ember" role="alert" data-required-fields-error="true">
                        {error}
                    </p>
                ) : null}

                <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-midnight/60 hover:text-alloy-midnight"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                        onClick={() => void save()}
                        disabled={saving || loading || catalog.length === 0 || missing.length === catalog.length}
                        data-required-fields-save="true"
                    >
                        {saving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>
        </ActionModalOverlayShell>
    );
}
