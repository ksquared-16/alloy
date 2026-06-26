"use client";

import { useEffect, useMemo, useState } from "react";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { actionPlacementEntityTypeOptionLabel } from "@/lib/admin/resolveEntityDisplayLabel";
import type { ActionRegistryEntry } from "@/lib/admin/actions/actionDefinitionRegistry";
import {
    SETTINGS_SURFACE_OPTIONS,
    settingsSlotsForSurface,
    surfaceRequiresSectionKey,
} from "@/lib/admin/actions/actionPlacementPresentation";
import { ACTION_PLACEMENT_ENTITY_TYPES } from "@/lib/admin/actions/actionButtonCreateUi";

export type GuidedPlacementSeed = {
    definitionId: string;
    libraryEntry: ActionRegistryEntry;
    entityType?: string;
    surface?: string;
    slot?: string;
    sectionKey?: string;
    placementId?: string;
    label?: string;
    definitionOrgId?: string | null;
    orderIndex?: number;
    isActive?: boolean;
};

type Props = {
    open: boolean;
    mode: "create" | "edit";
    seed: GuidedPlacementSeed | null;
    onClose: () => void;
    onSaved: () => void;
    canMutate: boolean;
};

const WHERE_OPTIONS = SETTINGS_SURFACE_OPTIONS.filter((o) =>
    ["queue_row", "record_header", "record_section", "right_rail", "workspace"].includes(o.value)
);

export default function ActionPlacementGuidedEditor({ open, mode, seed, onClose, onSaved, canMutate }: Props) {
    const { labels } = useEntityLabels();
    const [surface, setSurface] = useState("queue_row");
    const [slot, setSlot] = useState("row_inline");
    const [entityType, setEntityType] = useState("opportunity");
    const [sectionKey, setSectionKey] = useState("");
    const [orderIndex, setOrderIndex] = useState(100);
    const [enabled, setEnabled] = useState(true);
    const [buttonLabel, setButtonLabel] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canEditLabel = Boolean(seed?.definitionOrgId);

    useEffect(() => {
        if (!open || !seed) return;
        setSurface(seed.surface ?? seed.libraryEntry.defaultSurface ?? "queue_row");
        setSlot(seed.slot ?? seed.libraryEntry.defaultSlot ?? "row_inline");
        setEntityType(seed.entityType ?? "opportunity");
        setSectionKey(seed.sectionKey ?? "");
        setOrderIndex(seed.orderIndex ?? 100);
        setEnabled(seed.isActive !== false);
        setButtonLabel(seed.label ?? seed.libraryEntry.label);
        setError(null);
    }, [open, seed]);

    const slots = useMemo(() => settingsSlotsForSurface(surface), [surface]);

    useEffect(() => {
        if (!slots.some((s) => s.value === slot)) {
            setSlot(slots[0]?.value ?? "primary");
        }
    }, [slots, slot]);

    if (!open || !seed) return null;

    const title = mode === "create" ? `Add ${seed.libraryEntry.label}` : `Edit ${seed.libraryEntry.label}`;

    const submitCreate = async () => {
        if (!canMutate || !seed.definitionId) return;
        if (surfaceRequiresSectionKey(surface) && !sectionKey.trim()) {
            setError("Choose which drawer section this button belongs in.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/action-placements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    action_definition_id: seed.definitionId,
                    surface,
                    slot,
                    entity_type: entityType.trim() || null,
                    section_key: surfaceRequiresSectionKey(surface) ? sectionKey.trim() : null,
                    order_index: orderIndex,
                    is_active: enabled,
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Could not save");
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save");
        } finally {
            setSubmitting(false);
        }
    };

    const submitEdit = async () => {
        if (!canMutate || !seed.placementId) return;
        if (surfaceRequiresSectionKey(surface) && !sectionKey.trim()) {
            setError("Choose which drawer section this button belongs in.");
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            if (canEditLabel && buttonLabel.trim() && buttonLabel.trim() !== (seed.label ?? "").trim()) {
                const labelRes = await fetch(`/api/admin/action-definitions/${seed.definitionId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ label: buttonLabel.trim() }),
                });
                const labelJson = (await labelRes.json().catch(() => ({}))) as { error?: string };
                if (!labelRes.ok) throw new Error(labelJson.error ?? "Could not update label");
            }

            const res = await fetch(`/api/admin/action-placements/${seed.placementId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    surface,
                    slot,
                    entity_type: entityType.trim() || null,
                    section_key: surfaceRequiresSectionKey(surface) ? sectionKey.trim() : null,
                    order_index: orderIndex,
                    is_active: enabled,
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Could not save");
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
            data-testid="action-placement-guided-editor-backdrop"
            onClick={onClose}
        >
            <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-alloy-pine/25 bg-white shadow-lg"
                data-testid="action-placement-guided-editor"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-alloy-forge/10 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-alloy-midnight">{title}</h2>
                        <p className="mt-0.5 text-xs text-alloy-midnight/55">{seed.libraryEntry.description}</p>
                    </div>
                    <button type="button" className="text-xs text-alloy-midnight/50 hover:text-alloy-midnight" onClick={onClose}>
                        Cancel
                    </button>
                </div>
                <div className="space-y-3 px-4 py-3">
                    {mode === "edit" ? (
                        <label className="block text-xs">
                            <span className="mb-1 block font-medium text-alloy-midnight/70">Button label</span>
                            <input
                                type="text"
                                value={buttonLabel}
                                onChange={(e) => setButtonLabel(e.target.value)}
                                className="w-full rounded border border-alloy-stone/40 px-2 py-1.5 text-sm disabled:bg-alloy-stone/[0.04]"
                                disabled={submitting || !canEditLabel}
                            />
                            {!canEditLabel ? (
                                <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">
                                    Built-in action labels are fixed. Add your own org action to customize the label.
                                </span>
                            ) : null}
                        </label>
                    ) : null}

                    <label className="block text-xs">
                        <span className="mb-1 block font-medium text-alloy-midnight/70">Where should this appear?</span>
                        <select
                            value={surface}
                            onChange={(e) => setSurface(e.target.value)}
                            className="w-full rounded border border-alloy-stone/40 px-2 py-1.5 text-sm"
                            disabled={submitting}
                        >
                            {WHERE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                        <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">
                            {WHERE_OPTIONS.find((o) => o.value === surface)?.description}
                        </span>
                    </label>

                    {surfaceRequiresSectionKey(surface) ? (
                        <label className="block text-xs">
                            <span className="mb-1 block font-medium text-alloy-midnight/70">Drawer section</span>
                            <input
                                type="text"
                                value={sectionKey}
                                onChange={(e) => setSectionKey(e.target.value)}
                                placeholder="e.g. details, inquiry_children"
                                className="w-full rounded border border-alloy-stone/40 px-2 py-1.5 text-sm"
                                disabled={submitting}
                            />
                            <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">
                                Match a section from Record layouts (drawer body).
                            </span>
                        </label>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs">
                            <span className="mb-1 block font-medium text-alloy-midnight/70">Record type</span>
                            <select
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value)}
                                className="w-full rounded border border-alloy-stone/40 px-2 py-1.5 text-sm"
                                disabled={submitting}
                            >
                                {ACTION_PLACEMENT_ENTITY_TYPES.map((et) => (
                                    <option key={et} value={et}>
                                        {actionPlacementEntityTypeOptionLabel(et, labels)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block text-xs">
                            <span className="mb-1 block font-medium text-alloy-midnight/70">Position in that area</span>
                            <select
                                value={slot}
                                onChange={(e) => setSlot(e.target.value)}
                                className="w-full rounded border border-alloy-stone/40 px-2 py-1.5 text-sm"
                                disabled={submitting}
                            >
                                {slots.map((s) => (
                                    <option key={s.value} value={s.value}>
                                        {s.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <label className="block w-28 text-xs">
                        <span className="mb-1 block font-medium text-alloy-midnight/70">Sort order</span>
                        <input
                            type="number"
                            value={orderIndex}
                            onChange={(e) => setOrderIndex(Number(e.target.value))}
                            className="w-full rounded border border-alloy-stone/40 px-2 py-1.5 text-sm"
                            disabled={submitting}
                        />
                        <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">Lower numbers appear first.</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={submitting} />
                        <span className="text-alloy-midnight/70">Enabled for your organization</span>
                    </label>

                    {error ? <p className="text-xs text-red-600">{error}</p> : null}

                    <button
                        type="button"
                        disabled={submitting || !canMutate}
                        className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45"
                        onClick={() => void (mode === "create" ? submitCreate() : submitEdit())}
                    >
                        {submitting ? "Saving…" : mode === "create" ? "Add button" : "Save changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
