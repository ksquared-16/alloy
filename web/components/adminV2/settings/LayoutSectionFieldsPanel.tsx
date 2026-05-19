"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { isEligibleForLayoutFieldPicker } from "@/lib/adminV2/layouts/layoutFieldPickerEligibility";
import {
    drawerSectionFieldsAssignable,
    drawerSectionFieldsHereLabel,
    drawerSectionTypeDetail,
    drawerSectionTypeLabel,
} from "@/lib/adminV2/layouts/sectionTypePresentation";
import { operatorFieldDisplayLabel, type OperatorFieldRow } from "@/lib/fields/fieldSettingsOperatorUi";
import { normalizeSortOrdersInSection } from "@/lib/fields/fieldPlacementBatch";
import type { LayoutCompositionCapabilities } from "@/lib/adminV2/layouts/layoutCompositionCapabilities";

type FieldRow = {
    id: string;
    field_key: string;
    label: string | null;
    section_key: string | null;
    sort_order: number;
    is_system: boolean;
    is_active?: boolean;
    is_visible_in_drawer?: boolean;
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

export default function LayoutSectionFieldsPanel({
    entityType,
    section,
    capabilities,
    workflowV1Configured,
    onSaved,
}: {
    entityType: string;
    section: LayoutSectionDetail | null;
    capabilities: LayoutCompositionCapabilities;
    workflowV1Configured: boolean;
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

    const fieldsAssignable = section ? drawerSectionFieldsAssignable(section.kind) : false;
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

    useEffect(() => {
        void loadFields();
    }, [loadFields]);

    useEffect(() => {
        if (section) {
            setSectionLabel(section.title);
        }
    }, [section?.section_key, section?.title]);

    const sectionFields = useMemo(() => {
        if (!section) return [];
        if (section.kind === "field_section_ref") {
            return allFields
                .filter((f) => (f.section_key ?? "custom") === section.section_key)
                .filter((f) => isEligibleForLayoutFieldPicker(entityType, f))
                .sort((a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key));
        }
        const keys = new Set(section.field_keys ?? []);
        return allFields
            .filter((f) => keys.has(f.field_key))
            .filter((f) => isEligibleForLayoutFieldPicker(entityType, f))
            .sort((a, b) => a.sort_order - b.sort_order || a.field_key.localeCompare(b.field_key));
    }, [allFields, section, entityType]);

    useEffect(() => {
        setLocalRows(sectionFields);
        setSaveOk(false);
        setSaveError(null);
        setPickFieldId("");
    }, [sectionFields, section?.section_key]);

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

    const removeFromSection = (fieldId: string) => {
        setLocalRows((prev) => prev.filter((r) => r.id !== fieldId));
    };

    if (!section) {
        return (
            <div className="rounded-lg border border-dashed border-alloy-forge/20 bg-white/60 px-3 py-8 text-center text-xs text-alloy-midnight/55">
                Select a section on the left to view details and arrange fields.
            </div>
        );
    }

    return (
        <section className="rounded-lg border border-alloy-forge/12 bg-white/80 p-3" data-testid="layout-section-fields">
            <h3 className="text-sm font-semibold text-alloy-midnight">Section detail</h3>

            <dl className="mt-2 space-y-1.5 text-xs">
                <div className="flex flex-wrap gap-x-2">
                    <dt className="text-alloy-midnight/50">Label</dt>
                    <dd className="min-w-0 flex-1 font-medium text-alloy-midnight">
                        {fieldsAssignable && canMutate ? (
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
                <div className="flex flex-wrap gap-x-2">
                    <dt className="text-alloy-midnight/50">Section key</dt>
                    <dd className="font-mono text-[11px] text-alloy-midnight/75">{section.section_key}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                    <dt className="text-alloy-midnight/50">Type</dt>
                    <dd>{drawerSectionTypeLabel(section.kind)}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                    <dt className="text-alloy-midnight/50">Fields here</dt>
                    <dd>{drawerSectionFieldsHereLabel(section.kind)}</dd>
                </div>
            </dl>

            <p className="mt-3 rounded-md border border-alloy-forge/10 bg-alloy-stone/[0.04] px-2.5 py-2 text-[11px] leading-snug text-alloy-midnight/65">
                {drawerSectionTypeDetail(section.kind)}
            </p>

            {loading ? <p className="mt-3 text-xs text-alloy-midnight/55">Loading fields…</p> : null}
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

            <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Fields in this section</h4>

            {!loading && localRows.length === 0 ? (
                <p className="mt-1 text-xs text-alloy-midnight/55">
                    {canEditPlacement ? "No fields yet — add an existing field below." : "No fields shown for this section."}
                </p>
            ) : null}

            <ol className="mt-2 space-y-1.5">
                {localRows.map((row, i) => (
                    <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-2 rounded border border-admin-border/50 px-2 py-1.5 text-xs"
                    >
                        <span className="w-5 text-[10px] text-alloy-midnight/40">{i + 1}</span>
                        <span className="min-w-0 flex-1 font-medium text-alloy-midnight">
                            {operatorFieldDisplayLabel(entityType, row as OperatorFieldRow)}
                        </span>
                        {canEditPlacement ? (
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
                                    onClick={() => removeFromSection(row.id)}
                                >
                                    Remove
                                </button>
                            </span>
                        ) : (
                            <span className="text-[10px] text-alloy-midnight/45">{row.field_key}</span>
                        )}
                    </li>
                ))}
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
                    {pickerExcludedCount} field{pickerExcludedCount === 1 ? "" : "s"} not shown here because they are inactive, hidden from the drawer, or reserved for system use. Edit them on Fields.
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
                        {saving ? "Saving…" : "Save fields"}
                    </button>
                    <button
                        type="button"
                        className="text-xs text-alloy-pine hover:underline"
                        onClick={() => setLocalRows(sectionFields)}
                    >
                        Reset
                    </button>
                </div>
            ) : null}
            {saveError ? <p className="mt-1 text-[10px] text-red-600">{saveError}</p> : null}
            {saveOk ? <p className="mt-1 text-[10px] text-alloy-pine">Saved.</p> : null}

            <p className="mt-3 text-[10px] text-alloy-midnight/45">
                To create new fields or edit policies, use{" "}
                <Link href="/adminV2/settings/fields" className="font-medium text-alloy-pine hover:underline">
                    Fields
                </Link>
                .
            </p>
        </section>
    );
}
