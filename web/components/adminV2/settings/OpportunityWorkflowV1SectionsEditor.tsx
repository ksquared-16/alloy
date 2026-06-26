"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { uniqueAdminKey } from "@/lib/admin/slugifyAdminKey";
import {
    isLayoutDrawerHeaderSection,
    layoutEditorRowsForPersist,
    resolveLayoutSectionOperatorProfile,
    withDrawerHeaderEditorSection,
} from "@/lib/adminV2/layouts/layoutSectionOperatorUi";
import LegacyWorkflowV1LayoutEditorBanner, {
    useLegacyOpportunityDrawerLayoutReadOnly,
} from "@/components/adminV2/settings/LegacyWorkflowV1LayoutEditorBanner";
import type { FieldPlacementV1 } from "@/lib/fields/fieldPlacementV1";

type EditorSection = {
    section_key: string;
    title: string;
    kind: string;
    visible: boolean;
    title_editable: boolean;
};

export type LayoutPreviewBundle = {
    entity_type: string;
    workflow: { workflow_v1_configured: boolean };
    layout_resolution?: { source?: string };
    editor_sections?: EditorSection[];
    overview_hidden_sections?: string[];
    sections?: Array<{ section_key: string; title: string; kind: string; field_keys?: string[] }>;
    field_placements_v1?: FieldPlacementV1[];
};

type SectionRowState = {
    section_key: string;
    title: string;
    kind: string;
    visible: boolean;
    titleEditable: boolean;
};

const SECTION_KEY_REGEX = /^[a-z0-9_]{2,64}$/;

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

function editorRowsFromBundle(bundle: LayoutPreviewBundle): SectionRowState[] {
    return withDrawerHeaderEditorSection(
        (bundle.editor_sections ?? []).map((s) => ({
            section_key: s.section_key,
            title: s.title,
            kind: s.kind,
            visible: s.visible,
            titleEditable: s.title_editable,
        }))
    );
}

export default function OpportunityWorkflowV1SectionsEditor({
    onSaved,
    embedded = false,
    selectedSectionKey = null,
    onSelectSection,
    previewBundle = undefined,
    bundleLoading = false,
}: {
    onSaved?: () => void;
    embedded?: boolean;
    selectedSectionKey?: string | null;
    onSelectSection?: (sectionKey: string) => void;
    /** Parent-owned preview payload — avoids duplicate fetch and selection flicker. */
    previewBundle?: LayoutPreviewBundle | null;
    bundleLoading?: boolean;
}) {
    const { canMutate } = useAdminAuth();
    const legacyLayoutReadOnly = useLegacyOpportunityDrawerLayoutReadOnly();
    const canEditLayout = canMutate && !legacyLayoutReadOnly;
    const useParentBundle = previewBundle !== undefined;
    const initialSelectDone = useRef(false);
    const [loading, setLoading] = useState(!useParentBundle);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<LayoutPreviewBundle | null>(previewBundle ?? null);
    const [initialRows, setInitialRows] = useState<SectionRowState[]>([]);
    const [rows, setRows] = useState<SectionRowState[]>([]);
    const [hiddenCatalog, setHiddenCatalog] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveOk, setSaveOk] = useState<string | null>(null);
    const [restoreKey, setRestoreKey] = useState("");
    const [newSectionLabel, setNewSectionLabel] = useState("");
    const [addingSection, setAddingSection] = useState(false);
    const [addSectionError, setAddSectionError] = useState<string | null>(null);

    const applyBundle = useCallback(
        (bundle: LayoutPreviewBundle) => {
            const editorRows = editorRowsFromBundle(bundle);
            setPreview(bundle);
            setHiddenCatalog(bundle.overview_hidden_sections ?? []);
            setInitialRows(editorRows);
            setRows(editorRows);
            if (!initialSelectDone.current && !selectedSectionKey && editorRows[0]) {
                onSelectSection?.(editorRows[0].section_key);
                initialSelectDone.current = true;
            }
        },
        [onSelectSection, selectedSectionKey]
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/record-layouts/effective-preview?entity_type=opportunity");
            const json = (await res.json().catch(() => ({}))) as LayoutPreviewBundle & { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to load layout preview");
            applyBundle(json);
        } catch (e) {
            setError((e as Error).message);
            setPreview(null);
        } finally {
            setLoading(false);
        }
    }, [applyBundle]);

    useEffect(() => {
        if (!useParentBundle) {
            void load();
            return;
        }
        if (previewBundle) {
            applyBundle(previewBundle);
            setError(null);
        }
    }, [useParentBundle, previewBundle, load, applyBundle]);

    const eligible = preview?.workflow?.workflow_v1_configured === true && preview.entity_type === "opportunity";

    /** Sections hidden from this drawer layout (overview_hidden_sections), not every catalog group. */
    const restorableHiddenKeys = useMemo(() => {
        return hiddenCatalog.filter((k) => {
            const row = rows.find((r) => r.section_key === k);
            return !row || !row.visible;
        });
    }, [hiddenCatalog, rows]);

    const dirty = useMemo(() => JSON.stringify(initialRows) !== JSON.stringify(rows), [initialRows, rows]);

    const persistRows = async (nextRows: SectionRowState[]) => {
        const res = await fetch("/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                overview_section_order: layoutEditorRowsForPersist(nextRows).map((r) => r.section_key),
                section_visibility: layoutEditorRowsForPersist(nextRows).map((r) => ({
                    section_key: r.section_key,
                    visible: r.visible,
                })),
                workflow_section_titles: layoutEditorRowsForPersist(nextRows)
                    .filter((r) => r.titleEditable)
                    .map((r) => ({ section_key: r.section_key, title: r.title })),
            }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; created_org_override?: boolean };
        if (!res.ok) throw new Error(json.error ?? "Save failed");
        return json;
    };

    const save = async () => {
        if (!canEditLayout || !eligible) return;
        setSaving(true);
        setSaveError(null);
        setSaveOk(null);
        try {
            const json = await persistRows(layoutEditorRowsForPersist(rows));
            setSaveOk(json.created_org_override ? "Saved — created org drawer override." : "Saved.");
            onSaved?.();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const restoreHiddenSection = (key: string) => {
        const k = key.trim();
        if (!k) return;
        let nextRows: SectionRowState[];
        const existing = rows.find((r) => r.section_key === k);
        if (existing) {
            nextRows = rows.map((r) => (r.section_key === k ? { ...r, visible: true } : r));
        } else {
            nextRows = [
                ...rows,
                {
                    section_key: k,
                    title: k.replace(/_/g, " "),
                    kind: "field_section_ref",
                    visible: true,
                    titleEditable: false,
                },
            ];
        }
        setRows(nextRows);
        onSelectSection?.(k);
        setRestoreKey("");
    };

    const addSection = async () => {
        if (!canEditLayout || !eligible) return;
        const label = newSectionLabel.trim();
        if (!label) return;
        setAddingSection(true);
        setAddSectionError(null);
        try {
            const secRes = await fetch("/api/admin/field-sections?entity_type=opportunity", { cache: "no-store" });
            const secJson = (await secRes.json().catch(() => ({}))) as {
                sections?: { section_key: string }[];
            };
            const reserved = new Set((secJson.sections ?? []).map((s) => s.section_key));
            const section_key = uniqueAdminKey(label, reserved);
            if (!SECTION_KEY_REGEX.test(section_key)) {
                throw new Error("Could not derive a valid section key from label");
            }

            const postRes = await fetch("/api/admin/field-sections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: "opportunity",
                    section_key,
                    label,
                    sort_order: (reserved.size + 1) * 10,
                }),
            });
            if (!postRes.ok) throw new Error(await readApiError(postRes));

            const newRow: SectionRowState = {
                section_key,
                title: label,
                kind: "field_section_ref",
                visible: true,
                titleEditable: false,
            };

            const merged = rows.some((r) => r.section_key === section_key)
                ? rows.map((r) => (r.section_key === section_key ? { ...r, visible: true, title: label } : r))
                : [...rows, newRow];

            await persistRows(merged);
            setNewSectionLabel("");
            onSelectSection?.(section_key);
            onSaved?.();
        } catch (e) {
            setAddSectionError((e as Error).message);
        } finally {
            setAddingSection(false);
        }
    };

    const showListLoading = (useParentBundle ? bundleLoading : loading) && rows.length === 0;
    if (showListLoading) return <p className="text-xs text-alloy-midnight/55">Loading drawer sections…</p>;
    if (error) return <p className="text-xs text-red-600">{error}</p>;
    if (!eligible) {
        return (
            <div className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/65">
                Drawer section configuration is available when this organization uses the inquiry workflow drawer.
            </div>
        );
    }

    const shellClass = embedded ? "" : "rounded-xl border border-alloy-pine/25 bg-white/85 p-4 shadow-sm";

    return (
        <div className={shellClass} data-testid="opportunity-workflow-v1-sections-editor">
            <LegacyWorkflowV1LayoutEditorBanner />
            {!embedded ? (
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h2 className="text-sm font-semibold text-alloy-midnight">Drawer sections</h2>
                        <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                            Reorder sections and choose which appear in the drawer. Select a section to manage its fields.
                        </p>
                    </div>
                    {preview?.layout_resolution?.source === "global_template" ? (
                        <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950">
                            First save creates an org override
                        </span>
                    ) : null}
                </div>
            ) : null}

            {canEditLayout ? (
                <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-alloy-pine/25 bg-alloy-pine/[0.03] px-3 py-2">
                    <div className="min-w-[10rem] flex-1">
                        <label className="mb-0.5 block text-[10px] font-medium text-alloy-midnight/55">Add section</label>
                        <input
                            value={newSectionLabel}
                            onChange={(e) => setNewSectionLabel(e.target.value)}
                            placeholder="Section name"
                            className="w-full rounded border border-alloy-stone/40 px-2 py-1 text-xs"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void addSection();
                            }}
                        />
                    </div>
                    <button
                        type="button"
                        disabled={!newSectionLabel.trim() || addingSection || saving}
                        className="rounded-lg bg-alloy-pine px-2.5 py-1 text-xs font-medium text-white disabled:opacity-45"
                        onClick={() => void addSection()}
                    >
                        {addingSection ? "Adding…" : "Add section"}
                    </button>
                </div>
            ) : null}
            {addSectionError ? <p className="mb-2 text-xs text-red-600">{addSectionError}</p> : null}

            {restorableHiddenKeys.length > 0 && canEditLayout ? (
                <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.03] px-3 py-2">
                    <div>
                        <label className="mb-0.5 block text-[10px] font-medium text-alloy-midnight/55">
                            Restore hidden section
                        </label>
                        <select
                            value={restoreKey}
                            onChange={(e) => setRestoreKey(e.target.value)}
                            className="rounded border border-alloy-stone/40 px-2 py-1 text-xs"
                        >
                            <option value="">Choose hidden section…</option>
                            {restorableHiddenKeys.map((k) => {
                                const row = rows.find((r) => r.section_key === k);
                                const label = row?.title ?? k.replace(/_/g, " ");
                                return (
                                    <option key={k} value={k}>
                                        {label}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                    <button
                        type="button"
                        disabled={!restoreKey || saving}
                        className="rounded-lg border border-alloy-pine/40 px-2.5 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/5 disabled:opacity-45"
                        onClick={() => restoreHiddenSection(restoreKey)}
                    >
                        Restore to list
                    </button>
                </div>
            ) : null}

            {saveError ? <p className="mt-2 text-xs text-red-600">{saveError}</p> : null}
            {saveOk ? <p className="mt-2 text-xs text-alloy-pine">{saveOk}</p> : null}

            <ol className="space-y-2">
                {rows.map((row, i) => {
                    const profile = resolveLayoutSectionOperatorProfile(row.kind, row.section_key, {
                        titleEditable: row.titleEditable,
                    });
                    const headerRow = isLayoutDrawerHeaderSection(row.section_key);
                    return (
                    <li
                        key={row.section_key}
                        role="button"
                        tabIndex={0}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                            selectedSectionKey === row.section_key
                                ? "border-alloy-pine/50 bg-alloy-pine/5 ring-1 ring-alloy-pine/25"
                                : "border-alloy-forge/12 bg-white"
                        } cursor-pointer hover:border-alloy-pine/30`}
                        data-testid={`layout-section-row-${row.section_key}`}
                        onClick={() => onSelectSection?.(row.section_key)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectSection?.(row.section_key);
                            }
                        }}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-6 text-[10px] text-alloy-midnight/45">{i + 1}</span>
                            {row.titleEditable && canEditLayout ? (
                                <input
                                    type="text"
                                    value={row.title}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) =>
                                        setRows((prev) =>
                                            prev.map((r) =>
                                                r.section_key === row.section_key ? { ...r, title: e.target.value } : r
                                            )
                                        )
                                    }
                                    className="min-w-[8rem] flex-1 rounded border border-alloy-stone/40 px-2 py-1 text-sm font-medium"
                                />
                            ) : (
                                <span className="min-w-0 flex-1 font-medium text-alloy-midnight">{row.title}</span>
                            )}
                            {profile.canShowHide ? (
                                <label
                                    className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/65"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <input
                                        type="checkbox"
                                        checked={row.visible}
                                        disabled={!canEditLayout || saving}
                                        onChange={(e) =>
                                            setRows((prev) =>
                                                prev.map((r) =>
                                                    r.section_key === row.section_key
                                                        ? { ...r, visible: e.target.checked }
                                                        : r
                                                )
                                            )
                                        }
                                    />
                                    Show in drawer
                                </label>
                            ) : null}
                            {canEditLayout && profile.canReorder ? (
                                <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        className="rounded border border-alloy-forge/12 px-2 py-0.5 text-[11px] hover:bg-alloy-stone/15 disabled:opacity-40"
                                        disabled={i === 0 || saving || headerRow}
                                        onClick={() => setRows((prev) => move(prev, i, -1))}
                                    >
                                        Up
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded border border-alloy-forge/12 px-2 py-0.5 text-[11px] hover:bg-alloy-stone/15 disabled:opacity-40"
                                        disabled={i >= rows.length - 1 || saving || headerRow}
                                        onClick={() => setRows((prev) => move(prev, i, 1))}
                                    >
                                        Down
                                    </button>
                                </span>
                            ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-8">
                            <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    profile.operatorClass === "custom"
                                        ? "bg-alloy-pine/10 text-alloy-pine"
                                        : profile.operatorClass === "header"
                                          ? "bg-alloy-pine/10 text-alloy-pine"
                                          : "bg-alloy-stone/15 text-alloy-midnight/55"
                                }`}
                            >
                                {profile.operatorClassLabel}
                            </span>
                            {!row.visible && profile.canShowHide ? (
                                <span className="text-[10px] text-alloy-midnight/45">Hidden from drawer</span>
                            ) : null}
                        </div>
                        {profile.sectionHint ? (
                            <p className="mt-0.5 pl-8 text-[10px] text-alloy-midnight/45">{profile.sectionHint}</p>
                        ) : (
                            <p className="mt-0.5 pl-8 text-[10px] text-alloy-midnight/40">{profile.capabilitySummary}</p>
                        )}
                    </li>
                    );
                })}
            </ol>

            {canEditLayout ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!dirty || saving}
                        className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45"
                        onClick={() => void save()}
                    >
                        {saving ? "Saving…" : "Save sections"}
                    </button>
                    {!useParentBundle ? (
                        <button
                            type="button"
                            disabled={saving}
                            className="rounded-lg border border-transparent px-3 py-1.5 text-xs text-alloy-pine hover:underline"
                            onClick={() => void load()}
                        >
                            Reload
                        </button>
                    ) : null}
                </div>
            ) : (
                <p className="mt-3 text-[11px] text-alloy-midnight/55">Admin role required to save section configuration.</p>
            )}
        </div>
    );
}
