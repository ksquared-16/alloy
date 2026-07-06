"use client";

/**
 * Nested Surface Editor — configure the evidence groups/fields inside a card's
 * expansion surface (Children Surface, Financial Configuration Surface).
 *
 * Visible /surfaces behavior: view current fields · + Add Field (compatible
 * predefined + tenant custom) · remove · reorder · Save/Publish. Availability is
 * namespace-driven and never fabricates a field (honest empty state where no
 * compatible real field exists).
 *
 * Live runtime does not consume nested surface configs yet — labeled
 * presentation-runtime-ready.
 *
 * @see lib/adminV2/settings/surfaces/nestedSurfaceEditorModel.ts
 * @see lib/adminV2/settings/surfaces/nestedSurfaceConfigService.ts
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import {
    addFieldToNestedGroup,
    availableFieldsForNestedGroup,
    defaultNestedSurfaceConfig,
    groupDefsFor,
    moveFieldInNestedGroup,
    nestedSurfaceLabel,
    removeFieldFromNestedGroup,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    loadNestedSurfaceConfig,
    saveNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceConfigService";
import { availableFieldsForNamespaces, type AvailableField } from "@/lib/adminV2/settings/surfaces/compositionFieldAdapter";

function labelForKey(surfaceId: string, groupKey: string, fieldKey: string, tenantDefs: Parameters<typeof availableFieldsForNamespaces>[1]): string {
    const def = groupDefsFor(surfaceId).find((g) => g.key === groupKey);
    const all = def ? availableFieldsForNamespaces(def.acceptedNamespaces, tenantDefs) : [];
    return all.find((f) => f.key === fieldKey)?.label
        ?? fieldKey.replace(/^[a-z_]+\./, "").replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function NestedSurfaceEditor({
    surfaceId,
    grainEntityType = "opportunities",
}: {
    surfaceId: string;
    grainEntityType?: string;
}) {
    const { tenantFieldDefinitions } = useTenantFieldDefinitions(grainEntityType);
    const [config, setConfig] = useState<NestedSurfaceConfig>(() => defaultNestedSurfaceConfig(surfaceId));
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [addOpenGroup, setAddOpenGroup] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        loadNestedSurfaceConfig(surfaceId)
            .then((c) => { if (!cancelled) { setConfig(c); setDirty(false); } })
            .catch(() => { if (!cancelled) setConfig(defaultNestedSurfaceConfig(surfaceId)); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [surfaceId]);

    const mutate = useCallback((next: NestedSurfaceConfig) => {
        setConfig(next);
        setDirty(true);
        setSavedAt(false);
    }, []);

    const groups = groupDefsFor(surfaceId);

    async function handleSave() {
        setSaving(true);
        setError(null);
        try {
            await saveNestedSurfaceConfig(surfaceId, config);
            setDirty(false);
            setSavedAt(true);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3" data-nested-surface-editor={surfaceId}>
            <header className="border-b border-alloy-stone/10 pb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">Nested Surface</p>
                <h2 className="text-lg font-semibold tracking-tight text-alloy-midnight" data-nested-surface-title>
                    {nestedSurfaceLabel(surfaceId)}
                </h2>
                <p className="mt-0.5 text-xs text-alloy-midnight/55">
                    Configure the evidence groups and fields inside this expansion surface.
                    Groups derive from the registered SurfaceSpec.
                </p>
            </header>

            {loading ? (
                <div className="h-24 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/5" />
            ) : (
                <div className="min-h-0 flex-1 space-y-3 overflow-auto">
                    {groups.map((def) => {
                        const selected = selectedFieldKeys(config, def.key);
                        const available: AvailableField[] = availableFieldsForNestedGroup(surfaceId, def.key, config, tenantFieldDefinitions);
                        const addOpen = addOpenGroup === def.key;
                        return (
                            <section
                                key={def.key}
                                className="rounded-xl border border-alloy-stone/14 bg-white p-3 shadow-sm"
                                data-nested-group={def.key}
                            >
                                <div className="flex items-baseline justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-alloy-midnight">{def.label}</p>
                                        {def.purpose && <p className="text-[11px] text-alloy-midnight/45">{def.purpose}</p>}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setAddOpenGroup(addOpen ? null : def.key)}
                                        className="rounded-lg border border-alloy-pine/30 bg-white px-2 py-1 text-[11px] font-medium text-alloy-pine hover:bg-alloy-pine/[0.05]"
                                        data-nested-add-field={def.key}
                                    >
                                        + Add Field
                                    </button>
                                </div>

                                {/* Selected fields */}
                                <div className="mt-2 space-y-1" data-nested-selected={def.key}>
                                    {selected.length === 0 && (
                                        <p className="rounded-md bg-alloy-stone/[0.05] px-2 py-1.5 text-[11px] text-alloy-midnight/35">
                                            No fields yet — add compatible fields above.
                                        </p>
                                    )}
                                    {selected.map((fieldKey, i) => (
                                        <div
                                            key={fieldKey}
                                            className="flex items-center gap-2 rounded-md border border-alloy-stone/10 px-2 py-1"
                                            data-nested-field={fieldKey}
                                        >
                                            <span className="flex-1 truncate text-[12px] text-alloy-midnight/80">
                                                {labelForKey(surfaceId, def.key, fieldKey, tenantFieldDefinitions)}
                                            </span>
                                            <span className="font-mono text-[9px] text-alloy-midnight/25">{fieldKey}</span>
                                            <button type="button" aria-label="Move up" disabled={i === 0}
                                                onClick={() => mutate(moveFieldInNestedGroup(config, def.key, fieldKey, -1))}
                                                className="rounded px-1 text-[10px] text-alloy-midnight/40 hover:text-alloy-pine disabled:opacity-30">↑</button>
                                            <button type="button" aria-label="Move down" disabled={i === selected.length - 1}
                                                onClick={() => mutate(moveFieldInNestedGroup(config, def.key, fieldKey, 1))}
                                                className="rounded px-1 text-[10px] text-alloy-midnight/40 hover:text-alloy-pine disabled:opacity-30">↓</button>
                                            <button type="button" aria-label={`Remove ${fieldKey}`}
                                                onClick={() => mutate(removeFieldFromNestedGroup(config, def.key, fieldKey))}
                                                className="rounded px-1 text-[11px] text-alloy-midnight/30 hover:text-red-500"
                                                data-nested-remove-field={fieldKey}>✕</button>
                                        </div>
                                    ))}
                                </div>

                                {/* Add Field picker */}
                                {addOpen && (
                                    <div className="mt-2 rounded-lg border border-alloy-stone/14 bg-alloy-stone/[0.03] p-2" data-nested-add-picker={def.key}>
                                        {available.length === 0 ? (
                                            <p className="px-1 py-1 text-[11px] text-alloy-midnight/40">
                                                No compatible fields available. Create a custom field for this record type, or none are modeled yet.
                                            </p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {available.map((f) => (
                                                    <button
                                                        key={f.key}
                                                        type="button"
                                                        onClick={() => { mutate(addFieldToNestedGroup(config, def.key, f.key)); setAddOpenGroup(null); }}
                                                        className="flex items-center gap-1 rounded-full border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-midnight/70 hover:border-alloy-pine/40 hover:text-alloy-pine"
                                                        data-nested-available-field={f.key}
                                                    >
                                                        {f.label}
                                                        {!f.isSystemField && (
                                                            <span className="rounded bg-alloy-pine/10 px-1 text-[9px] font-medium text-alloy-pine" data-custom-field-badge>Custom</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center gap-3 border-t border-alloy-stone/10 pt-3">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-40"
                    data-nested-surface-save
                >
                    {saving ? "Publishing…" : "Save & Publish"}
                </button>
                <span className="text-[11px] font-medium text-alloy-midnight/50">
                    {error ? <span className="text-red-500">{error}</span>
                        : saving ? "Saving…"
                        : savedAt && !dirty ? <span className="text-alloy-juniper">Published</span>
                        : dirty ? "Unsaved changes"
                        : "No changes"}
                </span>
            </div>
        </div>
    );
}
