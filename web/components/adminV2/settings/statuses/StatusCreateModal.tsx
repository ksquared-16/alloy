"use client";

import { useEffect, useMemo, useState } from "react";
import { slugifyStatusKey, STATUS_KEY_REGEX } from "@/lib/admin/slugifyAdminKey";
import { buildPersonStatusApplicabilityMetadata } from "@/lib/admin/person/personStatusApplicability";
import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";

type PersonStatusApplicabilityMode = "child_lifecycle" | "person_generic" | "both";

export default function StatusCreateModal({
    open,
    defaultEntityType,
    onClose,
    onCreated,
}: {
    open: boolean;
    defaultEntityType: string;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [entityType, setEntityType] = useState(defaultEntityType);
    const [label, setLabel] = useState("");
    const [sortOrder, setSortOrder] = useState(100);
    const [advancedKey, setAdvancedKey] = useState(false);
    const [statusKey, setStatusKey] = useState("");
    const [personApplicability, setPersonApplicability] =
        useState<PersonStatusApplicabilityMode>("child_lifecycle");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setEntityType(defaultEntityType);
        setLabel("");
        setSortOrder(100);
        setAdvancedKey(false);
        setStatusKey("");
        setError(null);
    }, [open, defaultEntityType]);

    const previewKey = useMemo(() => {
        const trimmed = label.trim();
        if (!trimmed) return "";
        return slugifyStatusKey(trimmed);
    }, [label]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-alloy-midnight/40 p-4">
            <div
                className="w-full max-w-md rounded-xl border border-alloy-forge/14 bg-white p-5 shadow-lg"
                role="dialog"
                aria-modal
                data-testid="status-create-modal"
            >
                <h3 className="text-lg font-semibold text-alloy-midnight">New status</h3>
                <div className="mt-4 space-y-3">
                    <label className="block space-y-1">
                        <span className="work-view-field-label">Entity type</span>
                        <select
                            value={entityType}
                            onChange={(e) => setEntityType(e.target.value)}
                            className="config-runtime-select text-sm"
                        >
                            <option value="opportunity_customer_members">Enrollment (customer member)</option>
                            <option value="opportunities">Lead / case (opportunity)</option>
                            <option value="persons">Person</option>
                        </select>
                    </label>
                    <label className="block space-y-1">
                        <span className="work-view-field-label">Label</span>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="config-runtime-input"
                            data-testid="status-create-label"
                        />
                    </label>
                    {!advancedKey && previewKey ?
                        <p className="text-xs text-alloy-forge/70">Key preview: {previewKey}</p>
                    :   null}
                    <label className="flex items-center gap-2 text-xs text-alloy-forge/75">
                        <input
                            type="checkbox"
                            checked={advancedKey}
                            onChange={(e) => setAdvancedKey(e.target.checked)}
                            className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                        />
                        Set status key manually
                    </label>
                    {advancedKey ?
                        <input
                            type="text"
                            value={statusKey}
                            onChange={(e) => setStatusKey(e.target.value)}
                            className="config-runtime-input font-mono text-sm"
                            placeholder="status_key"
                        />
                    :   null}
                    {entityType === "persons" ?
                        <label className="block space-y-1">
                            <span className="work-view-field-label">Applicability</span>
                            <select
                                value={personApplicability}
                                onChange={(e) =>
                                    setPersonApplicability(e.target.value as PersonStatusApplicabilityMode)
                                }
                                className="config-runtime-select text-sm"
                            >
                                <option value="child_lifecycle">Child lifecycle</option>
                                <option value="person_generic">Parent / guardian</option>
                                <option value="both">Both</option>
                            </select>
                        </label>
                    :   null}
                    <label className="block space-y-1">
                        <span className="work-view-field-label">Sort order</span>
                        <input
                            type="number"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                            className="config-runtime-input w-24"
                        />
                    </label>
                    {error ?
                        <p className="text-xs text-red-700" role="alert">
                            {error}
                        </p>
                    :   null}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className="config-secondary-btn config-primary-btn--sm" onClick={onClose}>
                        Cancel
                    </button>
                    <ConfigurationPrimaryButton
                        className="config-primary-btn--sm"
                        disabled={saving}
                        data-testid="status-create-submit"
                        onClick={() => {
                            void (async () => {
                                const trimmed = label.trim();
                                if (!trimmed) {
                                    setError("Status label is required.");
                                    return;
                                }
                                const key = (advancedKey && statusKey.trim() ? statusKey.trim().toLowerCase() : previewKey);
                                if (!STATUS_KEY_REGEX.test(key)) {
                                    setError("Key must be 2–32 characters: lowercase letters, numbers, underscores.");
                                    return;
                                }
                                setSaving(true);
                                setError(null);
                                try {
                                    const metadata =
                                        entityType === "persons"
                                            ? buildPersonStatusApplicabilityMetadata(personApplicability)
                                            : {};
                                    const res = await fetch("/api/admin/status-definitions", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            entity_type: entityType,
                                            status_key: key,
                                            status_label: trimmed,
                                            sort_order: sortOrder,
                                            is_active: true,
                                            metadata,
                                        }),
                                    });
                                    const json = await res.json().catch(() => ({}));
                                    if (!res.ok) {
                                        throw new Error((json as { error?: string }).error ?? "Create failed");
                                    }
                                    onCreated();
                                } catch (e) {
                                    setError(e instanceof Error ? e.message : "Create failed");
                                } finally {
                                    setSaving(false);
                                }
                            })();
                        }}
                    >
                        {saving ? "Creating…" : "Create status"}
                    </ConfigurationPrimaryButton>
                </div>
            </div>
        </div>
    );
}
