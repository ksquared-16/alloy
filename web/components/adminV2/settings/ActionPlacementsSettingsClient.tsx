"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { resolveEntityLabel } from "@/lib/admin/resolveEntityDisplayLabel";
import { ACTION_PLACEMENT_ENTITY_TYPES } from "@/lib/admin/actions/actionButtonCreateUi";
import {
    partitionPlacementRowsForSettings,
    type ActionPlacementEditorRow,
} from "@/lib/admin/actions/actionPlacementEditorUi";
import {
    actionRegistryEntryForKey,
    type ActionRegistryEntry,
} from "@/lib/admin/actions/actionDefinitionRegistry";
import ActionButtonLibraryPanel, {
    type ActionCatalogDefinition,
} from "@/components/adminV2/settings/ActionButtonLibraryPanel";
import ActionPlacementGuidedEditor, {
    type GuidedPlacementSeed,
} from "@/components/adminV2/settings/ActionPlacementGuidedEditor";
import ConfiguredActionPlacementsList from "@/components/adminV2/settings/ConfiguredActionPlacementsList";

type InventoryItem = {
    definition: {
        id: string;
        key: string;
        label: string;
        action_type: string;
        entity_type: string | null;
        org_id: string | null;
    };
    placement: {
        id: string;
        org_id: string | null;
        surface: string;
        slot: string;
        entity_type: string | null;
        section_key: string | null;
        order_index: number;
        display_style: string;
        is_active: boolean;
    };
};

function toEditorRow(item: InventoryItem): ActionPlacementEditorRow {
    return {
        placement_id: item.placement.id,
        definition_id: item.definition.id,
        definition_key: item.definition.key,
        definition_org_id: item.definition.org_id,
        label: item.definition.label,
        action_type: item.definition.action_type,
        entity_type: item.placement.entity_type ?? item.definition.entity_type,
        org_id: item.placement.org_id,
        surface: item.placement.surface,
        slot: item.placement.slot,
        section_key: item.placement.section_key,
        order_index: item.placement.order_index,
        display_style: item.placement.display_style,
        is_active: item.placement.is_active,
    };
}

export default function ActionPlacementsSettingsClient() {
    const searchParams = useSearchParams();
    const initialEntity = searchParams.get("entity_type")?.trim() ?? "";

    const { canMutate, orgId, role } = useAdminAuth();
    const { labels } = useEntityLabels();

    const entityFilterOptions = useMemo(
        () =>
            ACTION_PLACEMENT_ENTITY_TYPES.map((et) => ({
                value: et,
                label: resolveEntityLabel(et, labels),
            })),
        [labels]
    );
    const [rows, setRows] = useState<ActionPlacementEditorRow[] | null>(null);
    const [catalog, setCatalog] = useState<ActionCatalogDefinition[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [entityFilter, setEntityFilter] = useState(initialEntity);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
    const [editorSeed, setEditorSeed] = useState<GuidedPlacementSeed | null>(null);
    const [systemDefaultsOpen, setSystemDefaultsOpen] = useState(false);
    const editorRef = useRef<HTMLDivElement>(null);
    const chooserRef = useRef<HTMLElement>(null);

    const scrollToChooser = useCallback(() => {
        chooserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const load = useCallback(async () => {
        try {
            const [invRes, catRes] = await Promise.all([
                fetch("/api/admin/actions/inventory", { credentials: "include" }),
                fetch("/api/admin/actions/definition-catalog", { credentials: "include" }),
            ]);
            const invJ = (await invRes.json().catch(() => ({}))) as { items?: InventoryItem[]; error?: string };
            const catJ = (await catRes.json().catch(() => ({}))) as {
                definitions?: ActionCatalogDefinition[];
                error?: string;
            };
            setCatalog(catJ.definitions ?? []);
            if (!invRes.ok) {
                setRows([]);
                setError(invJ.error ?? "Failed to load placements");
                if (!catRes.ok) {
                    setError((prev) => prev ?? catJ.error ?? "Failed to load action catalog");
                }
                return;
            }
            setRows((invJ.items ?? []).map(toEditorRow));
            setError(catRes.ok ? null : catJ.error ?? null);
        } catch (e) {
            setRows([]);
            setError(e instanceof Error ? e.message : "Failed to load");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const filteredRows = useMemo(() => {
        const all = rows ?? [];
        return all.filter((r) => !entityFilter || (r.entity_type ?? "") === entityFilter);
    }, [rows, entityFilter]);

    const { orgPlacements, systemDefaults } = useMemo(
        () => partitionPlacementRowsForSettings(filteredRows, orgId ?? ""),
        [filteredRows, orgId]
    );

    const isAdmin = role === "admin";
    const canAddButtons = Boolean(isAdmin && canMutate);
    const addDisabledReason = !isAdmin
        ? "Admin access required to add buttons"
        : !canMutate
          ? "You do not have permission to change settings"
          : undefined;

    const openCreate = (entry: ActionRegistryEntry, definitionId: string) => {
        setEditorMode("create");
        setEditorSeed({
            definitionId,
            libraryEntry: entry,
            entityType: "opportunity",
            surface: entry.defaultSurface,
            sectionKey: "",
        });
        setEditorOpen(true);
    };

    const openEdit = (row: ActionPlacementEditorRow) => {
        const lib =
            actionRegistryEntryForKey(row.definition_key) ?? {
                key: row.definition_key,
                label: row.label,
                category: "record" as const,
                settingsConfigurable: true,
                description: "Configured action button.",
            };
        setEditorMode("edit");
        setEditorSeed({
            definitionId: row.definition_id,
            definitionOrgId: row.definition_org_id,
            libraryEntry: lib,
            placementId: row.placement_id,
            entityType: row.entity_type ?? "opportunity",
            surface: row.surface,
            slot: row.slot,
            sectionKey: row.section_key ?? "",
            label: row.label,
            orderIndex: row.order_index,
            isActive: row.is_active,
        });
        setEditorOpen(true);
        requestAnimationFrame(() => {
            editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    };

    const removePlacement = async (placementId: string) => {
        if (!window.confirm("Remove this button? It will no longer appear in the workspace.")) return;
        setSavingId(placementId);
        try {
            const res = await fetch(`/api/admin/action-placements/${placementId}`, {
                method: "DELETE",
                credentials: "include",
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Remove failed");
            await load();
        } catch (e) {
            setRowErrors((prev) => ({ ...prev, [placementId]: (e as Error).message }));
        } finally {
            setSavingId(null);
        }
    };

    const patchPlacement = async (placementId: string, body: Record<string, unknown>) => {
        setSavingId(placementId);
        try {
            const res = await fetch(`/api/admin/action-placements/${placementId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Update failed");
            await load();
        } catch (e) {
            setRowErrors((prev) => ({ ...prev, [placementId]: (e as Error).message }));
        } finally {
            setSavingId(null);
        }
    };

    const reorderPlacement = async (row: ActionPlacementEditorRow, direction: "up" | "down") => {
        const peers = orgPlacements
            .filter(
                (r) =>
                    r.surface === row.surface &&
                    r.slot === row.slot &&
                    (r.entity_type ?? "") === (row.entity_type ?? "") &&
                    (r.section_key ?? "") === (row.section_key ?? "")
            )
            .sort((a, b) => a.order_index - b.order_index || a.label.localeCompare(b.label));
        const idx = peers.findIndex((r) => r.placement_id === row.placement_id);
        const swapIdx = direction === "up" ? idx - 1 : idx + 1;
        if (idx < 0 || swapIdx < 0 || swapIdx >= peers.length) return;
        const other = peers[swapIdx];
        setSavingId(row.placement_id);
        try {
            await fetch(`/api/admin/action-placements/${row.placement_id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_index: other.order_index }),
            }).then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Update failed");
            });
            await fetch(`/api/admin/action-placements/${other.placement_id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_index: row.order_index }),
            }).then(async (res) => {
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Update failed");
            });
            await load();
        } catch (e) {
            setRowErrors((prev) => ({ ...prev, [row.placement_id]: (e as Error).message }));
        } finally {
            setSavingId(null);
        }
    };

    const listHandlers = {
        orgId: orgId ?? "",
        isAdmin,
        canMutate: Boolean(canMutate),
        savingId,
        rowErrors,
        onEdit: openEdit,
        onRemove: (id: string) => void removePlacement(id),
        onToggleEnabled: (id: string, enabled: boolean) => void patchPlacement(id, { is_active: enabled }),
        onReorder: (row: ActionPlacementEditorRow, direction: "up" | "down") => void reorderPlacement(row, direction),
        allRows: orgPlacements,
    };

    return (
        <div className="space-y-6" data-testid="action-placements-settings">
            <div className="rounded-xl border border-alloy-forge/12 bg-alloy-stone/[0.04] px-4 py-3 text-sm text-alloy-midnight/75 sm:px-5">
                <p className="max-w-3xl text-xs leading-relaxed">
                    Add buttons from the library, then manage where they appear. Status names and automation
                    behavior are managed separately on{" "}
                    <Link href="/admin/settings/statuses" className="font-medium text-alloy-pine hover:underline">
                        Statuses
                    </Link>{" "}
                    and{" "}
                    <Link href="/admin/workflows" className="font-medium text-alloy-pine hover:underline">
                        Automations
                    </Link>
                    .
                </p>
            </div>

            <ActionButtonLibraryPanel
                ref={chooserRef}
                catalog={catalog}
                catalogReady={rows !== null}
                catalogLoading={rows === null}
                disabled={!canAddButtons}
                disabledReason={addDisabledReason}
                onAdd={openCreate}
            />

            {editorOpen && editorSeed ? (
                <div ref={editorRef} className="scroll-mt-6">
                    <ActionPlacementGuidedEditor
                        open={editorOpen}
                        mode={editorMode}
                        seed={editorSeed}
                        canMutate={canAddButtons}
                        onClose={() => {
                            setEditorOpen(false);
                            setEditorSeed(null);
                        }}
                        onSaved={() => void load()}
                    />
                </div>
            ) : null}

            <section className="space-y-3" data-testid="your-action-buttons">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-semibold text-alloy-midnight">Your buttons</h2>
                        <p className="text-xs text-alloy-midnight/55">
                            Buttons you added or customized for this organization.
                        </p>
                    </div>
                    <label className="text-xs">
                        <span className="mb-0.5 block font-medium text-alloy-midnight/55">Filter by record type</span>
                        <select
                            value={entityFilter}
                            onChange={(e) => setEntityFilter(e.target.value)}
                            className="rounded border border-alloy-stone/40 px-2 py-1 text-xs"
                        >
                            <option value="">All</option>
                            {entityFilterOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {rows == null ? <p className="text-sm text-alloy-midnight/55">Loading…</p> : null}

                {rows != null && orgPlacements.length === 0 && !error ? (
                    <div className="rounded-lg border border-dashed border-alloy-forge/20 bg-white/40 px-4 py-6 text-sm text-alloy-midnight/55">
                        <p>No custom buttons yet.</p>
                        <button
                            type="button"
                            className="mt-3 rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-alloy-pine/90"
                            data-testid="add-first-action-button-cta"
                            onClick={scrollToChooser}
                        >
                            Add your first button
                        </button>
                    </div>
                ) : null}

                <ConfiguredActionPlacementsList rows={orgPlacements} {...listHandlers} />
            </section>

            {systemDefaults.length > 0 ? (
                <section className="border-t border-alloy-forge/10 pt-4" data-testid="system-default-placements">
                    <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-xs text-alloy-midnight/55 hover:text-alloy-midnight"
                        aria-expanded={systemDefaultsOpen}
                        onClick={() => setSystemDefaultsOpen((v) => !v)}
                    >
                        <span>
                            System defaults ({systemDefaults.length}) — built-in placements for reference
                        </span>
                        <span aria-hidden>{systemDefaultsOpen ? "▾" : "▸"}</span>
                    </button>
                    {systemDefaultsOpen ? (
                        <div className="mt-3 opacity-90">
                            <p className="mb-3 max-w-3xl text-[11px] leading-relaxed text-alloy-midnight/50">
                                These ship with Alloy and cannot be edited here. To change where an action appears, add
                                your own button from the library.
                            </p>
                            <ConfiguredActionPlacementsList rows={systemDefaults} {...listHandlers} readOnly />
                        </div>
                    ) : null}
                </section>
            ) : null}
        </div>
    );
}
