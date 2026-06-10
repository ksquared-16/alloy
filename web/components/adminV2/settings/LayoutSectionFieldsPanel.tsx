"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { isEligibleForLayoutFieldPicker } from "@/lib/adminV2/layouts/layoutFieldPickerEligibility";
import {
    buildLayoutSectionDisplayFieldRows,
    resolveLayoutSectionOperatorProfile,
    type LayoutSectionDisplayFieldRow,
} from "@/lib/adminV2/layouts/layoutSectionOperatorUi";
import { operatorFieldDisplayLabel, type OperatorFieldRow } from "@/lib/fields/fieldSettingsOperatorUi";
import { normalizeSortOrdersInSection } from "@/lib/fields/fieldPlacementBatch";
import type { LayoutCompositionCapabilities } from "@/lib/adminV2/layouts/layoutCompositionCapabilities";
import {
    buildLayoutFieldBehaviorView,
    LAYOUT_FIELD_BEHAVIOR_HELPER,
    layoutFieldBehaviorControlsEnabled,
} from "@/lib/adminV2/layouts/layoutFieldBehaviorUi";
import LayoutFieldBehaviorControls from "@/components/adminV2/settings/LayoutFieldBehaviorControls";
import type { FieldPlacementV1 } from "@/lib/fields/fieldPlacementV1";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

type FieldRow = {
    id: string;
    field_key: string;
    label: string | null;
    section_key: string | null;
    sort_order: number;
    is_system: boolean;
    is_active?: boolean;
    is_visible_in_drawer?: boolean;
    is_required?: boolean;
    requirement_policy?: unknown | null;
    interaction_policy?: unknown | null;
};

export type LayoutSectionDetail = {
    section_key: string;
    kind: string;
    title: string;
    field_keys?: string[];
};

type CatalogSection = {
    id: string;
    section_key: string;
    label: string;
    is_archived?: boolean;
};

function move<T>(arr: T[], index: number, delta: number): T[] {
    const next = index + delta;
    if (next < 0 || next >= arr.length) return arr;
    const copy = [...arr];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    return copy;
}

async function readApiError(res: Response): Promise<string> {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return typeof json.error === "string" && json.error.trim() ? json.error.trim() : `Request failed (${res.status})`;
}

function displayLabelForRow(entityType: string, row: LayoutSectionDisplayFieldRow): string {
    if (row.label?.trim()) return row.label.trim();
    return operatorFieldDisplayLabel(entityType, row as OperatorFieldRow);
}

export default function LayoutSectionFieldsPanel({
    entityType,
    section,
    capabilities,
    workflowV1Configured,
    layoutPlacements: layoutPlacementsProp,
    onSaved,
}: {
    entityType: string;
    section: LayoutSectionDetail | null;
    capabilities: LayoutCompositionCapabilities;
    workflowV1Configured: boolean;
    layoutPlacements?: FieldPlacementV1[];
    onSaved?: () => void;
}) {
    const { canMutate } = useAdminAuth();
    const [allFields, setAllFields] = useState<FieldRow[]>([]);
    const [catalogSections, setCatalogSections] = useState<CatalogSection[]>([]);
    const [localRows, setLocalRows] = useState<FieldRow[]>([]);
    const [sectionLabel, setSectionLabel] = useState("");
    const [labelSaving, setLabelSaving] = useState(false);
    const [pickFieldId, setPickFieldId] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveOk, setSaveOk] = useState(false);
    const [layoutPlacements, setLayoutPlacements] = useState<FieldPlacementV1[] | undefined>(undefined);

    const sectionProfile = useMemo(
        () =>
            section
                ? resolveLayoutSectionOperatorProfile(section.kind, section.section_key, {
                      previewFieldKeys: section.field_keys,
                  })
                : null,
        [section]
    );
    const fieldsAssignable = sectionProfile?.canAssignFields === true;
    const showLayoutBehavior = layoutFieldBehaviorControlsEnabled({
        entityType,
        workflowV1Configured,
        canMutate,
        isReadOnly: capabilities.isReadOnly,
        canConfigureFieldBehavior: sectionProfile?.canConfigureFieldBehavior === true,
    });
    const canEditPlacement =
        canMutate && capabilities.canAssignFields && fieldsAssignable && !capabilities.isReadOnly;

    const catalogRow = useMemo(
        () => catalogSections.find((s) => s.section_key === section?.section_key) ?? null,
        [catalogSections, section?.section_key]
    );

    const loadFields = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [fdRes, secRes] = await Promise.all([
                fetch(`/api/admin/field-definitions?entity_type=${encodeURIComponent(entityType)}`, {
                    cache: "no-store",
                }),
                fetch(`/api/admin/field-sections?entity_type=${encodeURIComponent(entityType)}`, {
                    cache: "no-store",
                }),
            ]);
            const fdJson = (await fdRes.json().catch(() => ({}))) as {
                field_definitions?: FieldRow[];
                error?: string;
            };
            const secJson = (await secRes.json().catch(() => ({}))) as {
                sections?: CatalogSection[];
                error?: string;
            };
            if (!fdRes.ok) throw new Error(fdJson.error ?? "Failed to load fields");
            if (!secRes.ok) throw new Error(secJson.error ?? "Failed to load sections");
            setAllFields(fdJson.field_definitions ?? []);
            setCatalogSections(
                (secJson.sections ?? []).map((s) => ({
                    id: String((s as { id?: string }).id ?? ""),
                    section_key: s.section_key,
                    label: s.label,
                    is_archived: s.is_archived,
                }))
            );
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [entityType]);

    const loadLayoutPlacements = useCallback(async () => {
        if (layoutPlacementsProp !== undefined || entityType !== "opportunity" || !workflowV1Configured) {
            return;
        }
        try {
            const res = await fetch("/api/admin/record-layouts/effective-preview?entity_type=opportunity", {
                cache: "no-store",
            });
            const json = (await res.json().catch(() => ({}))) as {
                field_placements_v1?: FieldPlacementV1[];
                error?: string;
            };
            if (!res.ok) return;
            setLayoutPlacements(json.field_placements_v1 ?? []);
        } catch {
            setLayoutPlacements(undefined);
        }
    }, [entityType, workflowV1Configured, layoutPlacementsProp]);

    useEffect(() => {
        void loadFields();
    }, [loadFields]);

    useEffect(() => {
        if (layoutPlacementsProp !== undefined) {
            setLayoutPlacements(layoutPlacementsProp);
            return;
        }
        void loadLayoutPlacements();
    }, [layoutPlacementsProp, loadLayoutPlacements]);

    useEffect(() => {
        if (section) {
            setSectionLabel(section.title);
        }
    }, [section?.section_key, section?.title]);

    const displayRows = useMemo(() => {
        if (!section) return [];
        return buildLayoutSectionDisplayFieldRows({
            entityType,
            sectionKey: section.section_key,
            sectionKind: section.kind,
            catalogFields: allFields,
            previewFieldKeys: section.field_keys,
        });
    }, [allFields, section, entityType]);

    const sectionFields = useMemo(() => {
        if (!section || sectionProfile?.fieldsPanelMode !== "custom_catalog") return [];
        return allFields
            .filter((f) => (f.section_key ?? "custom") === section.section_key)
            .filter((f) => isEligibleForLayoutFieldPicker(entityType, f))
            .sort((a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key));
    }, [allFields, section, entityType, sectionProfile?.fieldsPanelMode]);

    useEffect(() => {
        setLocalRows(sectionFields);
        setSaveOk(false);
        setSaveError(null);
        setPickFieldId("");
    }, [sectionFields, section?.section_key]);

    const layoutConfigForBehavior = useMemo((): RecordLayoutConfigJson | null => {
        if (!showLayoutBehavior) return null;
        return { field_placements_v1: layoutPlacements ?? [] };
    }, [showLayoutBehavior, layoutPlacements]);

    const dirty = useMemo(() => {
        return (
            JSON.stringify(
                sectionFields.map((r) => ({ id: r.id, section_key: r.section_key, sort_order: r.sort_order }))
            ) !==
            JSON.stringify(localRows.map((r) => ({ id: r.id, section_key: r.section_key, sort_order: r.sort_order })))
        );
    }, [sectionFields, localRows]);

    const { fieldsAvailableToAdd, pickerExcludedCount } = useMemo(() => {
        if (!section || !canEditPlacement) return { fieldsAvailableToAdd: [], pickerExcludedCount: 0 };
        const inSection = new Set(localRows.map((r) => r.id));
        const eligible = allFields.filter((f) => isEligibleForLayoutFieldPicker(entityType, f));
        const available = eligible
            .filter((f) => !inSection.has(f.id))
            .sort((a, b) =>
                operatorFieldDisplayLabel(entityType, a as OperatorFieldRow).localeCompare(
                    operatorFieldDisplayLabel(entityType, b as OperatorFieldRow)
                )
            );
        return {
            fieldsAvailableToAdd: available,
            pickerExcludedCount: allFields.length - eligible.length,
        };
    }, [allFields, localRows, section, entityType, canEditPlacement]);

    const savePlacement = async () => {
        if (!canEditPlacement || !section) return;
        setSaving(true);
        setSaveError(null);
        setSaveOk(false);
        try {
            const orderMap = normalizeSortOrdersInSection(localRows.map((r) => r.id));
            const inSectionUpdates = localRows.map((r) => ({
                id: r.id,
                section_key: section.section_key,
                sort_order: orderMap[r.id] ?? r.sort_order,
            }));
            const removedFromSection = sectionFields.filter((f) => !localRows.some((r) => r.id === f.id));
            const removedUpdates = removedFromSection.map((f) => ({
                id: f.id,
                section_key: "custom",
                sort_order: f.sort_order,
            }));
            const updates = [...inSectionUpdates, ...removedUpdates];
            const res = await fetch("/api/admin/field-definitions/batch-placement", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: entityType,
                    workflow_v1_configured: workflowV1Configured,
                    updates,
                }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            setSaveOk(true);
            await loadFields();
            onSaved?.();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const saveCatalogLabel = async () => {
        if (!canMutate || !catalogRow || !fieldsAssignable) return;
        const trimmed = sectionLabel.trim();
        if (!trimmed || trimmed === catalogRow.label) return;
        setLabelSaving(true);
        try {
            const res = await fetch(`/api/admin/field-sections/${catalogRow.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: trimmed }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            await loadFields();
            onSaved?.();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLabelSaving(false);
        }
    };

    const addExistingField = () => {
        if (!pickFieldId || !section) return;
        const field = allFields.find((f) => f.id === pickFieldId);
        if (!field) return;
        setLocalRows((prev) => [
            ...prev,
            {
                ...field,
                section_key: section.section_key,
                sort_order: (prev.length + 1) * 10,
            },
        ]);
        setPickFieldId("");
    };

    const removeFromLayout = (row: FieldRow, displayLabel: string) => {
        if (
            !window.confirm(
                `Remove "${displayLabel}" from this section on the layout?\n\nThe field definition is not deleted — it stays in Fields and moves to the default catalog group when you save.`
            )
        ) {
            return;
        }
        setLocalRows((prev) => prev.filter((r) => r.id !== row.id));
        setSaveOk(false);
        setSaveError(null);
    };

    if (!section) {
        return (
            <div className="rounded-lg border border-dashed border-alloy-forge/20 bg-white/60 px-3 py-8 text-center text-xs text-alloy-midnight/55">
                Select a section on the left to view details and arrange fields.
            </div>
        );
    }

    const isCustomCatalog = sectionProfile?.fieldsPanelMode === "custom_catalog";
    const rowsToRender = isCustomCatalog ? localRows : displayRows;
    const hasBehaviorRows = displayRows.some((r) => !r.displayOnly);

    return (
        <section className="rounded-lg border border-alloy-forge/12 bg-white/80 p-3" data-testid="layout-section-fields">
            <h3 className="text-sm font-semibold text-alloy-midnight">Section detail</h3>

            {sectionProfile?.sectionHint ? (
                <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/55">{sectionProfile.sectionHint}</p>
            ) : null}

            <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex flex-wrap gap-x-2">
                    <dt className="text-alloy-midnight/50">Section name</dt>
                    <dd className="min-w-0 flex-1 font-medium text-alloy-midnight">
                        {sectionProfile?.canRenameTitle && canMutate ? (
                            <input
                                value={sectionLabel}
                                onChange={(e) => setSectionLabel(e.target.value)}
                                onBlur={() => void saveCatalogLabel()}
                                disabled={labelSaving}
                                className="w-full rounded border border-[#e6e8ec] px-2 py-1 text-sm font-medium"
                            />
                        ) : (
                            section.title
                        )}
                    </dd>
                </div>
                <div className="flex flex-wrap gap-x-2 items-center">
                    <dt className="text-alloy-midnight/50">Type</dt>
                    <dd>
                        <span
                            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                sectionProfile?.operatorClass === "custom"
                                    ? "bg-alloy-pine/10 text-alloy-pine"
                                    : sectionProfile?.operatorClass === "header"
                                      ? "bg-alloy-blue/10 text-alloy-blue"
                                      : "bg-alloy-stone/15 text-alloy-midnight/60"
                            }`}
                        >
                            {sectionProfile?.operatorClassLabel}
                        </span>
                    </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                    <dt className="text-alloy-midnight/50">You can</dt>
                    <dd className="text-alloy-midnight/75">{sectionProfile?.capabilitySummary}</dd>
                </div>
            </dl>

            {sectionProfile?.actionsLinkHref && sectionProfile.actionsLinkLabel ? (
                <p className="mt-1.5 text-[10px] text-alloy-midnight/45">
                    <Link href={sectionProfile.actionsLinkHref} className="font-medium text-alloy-pine hover:underline">
                        {sectionProfile.actionsLinkLabel}
                    </Link>
                </p>
            ) : null}

            {loading ? <p className="mt-3 text-xs text-alloy-midnight/55">Loading fields…</p> : null}
            {error ? (
                <p className="mt-2 text-xs text-red-600" role="alert">
                    {error}
                </p>
            ) : null}

            <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                Fields in this section
            </h4>
            {isCustomCatalog ? (
                <p className="mt-0.5 text-[10px] text-alloy-midnight/45">
                    Remove from layout moves the field to the default catalog group — it does not delete the field
                    definition.
                </p>
            ) : sectionProfile?.fixedFieldsNote ? (
                <p className="mt-0.5 text-[10px] text-alloy-midnight/45">{sectionProfile.fixedFieldsNote}</p>
            ) : !fieldsAssignable ? (
                <p className="mt-0.5 text-[10px] text-alloy-midnight/45">
                    Add and remove catalog fields is not supported for this section.
                </p>
            ) : null}

            {!loading && rowsToRender.length === 0 ? (
                <p className="mt-1 text-xs text-alloy-midnight/55">
                    {canEditPlacement ? "No fields yet — add an existing field below." : "No fields listed for this section."}
                </p>
            ) : null}

            <ol className="mt-2 space-y-1.5">
                {(isCustomCatalog ? localRows : displayRows).map((row, i) => {
                    const displayRow = row as LayoutSectionDisplayFieldRow & FieldRow;
                    const displayOnly = "displayOnly" in displayRow && displayRow.displayOnly === true;
                    const displayLabel = isCustomCatalog
                        ? operatorFieldDisplayLabel(entityType, row as OperatorFieldRow)
                        : displayLabelForRow(entityType, displayRow);
                    const behaviorView =
                        showLayoutBehavior && !displayOnly
                            ? buildLayoutFieldBehaviorView(row, layoutConfigForBehavior)
                            : null;
                    return (
                        <li
                            key={row.id}
                            className="rounded border border-admin-border/50 px-2 py-1.5 text-xs"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="w-5 text-[10px] text-alloy-midnight/40">{i + 1}</span>
                                <span className="min-w-0 flex-1 font-medium text-alloy-midnight">{displayLabel}</span>
                                {displayOnly ? (
                                    <span className="text-[10px] text-alloy-midnight/45" title={displayRow.displayOnlyReason}>
                                        Fixed
                                    </span>
                                ) : canEditPlacement ? (
                                    <span className="flex gap-0.5">
                                        <button
                                            type="button"
                                            className="rounded border border-admin-border px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                                            disabled={i === 0 || saving}
                                            onClick={() => setLocalRows((prev) => move(prev, i, -1))}
                                        >
                                            Up
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded border border-admin-border px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                                            disabled={i >= localRows.length - 1 || saving}
                                            onClick={() => setLocalRows((prev) => move(prev, i, 1))}
                                        >
                                            Down
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded border border-admin-border px-1.5 py-0.5 text-[10px] text-alloy-midnight/55 hover:bg-alloy-stone/10"
                                            disabled={saving}
                                            title="Remove from this section on the layout (field definition stays in Fields)"
                                            onClick={() => removeFromLayout(row as FieldRow, displayLabel)}
                                        >
                                            Remove from layout
                                        </button>
                                    </span>
                                ) : null}
                            </div>
                            {behaviorView ? (
                                <LayoutFieldBehaviorControls
                                    fieldKey={row.field_key}
                                    displayLabel={displayLabel}
                                    view={behaviorView}
                                    disabled={!canMutate}
                                    onPlacementsSaved={(placements) => {
                                        if (placements) setLayoutPlacements(placements);
                                        onSaved?.();
                                    }}
                                />
                            ) : displayOnly ? (
                                <p className="mt-1 text-[10px] text-alloy-midnight/40">Fixed on this drawer.</p>
                            ) : null}
                        </li>
                    );
                })}
            </ol>

            {canEditPlacement && fieldsAvailableToAdd.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-alloy-forge/15 bg-alloy-stone/[0.02] px-2 py-2">
                    <div className="min-w-0 flex-1">
                        <label className="mb-0.5 block text-[10px] font-medium text-alloy-midnight/55">
                            Move existing field here
                        </label>
                        <select
                            value={pickFieldId}
                            onChange={(e) => setPickFieldId(e.target.value)}
                            className="w-full rounded border border-[#e6e8ec] px-2 py-1 text-xs"
                        >
                            <option value="">Choose a field…</option>
                            {fieldsAvailableToAdd.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {operatorFieldDisplayLabel(entityType, f as OperatorFieldRow)}
                                    {f.section_key ? ` (currently: ${f.section_key})` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        disabled={!pickFieldId || saving}
                        className="rounded-lg border border-alloy-pine/40 px-2.5 py-1 text-xs font-medium text-alloy-pine disabled:opacity-45"
                        onClick={addExistingField}
                    >
                        Add to section
                    </button>
                </div>
            ) : null}

            {canEditPlacement && pickerExcludedCount > 0 ? (
                <p className="mt-2 text-[10px] text-alloy-midnight/45">
                    {pickerExcludedCount} field{pickerExcludedCount === 1 ? "" : "s"} not shown here because they are
                    inactive, hidden from the drawer, or reserved for system use. Edit them on Fields.
                </p>
            ) : null}

            {canEditPlacement && dirty ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={saving}
                        className="rounded-lg bg-alloy-pine px-3 py-1 text-xs font-medium text-white disabled:opacity-45"
                        onClick={() => void savePlacement()}
                    >
                        {saving ? "Saving field order…" : "Save field order"}
                    </button>
                    <button
                        type="button"
                        className="text-xs text-alloy-pine hover:underline"
                        onClick={() => {
                            setLocalRows(sectionFields);
                            setSaveError(null);
                            setSaveOk(false);
                        }}
                    >
                        Undo changes
                    </button>
                </div>
            ) : null}
            {saveError ? (
                <p className="mt-1 text-[10px] font-medium text-red-600" role="alert">
                    Could not save field order: {saveError}
                </p>
            ) : null}
            {saveOk ? (
                <p className="mt-1 text-[10px] font-medium text-alloy-pine">Field order saved for this section.</p>
            ) : null}
            {canEditPlacement && dirty && !saving ? (
                <p className="mt-1 text-[10px] text-amber-800/80">Unsaved field order — save or undo before leaving.</p>
            ) : null}

            {showLayoutBehavior && hasBehaviorRows ? (
                <p className="mt-3 text-[10px] text-alloy-midnight/45">{LAYOUT_FIELD_BEHAVIOR_HELPER}</p>
            ) : (
                <p className="mt-3 text-[10px] text-alloy-midnight/45">
                    Create new fields on{" "}
                    <Link href="/admin/settings/fields" className="font-medium text-alloy-pine hover:underline">
                        Fields
                    </Link>
                    .
                </p>
            )}
        </section>
    );
}
