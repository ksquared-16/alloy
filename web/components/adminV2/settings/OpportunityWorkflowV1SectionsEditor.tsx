"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

type EditorSection = {
    section_key: string;
    title: string;
    kind: string;
    visible: boolean;
    title_editable: boolean;
};

type PreviewPayload = {
    entity_type: string;
    workflow: { workflow_v1_configured: boolean };
    layout_resolution?: { source?: string };
    editor_sections?: EditorSection[];
    overview_hidden_sections?: string[];
};

type SectionRowState = {
    section_key: string;
    title: string;
    kind: string;
    visible: boolean;
    titleEditable: boolean;
};

function move<T>(arr: T[], index: number, delta: number): T[] {
    const next = index + delta;
    if (next < 0 || next >= arr.length) return arr;
    const copy = [...arr];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    return copy;
}

export default function OpportunityWorkflowV1SectionsEditor({ onSaved }: { onSaved?: () => void }) {
    const { canMutate } = useAdminAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<PreviewPayload | null>(null);
    const [initialRows, setInitialRows] = useState<SectionRowState[]>([]);
    const [rows, setRows] = useState<SectionRowState[]>([]);
    const [hiddenCatalog, setHiddenCatalog] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveOk, setSaveOk] = useState<string | null>(null);
    const [addKey, setAddKey] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setSaveOk(null);
        try {
            const res = await fetch("/api/admin/record-layouts/effective-preview?entity_type=opportunity");
            const json = (await res.json().catch(() => ({}))) as PreviewPayload & { error?: string };
            if (!res.ok) throw new Error(json.error ?? "Failed to load layout preview");

            const editorRows: SectionRowState[] = (json.editor_sections ?? []).map((s) => ({
                section_key: s.section_key,
                title: s.title,
                kind: s.kind,
                visible: s.visible,
                titleEditable: s.title_editable,
            }));

            setPreview(json);
            setHiddenCatalog(json.overview_hidden_sections ?? []);
            setInitialRows(editorRows);
            setRows(editorRows);
        } catch (e) {
            setError((e as Error).message);
            setPreview(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const eligible = preview?.workflow?.workflow_v1_configured === true && preview.entity_type === "opportunity";

    const availableToShow = useMemo(() => {
        return hiddenCatalog.filter((k) => !rows.some((r) => r.section_key === k));
    }, [hiddenCatalog, rows]);

    const dirty = useMemo(() => {
        return JSON.stringify(initialRows) !== JSON.stringify(rows);
    }, [initialRows, rows]);

    const addHiddenSection = () => {
        const key = addKey.trim();
        if (!key || !availableToShow.includes(key)) return;
        setRows((prev) => [
            ...prev,
            {
                section_key: key,
                title: key.replace(/_/g, " "),
                kind: "field_section_ref",
                visible: true,
                titleEditable: false,
            },
        ]);
        setAddKey("");
    };

    const save = async () => {
        if (!canMutate || !eligible) return;
        setSaving(true);
        setSaveError(null);
        setSaveOk(null);
        try {
            const res = await fetch("/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    overview_section_order: rows.map((r) => r.section_key),
                    section_visibility: rows.map((r) => ({
                        section_key: r.section_key,
                        visible: r.visible,
                    })),
                    workflow_section_titles: rows
                        .filter((r) => r.titleEditable)
                        .map((r) => ({ section_key: r.section_key, title: r.title })),
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { error?: string; created_org_override?: boolean };
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            setSaveOk(json.created_org_override ? "Saved — created org drawer override." : "Saved.");
            await load();
            onSaved?.();
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p className="text-xs text-alloy-midnight/55">Loading drawer sections…</p>;
    if (error) return <p className="text-xs text-red-600">{error}</p>;
    if (!eligible) {
        return (
            <div className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/5 px-3 py-2 text-xs text-alloy-midnight/65">
                Drawer section configuration is available when this organization uses the inquiry workflow drawer.
            </div>
        );
    }

    return (
        <div
            className="rounded-xl border border-alloy-pine/25 bg-white/85 p-4 shadow-sm"
            data-testid="opportunity-workflow-v1-sections-editor"
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-semibold text-alloy-midnight">Drawer sections</h2>
                    <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                        Reorder, show or hide, and rename workflow sections. Field-group labels are on{" "}
                        <Link href="/adminV2/settings/field-sections" className="font-medium text-alloy-pine hover:underline">
                            Field grouping
                        </Link>
                        .
                    </p>
                </div>
                {preview?.layout_resolution?.source === "global_template" ? (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-950">
                        First save creates an org override
                    </span>
                ) : null}
            </div>

            {availableToShow.length > 0 && canMutate ? (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-alloy-forge/20 bg-alloy-stone/[0.03] px-3 py-2">
                    <div>
                        <label className="mb-0.5 block text-[10px] font-medium text-alloy-midnight/55">Add section</label>
                        <select
                            value={addKey}
                            onChange={(e) => setAddKey(e.target.value)}
                            className="rounded border border-[#e6e8ec] px-2 py-1 text-xs"
                        >
                            <option value="">Choose hidden section…</option>
                            {availableToShow.map((k) => (
                                <option key={k} value={k}>
                                    {k.replace(/_/g, " ")}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        disabled={!addKey || saving}
                        className="rounded-lg border border-alloy-pine/40 px-2.5 py-1 text-xs font-medium text-alloy-pine hover:bg-alloy-pine/5 disabled:opacity-45"
                        onClick={addHiddenSection}
                    >
                        Show in drawer
                    </button>
                </div>
            ) : null}

            {saveError ? <p className="mt-2 text-xs text-red-600">{saveError}</p> : null}
            {saveOk ? <p className="mt-2 text-xs text-alloy-pine">{saveOk}</p> : null}

            <ol className="mt-3 space-y-2">
                {rows.map((row, i) => (
                    <li
                        key={row.section_key}
                        className="rounded-lg border border-admin-border/60 bg-white px-3 py-2 text-xs"
                        data-testid={`layout-section-row-${row.section_key}`}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-6 text-[10px] text-alloy-midnight/45">{i + 1}</span>
                            {row.titleEditable && canMutate ? (
                                <input
                                    type="text"
                                    value={row.title}
                                    onChange={(e) =>
                                        setRows((prev) =>
                                            prev.map((r) =>
                                                r.section_key === row.section_key ? { ...r, title: e.target.value } : r
                                            )
                                        )
                                    }
                                    className="min-w-[8rem] flex-1 rounded border border-[#e6e8ec] px-2 py-1 text-sm font-medium"
                                />
                            ) : (
                                <span className="min-w-0 flex-1 font-medium text-alloy-midnight">{row.title}</span>
                            )}
                            <label className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/65">
                                <input
                                    type="checkbox"
                                    checked={row.visible}
                                    disabled={!canMutate || saving}
                                    onChange={(e) =>
                                        setRows((prev) =>
                                            prev.map((r) =>
                                                r.section_key === row.section_key ? { ...r, visible: e.target.checked } : r
                                            )
                                        )
                                    }
                                />
                                Show in drawer
                            </label>
                            {canMutate ? (
                                <span className="flex gap-1">
                                    <button
                                        type="button"
                                        className="rounded border border-admin-border px-2 py-0.5 text-[11px] hover:bg-alloy-stone/15 disabled:opacity-40"
                                        disabled={i === 0 || saving}
                                        onClick={() => setRows((prev) => move(prev, i, -1))}
                                    >
                                        Up
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded border border-admin-border px-2 py-0.5 text-[11px] hover:bg-alloy-stone/15 disabled:opacity-40"
                                        disabled={i >= rows.length - 1 || saving}
                                        onClick={() => setRows((prev) => move(prev, i, 1))}
                                    >
                                        Down
                                    </button>
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-1 pl-8 text-[10px] text-alloy-midnight/45">
                            {row.kind === "workflow_virtual" ? "Workflow section" : "Field group section"}
                            {!row.visible ? " · Hidden in drawer" : ""}
                        </p>
                    </li>
                ))}
            </ol>

            {canMutate ? (
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!dirty || saving}
                        className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-45"
                        onClick={() => void save()}
                    >
                        {saving ? "Saving…" : "Save sections"}
                    </button>
                    <button
                        type="button"
                        disabled={saving}
                        className="rounded-lg border border-transparent px-3 py-1.5 text-xs text-alloy-pine hover:underline"
                        onClick={() => void load()}
                    >
                        Reload
                    </button>
                </div>
            ) : (
                <p className="mt-3 text-[11px] text-alloy-midnight/55">Admin role required to save section configuration.</p>
            )}
        </div>
    );
}
