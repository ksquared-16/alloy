"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import ActionPlacementFormFields from "@/components/adminV2/settings/ActionPlacementFormFields";
import { surfaceRequiresSectionKey } from "@/lib/admin/actions/actionPlacementPresentation";
import {
    ACTION_BUTTON_CREATE_DEFERRED_NOTE,
    ACTION_BUTTON_CREATE_DESCRIPTION,
    ACTION_BUTTON_CREATE_TITLE,
    type ActionDefinitionCatalogEntry,
    filterCatalogDefinitionsForEntity,
    formatCatalogOptionLabel,
    settingsActionCatalogDefinitions,
} from "@/lib/admin/actions/actionButtonCreateUi";

export type ActionButtonCreateSeed = {
    definitionId?: string;
    entityType?: string;
    surface?: string;
    sectionKey?: string;
};

type Props = {
    onCreated: () => void;
    initialEntityType?: string;
    initialSectionKey?: string;
    seed?: ActionButtonCreateSeed | null;
    onSeedConsumed?: () => void;
};

export default function ActionButtonCreatePanel({
    onCreated,
    initialEntityType = "",
    initialSectionKey = "",
    seed = null,
    onSeedConsumed,
}: Props) {
    const { canMutate, role } = useAdminAuth();
    const isAdmin = role === "admin";
    const [open, setOpen] = useState(false);
    const [catalog, setCatalog] = useState<ActionDefinitionCatalogEntry[]>([]);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [loadingCatalog, setLoadingCatalog] = useState(false);

    const [definitionId, setDefinitionId] = useState("");
    const [entityType, setEntityType] = useState(initialEntityType);
    const [surface, setSurface] = useState<string>("record_header");
    const [slot, setSlot] = useState("primary");
    const [sectionKey, setSectionKey] = useState(initialSectionKey);
    const [orderIndex, setOrderIndex] = useState(100);
    const [enabled, setEnabled] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const loadCatalog = useCallback(async () => {
        setLoadingCatalog(true);
        setCatalogError(null);
        try {
            const res = await fetch("/api/admin/actions/definition-catalog", { credentials: "include" });
            const j = (await res.json().catch(() => ({}))) as {
                definitions?: ActionDefinitionCatalogEntry[];
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to load action catalog");
            setCatalog(j.definitions ?? []);
        } catch (e) {
            setCatalog([]);
            setCatalogError(e instanceof Error ? e.message : "Failed to load catalog");
        } finally {
            setLoadingCatalog(false);
        }
    }, []);

    useEffect(() => {
        if ((open || seed) && catalog.length === 0 && !catalogError) {
            void loadCatalog();
        }
    }, [open, seed, catalog.length, catalogError, loadCatalog]);

    useEffect(() => {
        if (!seed) return;
        setOpen(true);
        if (seed.definitionId) setDefinitionId(seed.definitionId);
        if (seed.entityType !== undefined) setEntityType(seed.entityType);
        if (seed.surface) setSurface(seed.surface);
        if (seed.sectionKey !== undefined) setSectionKey(seed.sectionKey);
        onSeedConsumed?.();
    }, [seed, onSeedConsumed]);

    const filteredCatalog = useMemo(
        () => settingsActionCatalogDefinitions(catalog, entityType),
        [catalog, entityType]
    );

    const selectedDef = useMemo(
        () => filteredCatalog.find((d) => d.id === definitionId) ?? catalog.find((d) => d.id === definitionId) ?? null,
        [filteredCatalog, catalog, definitionId]
    );

    const resetForm = () => {
        setDefinitionId("");
        setEntityType(initialEntityType);
        setSurface("record_header");
        setSlot("primary");
        setSectionKey(initialSectionKey);
        setOrderIndex(100);
        setEnabled(true);
        setSubmitError(null);
    };

    const submit = async () => {
        if (!canMutate || !isAdmin || !definitionId) return;
        if (surfaceRequiresSectionKey(surface) && !sectionKey.trim()) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await fetch("/api/admin/action-placements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action_definition_id: definitionId,
                    surface,
                    slot,
                    entity_type: entityType.trim() || null,
                    section_key: surfaceRequiresSectionKey(surface) ? sectionKey.trim() : null,
                    order_index: orderIndex,
                    is_active: enabled,
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Create failed");
            resetForm();
            setOpen(false);
            onCreated();
        } catch (e) {
            setSubmitError(e instanceof Error ? e.message : "Create failed");
        } finally {
            setSubmitting(false);
        }
    };

    if (!isAdmin || !canMutate) {
        return <p className="text-xs text-alloy-midnight/55">Admin access is required to create action buttons.</p>;
    }

    return (
        <section className="rounded-xl border border-alloy-forge/12 bg-white/80 shadow-sm" data-testid="action-button-create">
            {!open ? (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-alloy-midnight">{ACTION_BUTTON_CREATE_TITLE}</h2>
                        <p className="mt-0.5 text-xs text-alloy-midnight/55">{ACTION_BUTTON_CREATE_DESCRIPTION}</p>
                    </div>
                    <button
                        type="button"
                        className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white hover:bg-alloy-pine/90"
                        onClick={() => setOpen(true)}
                    >
                        New action button
                    </button>
                </div>
            ) : (
                <div className="space-y-3 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-semibold text-alloy-midnight">{ACTION_BUTTON_CREATE_TITLE}</h2>
                            <p className="mt-0.5 text-xs leading-relaxed text-alloy-midnight/55">{ACTION_BUTTON_CREATE_DESCRIPTION}</p>
                        </div>
                        <button
                            type="button"
                            className="text-xs text-alloy-midnight/55 hover:text-alloy-midnight"
                            onClick={() => {
                                setOpen(false);
                                resetForm();
                            }}
                        >
                            Cancel
                        </button>
                    </div>

                    <p className="rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.04] px-2.5 py-2 text-[11px] leading-snug text-alloy-midnight/65">
                        {ACTION_BUTTON_CREATE_DEFERRED_NOTE}{" "}
                        <Link href="/admin/workflows" className="font-medium text-alloy-pine hover:underline">
                            Automations
                        </Link>
                        .
                    </p>

                    {loadingCatalog ? <p className="text-xs text-alloy-midnight/55">Loading action catalog…</p> : null}
                    {catalogError ? <p className="text-xs text-red-600">{catalogError}</p> : null}

                    <label className="block text-xs">
                        <span className="mb-0.5 block font-medium text-alloy-midnight/70">Approved action</span>
                        <select
                            value={definitionId}
                            onChange={(e) => setDefinitionId(e.target.value)}
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm"
                            disabled={loadingCatalog || submitting}
                        >
                            <option value="">Choose an action…</option>
                            {filteredCatalog.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {formatCatalogOptionLabel(d)}
                                </option>
                            ))}
                        </select>
                    </label>

                    {selectedDef ? (
                        <p className="text-[11px] text-alloy-midnight/55">
                            Drawer label: <span className="font-medium text-alloy-midnight">{selectedDef.label}</span>
                            {selectedDef.org_id ? (
                                <> — you can change the label after creating (org-owned action).</>
                            ) : (
                                <> — built-in label; customize placement and enablement only.</>
                            )}
                        </p>
                    ) : null}

                    <ActionPlacementFormFields
                        entityType={entityType}
                        onEntityTypeChange={(v) => {
                            setEntityType(v);
                            setDefinitionId("");
                        }}
                        surface={surface}
                        onSurfaceChange={setSurface}
                        slot={slot}
                        onSlotChange={setSlot}
                        sectionKey={sectionKey}
                        onSectionKeyChange={setSectionKey}
                        orderIndex={orderIndex}
                        onOrderIndexChange={setOrderIndex}
                        disabled={submitting}
                    />

                    <label className="flex items-center gap-2 text-xs">
                        <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                            disabled={submitting}
                        />
                        <span className="text-alloy-midnight/70">Enabled for your organization</span>
                    </label>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={!definitionId || submitting}
                            className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45"
                            onClick={() => void submit()}
                        >
                            {submitting ? "Creating…" : "Create button"}
                        </button>
                    </div>
                    {submitError ? <p className="text-xs text-red-600">{submitError}</p> : null}
                </div>
            )}
        </section>
    );
}
