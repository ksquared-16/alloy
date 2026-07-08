"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import ConfigurationAdvancedToggle from "@/components/adminV2/configuration/ConfigurationAdvancedToggle";
import ConfigurationStatusToggle from "@/components/adminV2/configuration/ConfigurationStatusToggle";
import {
    RELATIONSHIP_KIND_OPERATOR_OPTIONS,
    slugifyOperatorKey,
} from "@/lib/fields/dataModelWorkspaceOperatorUi";
import type { SettingsHubEntityKey } from "@/lib/fields/fieldCatalogForSettings";
import { DATA_MODEL_ICON_STROKE } from "@/lib/fields/dataModelWorkspaceIcons";
import { Plus } from "lucide-react";

type RelationshipKind = "family_role" | "person_relationship";

type Props = {
    open: boolean;
    hubEntity: SettingsHubEntityKey;
    onCancel: () => void;
    onCreated?: () => void;
};

const KEY_REGEX = /^[a-z0-9_]{2,64}$/;

function defaultKindForEntity(hubEntity: SettingsHubEntityKey): RelationshipKind {
    if (hubEntity === "person") return "person_relationship";
    return "family_role";
}

/** Inline custom relationship vocabulary create — stays in the Data Model workspace. */
export default function DataModelRelationshipCreateRow({ open, hubEntity, onCancel, onCreated }: Props) {
    const { canMutate } = useAdminAuth();
    const [kind, setKind] = useState<RelationshipKind>(() => defaultKindForEntity(hubEntity));
    const [label, setLabel] = useState("");
    const [key, setKey] = useState("");
    const keyTouched = useRef(false);
    const [description, setDescription] = useState("");
    const [active, setActive] = useState(true);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const kindMeta = RELATIONSHIP_KIND_OPERATOR_OPTIONS.find((o) => o.value === kind)!;

    useEffect(() => {
        if (!open) return;
        setKind(defaultKindForEntity(hubEntity));
        setLabel("");
        setKey("");
        keyTouched.current = false;
        setDescription("");
        setActive(true);
        setAdvancedOpen(false);
        setError(null);
    }, [open, hubEntity]);

    useEffect(() => {
        if (!open || keyTouched.current) return;
        setKey(slugifyOperatorKey(label));
    }, [label, open]);

    const endpoint =
        kind === "family_role"
            ? "/api/admin/customer-person-role-types"
            : "/api/admin/person-relationship-type-settings";

    if (!open) return null;

    const save = async () => {
        if (!canMutate) return;
        const normalizedKey = key.trim().toLowerCase();
        if (!label.trim()) {
            setError("Label is required.");
            return;
        }
        if (!KEY_REGEX.test(normalizedKey)) {
            setError("Could not derive a valid key from the label.");
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
                    is_active: active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 409) {
                setError("This relationship name already exists.");
                return;
            }
            if (!res.ok) {
                const err = (json as { error?: { message?: string } | string }).error;
                const message =
                    typeof err === "string" ? err : err && typeof err === "object" ? err.message : undefined;
                throw new Error(message ?? "Could not create relationship.");
            }
            onCreated?.();
            onCancel();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="mb-3 rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.04]"
            data-testid="data-model-relationship-create-row"
            data-expanded="true"
        >
            <div className="flex items-center gap-2 border-b border-alloy-bend-pine/15 px-2.5 py-2">
                <Plus size={14} strokeWidth={DATA_MODEL_ICON_STROKE} className="text-alloy-bend-pine" aria-hidden />
                <p className="text-[13px] font-semibold text-alloy-midnight">New custom relationship</p>
            </div>
            <div className="grid gap-2.5 px-3 py-3 sm:grid-cols-2">
                <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        Relationship type
                    </span>
                    <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as RelationshipKind)}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-relationship-kind"
                    >
                        {RELATIONSHIP_KIND_OPERATOR_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <p className="text-[11px] leading-snug text-alloy-midnight/45">{kindMeta.hint}</p>
                </label>
                <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">Label</span>
                    <input
                        autoFocus
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder={kind === "family_role" ? "e.g. Authorized pickup" : "e.g. Grandparent"}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-relationship-label"
                    />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                        Description
                    </span>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 text-sm"
                        data-testid="inline-relationship-description"
                        placeholder="When staff should use this relationship"
                    />
                </label>
                <div className="sm:col-span-2">
                    <ConfigurationStatusToggle active={active} onChange={setActive} />
                </div>
                <div className="sm:col-span-2">
                    <ConfigurationAdvancedToggle open={advancedOpen} onToggle={() => setAdvancedOpen((o) => !o)} />
                    {advancedOpen ? (
                        <label className="mt-2 block space-y-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                Internal key
                            </span>
                            <input
                                value={key}
                                onChange={(e) => {
                                    keyTouched.current = true;
                                    setKey(e.target.value);
                                }}
                                className="w-full rounded-md border border-alloy-forge/15 bg-white px-2.5 py-1.5 font-mono text-sm"
                                data-testid="inline-relationship-key"
                            />
                            <p className="text-[10px] text-alloy-midnight/40">Generated automatically from the label.</p>
                        </label>
                    ) : null}
                </div>
            </div>
            {error ? (
                <p className="px-3 text-xs text-alloy-ember" data-testid="inline-relationship-error">
                    {error}
                </p>
            ) : null}
            <div className="flex justify-end gap-2 px-3 pb-3">
                <button
                    type="button"
                    disabled={saving}
                    onClick={onCancel}
                    className="config-secondary-btn rounded-lg border border-alloy-forge/12 px-2.5 py-1 text-[11px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.35]"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    disabled={saving || !canMutate}
                    onClick={() => void save()}
                    className="config-primary-btn rounded-lg bg-alloy-bend-pine px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                    data-testid="inline-relationship-save"
                >
                    {saving ? "Creating…" : "Create"}
                </button>
            </div>
        </div>
    );
}
