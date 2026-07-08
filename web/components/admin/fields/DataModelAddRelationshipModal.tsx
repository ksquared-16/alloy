"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";

type RelationshipKind = "family_role" | "person_relationship";

type Props = {
    open: boolean;
    hubEntity: SettingsHubEntityKey;
    onClose: () => void;
    onCreated?: () => void;
};

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function slugifyKey(label: string): string {
    return label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 64);
}

function defaultKindForEntity(hubEntity: SettingsHubEntityKey): RelationshipKind {
    if (hubEntity === "person") return "person_relationship";
    return "family_role";
}

/**
 * In-workspace relationship vocabulary create modal.
 * Persists via existing Settings → Relationships APIs (no navigation away).
 */
export default function DataModelAddRelationshipModal({ open, hubEntity, onClose, onCreated }: Props) {
    const { canMutate } = useAdminAuth();
    const [kind, setKind] = useState<RelationshipKind>(() => defaultKindForEntity(hubEntity));
    const [label, setLabel] = useState("");
    const [key, setKey] = useState("");
    const [keyTouched, setKeyTouched] = useState(false);
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setKind(defaultKindForEntity(hubEntity));
        setLabel("");
        setKey("");
        setKeyTouched(false);
        setDescription("");
        setError(null);
    }, [open, hubEntity]);

    useEffect(() => {
        if (!open || keyTouched) return;
        setKey(slugifyKey(label));
    }, [label, keyTouched, open]);

    const endpoint = useMemo(
        () =>
            kind === "family_role"
                ? "/api/admin/customer-person-role-types"
                : "/api/admin/person-relationship-type-settings",
        [kind],
    );

    if (!open) return null;

    const save = async () => {
        if (!canMutate) return;
        const normalizedKey = key.trim().toLowerCase();
        if (!label.trim()) {
            setError("Label is required.");
            return;
        }
        if (!KEY_REGEX.test(normalizedKey)) {
            setError("Key must be 2–64 characters: lowercase letters, numbers, underscores only.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: normalizedKey,
                    label: label.trim(),
                    description: description.trim() || null,
                    sort_order: 100,
                    is_active: true,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 409) {
                setError(
                    (json as { error?: { message?: string } | string }).error &&
                        typeof (json as { error?: unknown }).error === "object"
                        ? ((json as { error: { message?: string } }).error.message ?? "Key already exists.")
                        : "Key already exists.",
                );
                return;
            }
            if (!res.ok) {
                const err = (json as { error?: { message?: string } | string }).error;
                const message =
                    typeof err === "string" ? err : err && typeof err === "object" ? err.message : undefined;
                throw new Error(message ?? "Could not create relationship type.");
            }
            onCreated?.();
            onClose();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/40 p-4"
            role="presentation"
            onClick={() => !saving && onClose()}
            data-testid="add-relationship-modal-backdrop"
        >
            <div
                className="w-full max-w-md rounded-xl border border-alloy-forge/14 bg-white p-5 shadow-lg"
                role="dialog"
                aria-modal
                aria-labelledby="add-relationship-title"
                data-testid="add-relationship-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="add-relationship-title" className="text-lg font-semibold text-alloy-midnight">
                    Add Relationship
                </h3>
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">
                    Creates vocabulary used across drawers, forms, and family membership — without leaving Data Model.
                </p>

                <div className="mt-4 space-y-3">
                    <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-alloy-midnight/60">Relationship type</span>
                        <select
                            value={kind}
                            onChange={(e) => setKind(e.target.value as RelationshipKind)}
                            className="w-full rounded-md border border-alloy-forge/15 px-2.5 py-1.5 text-sm text-alloy-midnight"
                            data-testid="add-relationship-kind"
                        >
                            <option value="family_role">Family role (customer ↔ person)</option>
                            <option value="person_relationship">Person relationship (person ↔ person)</option>
                        </select>
                    </label>

                    <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-alloy-midnight/60">Label</span>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={kind === "family_role" ? "e.g. Authorized Pickup" : "e.g. Grandparent"}
                            className="w-full rounded-md border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                            data-testid="add-relationship-label"
                        />
                    </label>

                    <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-alloy-midnight/60">Key</span>
                        <input
                            type="text"
                            value={key}
                            onChange={(e) => {
                                setKeyTouched(true);
                                setKey(e.target.value);
                            }}
                            className="w-full rounded-md border border-alloy-forge/15 px-2.5 py-1.5 font-mono text-sm"
                            data-testid="add-relationship-key"
                        />
                    </label>

                    <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-alloy-midnight/60">Description</span>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full rounded-md border border-alloy-forge/15 px-2.5 py-1.5 text-sm"
                            data-testid="add-relationship-description"
                        />
                    </label>
                </div>

                {error ? (
                    <p className="mt-3 text-xs text-alloy-ember" data-testid="add-relationship-error">
                        {error}
                    </p>
                ) : null}

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={saving}
                        onClick={onClose}
                        className="rounded-lg border border-alloy-forge/12 px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.35]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={saving || !canMutate}
                        onClick={() => void save()}
                        className="rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                        data-testid="add-relationship-save"
                    >
                        {saving ? "Creating…" : "Create"}
                    </button>
                </div>
            </div>
        </div>
    );
}
