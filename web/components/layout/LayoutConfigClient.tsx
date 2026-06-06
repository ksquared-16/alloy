"use client";

/**
 * Layout Builder V1 — configure Lead drawer / queue layouts without JSON.
 *
 * FOUNDATION / PROOF surface only: nothing here changes how live drawers or
 * queues render. Lets a user add fields (Lead/Person/Child/Children Inquiry)
 * and widgets (Tasks, Reminders, Actions, Tour, Recent comms, Notes, Children
 * list), build sections with rows and 1/2/3-column placement, set light "show
 * when" conditions, save drafts, and publish — then see the proof page update.
 * The advanced JSON editor remains as an escape hatch.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import SectionCard from "@/components/admin/SectionCard";
import LayoutPreviewRenderer from "@/components/layout/LayoutPreviewRenderer";
import { isLayoutV2PreviewEnabledClient } from "@/lib/layout/featureFlag";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { entityTypeLabel, fetchEntityLabelMap, type EntityLabelMap } from "@/lib/layout/entityLabels";
import { LAYOUT_ADORNMENT_ICONS, LAYOUT_COLUMN_WIDTHS } from "@/lib/layout/layoutV2";
import type {
    EntityLayoutRecord,
    LayoutAdornmentActionEntity,
    LayoutAdornmentIcon,
    LayoutCollectionColumn,
    LayoutColumnWidth,
    LayoutCondition,
    LayoutDoc,
    LayoutFieldAdornment,
    LayoutItem,
    LayoutRenderHint,
} from "@/lib/layout/layoutV2";
import { ADORNMENT_ICON_GLYPH } from "@/lib/layout/adornmentIcons";
import type { LayoutCatalogField, LayoutCatalogWidget, LayoutEntityGroupKey } from "@/lib/layout/fieldCatalog";
import * as ops from "@/lib/layout/builderOps";

/** Display/render modes a user can pick per field or related-list column. */
const RENDER_MODES: { key: LayoutRenderHint; label: string }[] = [
    { key: "text", label: "Text" },
    { key: "status", label: "Pill (status)" },
    { key: "badge", label: "Badge (pill)" },
    { key: "date", label: "Date" },
    { key: "datetime", label: "Date + time" },
    { key: "money", label: "Money" },
    { key: "phone", label: "Phone" },
    { key: "link", label: "Link" },
];

/** Column width buckets (no raw CSS); shared by the related-list column editor. */
const WIDTH_OPTIONS: LayoutColumnWidth[] = [...LAYOUT_COLUMN_WIDTHS];

const ACTION_ENTITY_OPTIONS: { value: "" | LayoutAdornmentActionEntity; label: string }[] = [
    { value: "", label: "Icon only" },
    { value: "person", label: "Open person drawer" },
    { value: "child", label: "Open child drawer" },
    { value: "opportunity", label: "Open opportunity drawer" },
];

/** One grouped layout = all versions of a (org, entity, surface, layoutKey). */
type LayoutGroup = {
    key: string;
    entityType: string;
    surface: "drawer" | "queue";
    layoutKey: string;
    isDefault: boolean;
    primary: EntityLayoutRecord;
    versions: EntityLayoutRecord[];
};

/**
 * Collapse the flat record list into one row per (org, entity, surface, key).
 * `primary` is the latest published version, or the latest version otherwise —
 * so the list shows a single current row and the editor offers a version picker.
 */
function groupLayouts(records: EntityLayoutRecord[]): LayoutGroup[] {
    const map = new Map<string, EntityLayoutRecord[]>();
    for (const r of records) {
        const k = `${r.orgId ?? "default"}|${r.entityType}|${r.surface}|${r.layoutKey}`;
        const arr = map.get(k) ?? [];
        arr.push(r);
        map.set(k, arr);
    }
    const groups: LayoutGroup[] = [];
    for (const [key, arr] of map) {
        const versions = [...arr].sort((a, b) => b.version - a.version);
        const published = versions.filter((v) => v.status === "published");
        const primary = published[0] ?? versions[0];
        groups.push({
            key,
            entityType: primary.entityType,
            surface: primary.surface,
            layoutKey: primary.layoutKey,
            isDefault: primary.orgId === null,
            primary,
            versions,
        });
    }
    // Stable display order: drawer before queue, then by entity.
    return groups.sort((a, b) => a.surface.localeCompare(b.surface) || a.entityType.localeCompare(b.entityType));
}

type ListResponse = { records: EntityLayoutRecord[]; entityTypes: string[]; surfaces: ("drawer" | "queue")[] };
type CatalogResponse = {
    groups: { entityKey: LayoutEntityGroupKey; entityLabel: string; fields: LayoutCatalogField[] }[];
    widgets: LayoutCatalogWidget[];
};

type PickerTarget = { sIdx: number; rIdx: number; cIdx: number; group?: { itemId: string; gr: number; gc: number } } | null;

const CONDITION_PRESETS: { key: string; label: string; cond?: LayoutCondition }[] = [
    { key: "", label: "Always" },
    { key: "sec_contact", label: "If secondary contact exists", cond: { type: "exists", path: "person.secondary_contact_name" } },
    { key: "tour_exists", label: "If tour date exists", cond: { type: "exists", path: "opportunity.tour_date" } },
    { key: "tour_scheduled", label: "If tour = scheduled", cond: { type: "equals", path: "opportunity.tour_status", value: "scheduled" } },
];
function condKey(cond?: LayoutCondition): string {
    if (!cond) return "";
    return CONDITION_PRESETS.find((p) => p.cond && JSON.stringify(p.cond) === JSON.stringify(cond))?.key ?? "custom";
}

/** A fresh related-list (collection table) item with one starter column. */
function makeRelatedListItem(): LayoutItem {
    return {
        id: ops.makeId("item"),
        kind: "related_list",
        refKey: "children",
        label: "Related list",
        source: "children",
        displayMode: "table",
        related: { entityType: "child" },
        columns: [{ label: "Name", refKey: "child.name", width: "medium", renderHint: "text" }],
    };
}

function statusPill(status: string) {
    const isPub = status === "published";
    return (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isPub ? "border border-green-200 bg-green-50 text-green-700" : "border border-[#e6e8ec] bg-[#eef1f6] text-[#59678b]"}`}>
            {status}
        </span>
    );
}

export default function LayoutConfigClient({ adminV2Chrome = false }: { adminV2Chrome?: boolean } = {}) {
    const enabled = isLayoutV2PreviewEnabledClient();
    const [forbidden, setForbidden] = useState(false);
    const canMutate = !forbidden;

    const [list, setList] = useState<ListResponse | null>(null);
    const [labelMap, setLabelMap] = useState<EntityLabelMap>({});
    const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [workingDoc, setWorkingDoc] = useState<LayoutDoc | null>(null);
    const [workingName, setWorkingName] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("draft");
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);

    const [jsonText, setJsonText] = useState("");
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [showJson, setShowJson] = useState(false);

    const [picker, setPicker] = useState<PickerTarget>(null);
    const [pickerTab, setPickerTab] = useState<"field" | "widget">("field");
    const [pickerGroup, setPickerGroup] = useState<LayoutEntityGroupKey>("opportunity");

    const fetchList = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/entity-layouts");
            if (res.status === 401 || res.status === 403) {
                setForbidden(true);
                setError("You don't have access to layout configuration. Sign in with an admin account.");
                return;
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load layouts");
            setList(json as ListResponse);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        fetchList();
        fetchEntityLabelMap().then(setLabelMap).catch(() => {});
    }, [fetchList]);

    const applyDoc = useCallback((next: LayoutDoc) => {
        setWorkingDoc(next);
        setJsonText(JSON.stringify(next, null, 2));
        setJsonError(null);
        setDirty(true);
    }, []);

    const selectRecord = useCallback(async (id: string) => {
        setBusy("load");
        setPicker(null);
        try {
            const res = await fetch(`/api/admin/entity-layouts/${id}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load layout");
            const rec = json as EntityLayoutRecord;
            setSelectedId(rec.id);
            setWorkingDoc(rec.doc);
            setWorkingName(rec.name);
            setSelectedStatus(rec.status);
            setJsonText(JSON.stringify(rec.doc, null, 2));
            setJsonError(null);
            setDirty(false);
            setShowJson(false);
            fetch(`/api/admin/entity-layouts/field-catalog?entity_type=${encodeURIComponent(rec.entityType)}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((j) => setCatalog(j as CatalogResponse))
                .catch(() => setCatalog(null));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, []);

    const createDefault = useCallback(
        async (surface: "drawer" | "queue") => {
            if (!canMutate) return;
            setBusy(`create_${surface}`);
            try {
                const res = await fetch("/api/admin/entity-layouts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ entity_type: "opportunities", surface, from_registry: true, seed: "lead_default" }),
                });
                if (res.status === 401 || res.status === 403) {
                    setForbidden(true);
                    throw new Error("Admin access is required to create layouts.");
                }
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
                await fetchList();
                await selectRecord((json as EntityLayoutRecord).id);
            } catch (e) {
                setError((e as Error).message);
            } finally {
                setBusy(null);
            }
        },
        [canMutate, fetchList, selectRecord],
    );

    const saveDraft = useCallback(async () => {
        if (!canMutate || !selectedId || !workingDoc) return;
        if (showJson && jsonError) return;
        setBusy("save");
        try {
            const res = await fetch(`/api/admin/entity-layouts/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: workingName, doc: workingDoc }),
            });
            if (res.status === 401 || res.status === 403) {
                setForbidden(true);
                throw new Error("Admin access is required to save layouts.");
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            setDirty(false);
            await fetchList();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [canMutate, selectedId, workingDoc, workingName, showJson, jsonError, fetchList]);

    const publish = useCallback(async () => {
        if (!canMutate || !selectedId) return;
        setBusy("publish");
        try {
            if (dirty) await saveDraft();
            const res = await fetch(`/api/admin/entity-layouts/${selectedId}/publish`, { method: "POST" });
            if (res.status === 401 || res.status === 403) {
                setForbidden(true);
                throw new Error("Admin access is required to publish layouts.");
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Publish failed");
            setSelectedStatus("published");
            await fetchList();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [canMutate, selectedId, dirty, saveDraft, fetchList]);

    const removeLayout = useCallback(async () => {
        if (!canMutate || !selectedId) return;
        if (!confirm("Delete this layout version?")) return;
        setBusy("delete");
        try {
            const res = await fetch(`/api/admin/entity-layouts/${selectedId}`, { method: "DELETE" });
            if (res.status === 401 || res.status === 403) {
                setForbidden(true);
                throw new Error("Admin access is required to delete layouts.");
            }
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error((json as { error?: string }).error ?? "Delete failed");
            }
            setSelectedId(null);
            setWorkingDoc(null);
            await fetchList();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [canMutate, selectedId, fetchList]);

    const onJsonChange = useCallback((text: string) => {
        setJsonText(text);
        try {
            const parsed = parseLayoutDoc(JSON.parse(text));
            if (!parsed.ok || !parsed.doc) {
                setJsonError(parsed.errors.join("; ") || "Invalid layout doc");
                return;
            }
            setJsonError(parsed.warnings.length ? `OK (warnings: ${parsed.warnings.join("; ")})` : null);
            setWorkingDoc(parsed.doc);
            setDirty(true);
        } catch (e) {
            setJsonError(`JSON: ${(e as Error).message}`);
        }
    }, []);

    const isPublished = selectedStatus === "published";
    const editable = canMutate && !isPublished;

    // builder op wrappers
    const op = (next: LayoutDoc | null | undefined) => {
        if (next && next !== workingDoc) applyDoc(next);
    };

    const addCatalogField = (target: NonNullable<PickerTarget>, f: LayoutCatalogField) => {
        if (!workingDoc) return;
        const item = ops.makeFieldItem(f.refKey, f.fieldLabel, f.fieldType, f.entityKey);
        if (target.group) {
            op(ops.groupAddItem(workingDoc, { sIdx: target.sIdx, rIdx: target.rIdx, cIdx: target.cIdx, itemId: target.group.itemId }, target.group.gr, target.group.gc, item));
        } else {
            op(ops.addItem(workingDoc, target.sIdx, target.rIdx, target.cIdx, item));
        }
        setPicker(null);
    };
    const addCatalogWidget = (target: NonNullable<PickerTarget>, w: LayoutCatalogWidget) => {
        if (!workingDoc) return;
        const item = ops.makeWidgetItem(w.widgetKey, w.label, w.defaultDisplayMode);
        if (target.group) {
            op(ops.groupAddItem(workingDoc, { sIdx: target.sIdx, rIdx: target.rIdx, cIdx: target.cIdx, itemId: target.group.itemId }, target.group.gr, target.group.gc, item));
        } else {
            op(ops.addItem(workingDoc, target.sIdx, target.rIdx, target.cIdx, item));
        }
        setPicker(null);
    };

    // Flattened catalog fields for the inline "replace field" control.
    const catalogFields: LayoutCatalogField[] = (catalog?.groups ?? []).flatMap((g) => g.fields);
    const replaceField = (sIdx: number, rIdx: number, cIdx: number, itemId: string, f: LayoutCatalogField) => {
        if (!workingDoc) return;
        // Preserve placement, condition, adornment, editable — change the field only.
        op(ops.patchItem(workingDoc, sIdx, rIdx, cIdx, itemId, { refKey: f.refKey, label: f.fieldLabel, renderHint: ops.makeFieldItem(f.refKey, f.fieldLabel, f.fieldType).renderHint, sourceEntity: f.entityKey }));
    };

    /** Create an editable draft copy of the selected (e.g. published) layout. */
    const editAsDraft = useCallback(async () => {
        if (!canMutate || !selectedId || !workingDoc) return;
        const rec = list?.records.find((r) => r.id === selectedId);
        setBusy("editdraft");
        try {
            const res = await fetch("/api/admin/entity-layouts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entity_type: workingDoc.entityType,
                    surface: workingDoc.surface,
                    layout_key: rec?.layoutKey ?? "default",
                    name: workingName || rec?.name || "Layout",
                    doc: workingDoc,
                }),
            });
            if (res.status === 401 || res.status === 403) {
                setForbidden(true);
                throw new Error("Admin access is required to edit layouts.");
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Could not create draft");
            await fetchList();
            await selectRecord((json as EntityLayoutRecord).id);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [canMutate, selectedId, workingDoc, workingName, list, fetchList, selectRecord]);

    const groups = useMemo(() => (list ? groupLayouts(list.records) : []), [list]);
    const currentGroup = useMemo(
        () => groups.find((g) => g.versions.some((v) => v.id === selectedId)) ?? null,
        [groups, selectedId],
    );

    if (!enabled) {
        return (
            <>
                {adminV2Chrome ? null : <Header />}
                <p className="text-sm text-[#59678b]">Layout configuration is disabled for this environment.</p>
            </>
        );
    }

    return (
        <>
            {adminV2Chrome ? null : <Header />}

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                    <button className="ml-3 underline" onClick={() => setError(null)}>dismiss</button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                {/* Left: create + list */}
                <div className="flex flex-col gap-4">
                    <SectionCard title="New Lead layout">
                        {!canMutate ? (
                            <p className="text-sm text-[#59678b]">You have read-only access. Admin access is required to create layouts.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <button type="button" onClick={() => createDefault("drawer")} disabled={!!busy} className="rounded bg-[#2f6df6] px-3 py-2 text-sm font-medium text-white hover:bg-[#2a61dd] disabled:opacity-50">
                                    {busy === "create_drawer" ? "Creating…" : "New Leads drawer"}
                                </button>
                                <button type="button" onClick={() => createDefault("queue")} disabled={!!busy} className="rounded border border-[#2f6df6] px-3 py-2 text-sm font-medium text-[#2f6df6] hover:bg-[#f5f8ff] disabled:opacity-50">
                                    {busy === "create_queue" ? "Creating…" : "New Leads queue"}
                                </button>
                                <p className="text-[11px] text-[#9aa4bf]">Starts from the curated Lead default; edit and publish below.</p>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="Layouts">
                        {loading ? (
                            <p className="text-sm text-[#59678b]">Loading…</p>
                        ) : groups.length === 0 ? (
                            <p className="text-sm text-[#59678b]">No layouts yet. Create one above.</p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {groups.map((g) => {
                                    const selected = g.versions.some((v) => v.id === selectedId);
                                    const versionCount = g.versions.length;
                                    return (
                                        <li key={g.key}>
                                            <button type="button" onClick={() => selectRecord(g.primary.id)} className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-[#F4F6F9] ${selected ? "bg-[#eef1f6]" : ""}`}>
                                                <span className="min-w-0 truncate">
                                                    <span className="font-medium text-[#31394d]">{entityTypeLabel(labelMap, g.entityType)}</span>
                                                    <span className="ml-1 text-xs text-[#59678b]">
                                                        {g.surface}{g.isDefault ? " · default" : ""}
                                                        {versionCount > 1 ? ` · ${versionCount} versions` : ""}
                                                    </span>
                                                </span>
                                                {statusPill(g.primary.status)}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <p className="mt-2 text-[11px] text-[#9aa4bf]">One row per layout. Pick a version inside the builder.</p>
                    </SectionCard>
                </div>

                {/* Right: builder */}
                <div className="flex flex-col gap-4">
                    {!workingDoc ? (
                        <SectionCard title="Builder">
                            <p className="text-sm text-[#59678b]">Create or select a layout to start building.</p>
                        </SectionCard>
                    ) : (
                        <>
                            <SectionCard title="Builder">
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {statusPill(selectedStatus)}
                                        <span className="text-[11px] text-[#59678b]">{workingDoc.surface}</span>
                                        {currentGroup && currentGroup.versions.length > 0 && (
                                            <label className="flex items-center gap-1 text-[11px] text-[#59678b]">
                                                <span>Version:</span>
                                                <select
                                                    value={selectedId ?? ""}
                                                    onChange={(e) => { if (e.target.value && e.target.value !== selectedId) selectRecord(e.target.value); }}
                                                    disabled={busy === "load"}
                                                    title="View or edit a specific version of this layout"
                                                    className="rounded border border-[#e6e8ec] px-1.5 py-0.5 text-[11px]"
                                                >
                                                    {currentGroup.versions.map((v) => (
                                                        <option key={v.id} value={v.id}>
                                                            v{v.version} · {v.status}{v.id === currentGroup.primary.id ? " (current)" : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}
                                        {dirty && <span className="text-[11px] text-amber-600">unsaved changes</span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input value={workingName} onChange={(e) => { setWorkingName(e.target.value); setDirty(true); }} disabled={!editable} className="min-w-[200px] flex-1 rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#f4f6f9]" placeholder="Layout name" />
                                        <button type="button" onClick={saveDraft} disabled={!editable || busy === "save" || (showJson && !!jsonError)} className="rounded border border-[#e6e8ec] bg-white px-3 py-1.5 text-sm font-medium text-[#31394d] hover:bg-[#F4F6F9] disabled:opacity-50">{busy === "save" ? "Saving…" : "Save draft"}</button>
                                        <button type="button" onClick={publish} disabled={!editable || busy === "publish"} className="rounded bg-[#2f6df6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2a61dd] disabled:opacity-50">{busy === "publish" ? "Publishing…" : "Publish"}</button>
                                        <button type="button" onClick={removeLayout} disabled={!canMutate || busy === "delete"} className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Delete</button>
                                    </div>

                                    {isPublished && (
                                        <div className="flex flex-wrap items-center gap-2 rounded bg-[#f4f6f9] px-3 py-2 text-xs text-[#59678b]">
                                            <span>This published version is read-only.</span>
                                            <button type="button" onClick={editAsDraft} disabled={!canMutate || busy === "editdraft"} className="rounded bg-[#00458C] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#013a76] disabled:opacity-50">
                                                {busy === "editdraft" ? "Creating draft…" : "Edit a draft of this layout"}
                                            </button>
                                            <span className="text-[11px] text-[#9aa4bf]">(creates the next draft version of this same layout)</span>
                                        </div>
                                    )}

                                    {/* Sections */}
                                    {workingDoc.sections.map((s, sIdx) => (
                                        <div key={s.id} className="rounded-lg border border-[#e6e8ec] bg-white">
                                            <div className="flex flex-wrap items-center gap-2 border-b border-[#eef0f4] px-2 py-1.5">
                                                <input value={s.title} onChange={(e) => op(ops.patchSection(workingDoc, sIdx, { title: e.target.value }))} disabled={!editable} className="min-w-[150px] flex-1 rounded border border-[#e6e8ec] px-2 py-1 text-sm font-semibold disabled:bg-[#f4f6f9]" />
                                                {workingDoc.surface === "drawer" && (
                                                    <label className="flex items-center gap-1 text-[11px] text-[#59678b]">
                                                        <input type="checkbox" checked={Boolean(s.defaultExpanded)} disabled={!editable} onChange={(e) => op(ops.patchSection(workingDoc, sIdx, { defaultExpanded: e.target.checked }))} />
                                                        expanded
                                                    </label>
                                                )}
                                                <button type="button" onClick={() => op(ops.moveSection(workingDoc, sIdx, -1))} disabled={!editable || sIdx === 0} className="rounded border border-[#e6e8ec] px-1.5 text-sm disabled:opacity-40">↑</button>
                                                <button type="button" onClick={() => op(ops.moveSection(workingDoc, sIdx, 1))} disabled={!editable || sIdx === workingDoc.sections.length - 1} className="rounded border border-[#e6e8ec] px-1.5 text-sm disabled:opacity-40">↓</button>
                                                <button type="button" onClick={() => op(ops.removeSection(workingDoc, sIdx))} disabled={!editable} className="rounded border border-red-200 px-1.5 text-sm text-red-600 disabled:opacity-40" title="Delete section">✕</button>
                                            </div>

                                            <div className="flex flex-col gap-2 p-2">
                                                {s.rows.map((r, rIdx) => (
                                                    <div key={r.id} className="rounded border border-[#f0f2f6] p-2">
                                                        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-[#59678b]">
                                                            <span>Columns:</span>
                                                            {[1, 2, 3].map((n) => (
                                                                <button key={n} type="button" disabled={!editable} onClick={() => op(ops.setRowColumnCount(workingDoc, sIdx, rIdx, n))} className={`rounded border px-1.5 ${r.columns.length === n ? "border-[#2f6df6] bg-[#f5f8ff] text-[#2f6df6]" : "border-[#e6e8ec]"} disabled:opacity-40`}>{n}</button>
                                                            ))}
                                                            <span className="ml-auto flex items-center gap-1">
                                                                <button type="button" onClick={() => op(ops.moveRow(workingDoc, sIdx, rIdx, -1))} disabled={!editable || rIdx === 0} className="rounded border border-[#e6e8ec] px-1 disabled:opacity-40">↑</button>
                                                                <button type="button" onClick={() => op(ops.moveRow(workingDoc, sIdx, rIdx, 1))} disabled={!editable || rIdx === s.rows.length - 1} className="rounded border border-[#e6e8ec] px-1 disabled:opacity-40">↓</button>
                                                                <button type="button" onClick={() => op(ops.removeRow(workingDoc, sIdx, rIdx))} disabled={!editable} className="rounded border border-red-200 px-1 text-red-600 disabled:opacity-40">✕ row</button>
                                                            </span>
                                                        </div>
                                                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(12, minmax(0,1fr))` }}>
                                                            {r.columns.map((c, cIdx) => (
                                                                <div key={c.id} style={{ gridColumn: `span ${c.width} / span ${c.width}` }} className="flex flex-col gap-1 rounded bg-[#fbfcfe] p-1.5">
                                                                    {c.items.length === 0 && <p className="px-1 text-[10px] text-[#9aa4bf]">empty</p>}
                                                                    {c.items.map((it) =>
                                                                        it.kind === "field_group" ? (
                                                                            <GroupBlockEditor
                                                                                key={it.id}
                                                                                doc={workingDoc}
                                                                                loc={{ sIdx, rIdx, cIdx, itemId: it.id }}
                                                                                editable={editable}
                                                                                catalogFields={catalogFields}
                                                                                op={op}
                                                                                onMoveBlock={(dir) => op(ops.moveItemVertical(workingDoc, sIdx, rIdx, cIdx, it.id, dir))}
                                                                                onRemoveBlock={() => op(ops.removeItem(workingDoc, sIdx, rIdx, cIdx, it.id))}
                                                                                onRenameBlock={(t) => op(ops.patchItem(workingDoc, sIdx, rIdx, cIdx, it.id, { label: t }))}
                                                                                onAddToCell={(gr, gc) => { setPicker({ sIdx, rIdx, cIdx, group: { itemId: it.id, gr, gc } }); setPickerTab("field"); }}
                                                                            />
                                                                        ) : it.kind === "related_list" ? (
                                                                            <RelatedListEditor
                                                                                key={it.id}
                                                                                item={it}
                                                                                editable={editable}
                                                                                catalogFields={catalogFields}
                                                                                onMove={(dir) => op(ops.moveItemVertical(workingDoc, sIdx, rIdx, cIdx, it.id, dir))}
                                                                                onRemove={() => op(ops.removeItem(workingDoc, sIdx, rIdx, cIdx, it.id))}
                                                                                onPatchItem={(patch) => op(ops.patchItem(workingDoc, sIdx, rIdx, cIdx, it.id, patch))}
                                                                                onAddColumn={(col) => op(ops.relatedAddColumn(workingDoc, { sIdx, rIdx, cIdx, itemId: it.id }, col))}
                                                                                onRemoveColumn={(ci) => op(ops.relatedRemoveColumn(workingDoc, { sIdx, rIdx, cIdx, itemId: it.id }, ci))}
                                                                                onMoveColumn={(ci, dir) => op(ops.relatedMoveColumn(workingDoc, { sIdx, rIdx, cIdx, itemId: it.id }, ci, dir))}
                                                                                onPatchColumn={(ci, patch) => op(ops.relatedPatchColumn(workingDoc, { sIdx, rIdx, cIdx, itemId: it.id }, ci, patch))}
                                                                            />
                                                                        ) : (
                                                                            <ItemRow
                                                                                key={it.id}
                                                                                item={it}
                                                                                editable={editable}
                                                                                canLeft={cIdx > 0}
                                                                                canRight={cIdx < r.columns.length - 1}
                                                                                onUp={() => op(ops.moveItemVertical(workingDoc, sIdx, rIdx, cIdx, it.id, -1))}
                                                                                onDown={() => op(ops.moveItemVertical(workingDoc, sIdx, rIdx, cIdx, it.id, 1))}
                                                                                onLeft={() => op(ops.moveItemHorizontal(workingDoc, sIdx, rIdx, cIdx, it.id, -1))}
                                                                                onRight={() => op(ops.moveItemHorizontal(workingDoc, sIdx, rIdx, cIdx, it.id, 1))}
                                                                                onRemove={() => op(ops.removeItem(workingDoc, sIdx, rIdx, cIdx, it.id))}
                                                                                onCondition={(cond) => op(ops.setItemCondition(workingDoc, sIdx, rIdx, cIdx, it.id, cond))}
                                                                                onAdornment={(a) => op(ops.setItemAdornment(workingDoc, sIdx, rIdx, cIdx, it.id, a))}
                                                                                onPatch={(patch) => op(ops.patchItem(workingDoc, sIdx, rIdx, cIdx, it.id, patch))}
                                                                                catalogFields={catalogFields}
                                                                                onReplaceField={(f) => replaceField(sIdx, rIdx, cIdx, it.id, f)}
                                                                            />
                                                                        ),
                                                                    )}
                                                                    {editable && (
                                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                                            <button type="button" onClick={() => { setPicker({ sIdx, rIdx, cIdx }); setPickerTab("field"); }} className="rounded border border-dashed border-[#cdd5e4] px-2 py-1 text-[11px] text-[#2f6df6] hover:bg-[#f5f8ff]">+ Add</button>
                                                                            <button type="button" onClick={() => op(ops.addGroup(workingDoc, sIdx, rIdx, cIdx))} className="rounded border border-dashed border-[#cdd5e4] px-2 py-1 text-[11px] text-[#4063b0] hover:bg-[#f5f8ff]">+ Block</button>
                                                                            <button type="button" onClick={() => op(ops.addItem(workingDoc, sIdx, rIdx, cIdx, ops.makeTemplateItem("{last_name} Household", "Display text")))} className="rounded border border-dashed border-[#cdd5e4] px-2 py-1 text-[11px] text-[#0f7d63] hover:bg-[#f0fbf8]" title="Static text with {token} replacement">+ Text</button>
                                                                            <button type="button" onClick={() => op(ops.addItem(workingDoc, sIdx, rIdx, cIdx, makeRelatedListItem()))} className="rounded border border-dashed border-[#cdd5e4] px-2 py-1 text-[11px] text-[#4063b0] hover:bg-[#f5f8ff]" title="Multi-field related list (each child renders as its own row)">+ List</button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                                {editable && (
                                                    <button type="button" onClick={() => op(ops.addRow(workingDoc, sIdx, 2))} className="self-start rounded border border-[#e6e8ec] px-2 py-1 text-[11px] text-[#31394d] hover:bg-[#F4F6F9]">+ Add row</button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {editable && (
                                        <button type="button" onClick={() => op(ops.addSection(workingDoc))} className="self-start rounded border border-[#e6e8ec] px-3 py-1.5 text-sm font-medium text-[#31394d] hover:bg-[#F4F6F9]">+ Add section</button>
                                    )}

                                    {/* JSON escape hatch */}
                                    <div>
                                        <button type="button" onClick={() => setShowJson((v) => !v)} className="text-xs font-medium text-[#2f6df6] hover:underline">{showJson ? "Hide" : "Show"} advanced JSON editor</button>
                                        {showJson && (
                                            <div className="mt-2">
                                                <textarea value={jsonText} onChange={(e) => onJsonChange(e.target.value)} disabled={!editable} spellCheck={false} className="h-72 w-full rounded border border-[#e6e8ec] bg-[#0f1115] p-3 font-mono text-xs text-[#e6e8ec] disabled:opacity-60" />
                                                {jsonError && <p className={`mt-1 text-xs ${jsonError.startsWith("OK") ? "text-green-600" : "text-red-600"}`}>{jsonError}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </SectionCard>

                            <SectionCard title="Preview">
                                <LayoutPreviewRenderer doc={workingDoc} />
                            </SectionCard>
                        </>
                    )}
                </div>
            </div>

            {/* Field / widget picker */}
            {picker && catalog && (
                <PickerOverlay
                    catalog={catalog}
                    tab={pickerTab}
                    setTab={setPickerTab}
                    group={pickerGroup}
                    setGroup={setPickerGroup}
                    onPickField={(f) => addCatalogField(picker, f)}
                    onPickWidget={(w) => addCatalogWidget(picker, w)}
                    onClose={() => setPicker(null)}
                />
            )}
        </>
    );
}

function Header() {
    return (
        <header className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1d2433" }}>Layout builder</h1>
            <p className="mt-1 text-sm text-[#59678b]">
                Build Lead drawer and queue layouts — add fields and widgets, arrange rows and columns, set simple
                conditions, then publish. Proof/config only; live drawers and queues are unchanged.
            </p>
        </header>
    );
}

function ItemRow({
    item,
    editable,
    canLeft,
    canRight,
    onUp,
    onDown,
    onLeft,
    onRight,
    onRemove,
    onCondition,
    onAdornment,
    onPatch,
    catalogFields,
    onReplaceField,
}: {
    item: LayoutItem;
    editable: boolean;
    canLeft: boolean;
    canRight: boolean;
    onUp: () => void;
    onDown: () => void;
    onLeft: () => void;
    onRight: () => void;
    onRemove: () => void;
    onCondition: (cond: LayoutCondition | undefined) => void;
    onAdornment: (a: LayoutFieldAdornment | undefined) => void;
    onPatch: (patch: Partial<LayoutItem>) => void;
    catalogFields: LayoutCatalogField[];
    onReplaceField: (f: LayoutCatalogField) => void;
}) {
    const ad = item.adornment;
    const isTemplate = typeof item.template === "string";
    const setIcon = (icon: string) => {
        if (!icon) return onAdornment(undefined);
        onAdornment({ position: ad?.position ?? "left", icon: icon as LayoutAdornmentIcon, ...(ad?.action ? { action: ad.action } : {}) });
    };
    const setAction = (entity: string) => {
        if (!ad) return;
        if (!entity) return onAdornment({ position: ad.position, icon: ad.icon });
        onAdornment({ position: ad.position, icon: ad.icon, action: { type: "open_drawer", entity: entity as LayoutAdornmentActionEntity } });
    };
    return (
        <div className="rounded border border-[#eef0f4] bg-white px-1.5 py-1 text-[12px]">
            <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[#31394d]" title={item.refKey}>
                    {item.label || item.refKey}
                    <span className="ml-1 rounded bg-[#eef1f6] px-1 text-[9px] text-[#59678b]">{item.kind === "field" ? item.sourceEntity ?? "field" : "widget"}</span>
                </span>
                <button type="button" onClick={onUp} disabled={!editable} className="px-0.5 disabled:opacity-30" title="Up">↑</button>
                <button type="button" onClick={onDown} disabled={!editable} className="px-0.5 disabled:opacity-30" title="Down">↓</button>
                <button type="button" onClick={onLeft} disabled={!editable || !canLeft} className="px-0.5 disabled:opacity-30" title="Move left">←</button>
                <button type="button" onClick={onRight} disabled={!editable || !canRight} className="px-0.5 disabled:opacity-30" title="Move right">→</button>
                <button type="button" onClick={onRemove} disabled={!editable} className="px-0.5 text-red-600 disabled:opacity-30" title="Remove">✕</button>
            </div>
            {isTemplate && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                    <input value={item.label ?? ""} disabled={!editable} onChange={(e) => onPatch({ label: e.target.value })} placeholder="Label" className="w-full rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40" />
                    <input value={item.template ?? ""} disabled={!editable} onChange={(e) => onPatch({ template: e.target.value })} placeholder="Display text, e.g. {last_name} Household" title="Static text with {token} replacement from the record" className="w-full rounded border border-[#e6e8ec] px-1 py-0.5 font-mono text-[10px] disabled:opacity-40" />
                </div>
            )}
            {item.kind === "field" && !isTemplate && (
                <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-[9px] text-[#9aa4bf]">display:</span>
                    <select value={item.renderHint ?? "text"} disabled={!editable} onChange={(e) => onPatch({ renderHint: e.target.value as LayoutRenderHint })} className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40" title="How this value renders">
                        {RENDER_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                </div>
            )}
            <div className="mt-0.5 flex items-center gap-1">
                <span className="text-[9px] text-[#9aa4bf]">show:</span>
                <select
                    value={condKey(item.visibleWhen)}
                    disabled={!editable}
                    onChange={(e) => onCondition(CONDITION_PRESETS.find((p) => p.key === e.target.value)?.cond)}
                    className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                >
                    {CONDITION_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    {condKey(item.visibleWhen) === "custom" && <option value="custom">Custom (JSON)</option>}
                </select>
            </div>
            {item.kind === "field" && !isTemplate && catalogFields.length > 0 && (
                <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-[9px] text-[#9aa4bf]">field:</span>
                    <select
                        value={catalogFields.some((f) => f.refKey === item.refKey) ? item.refKey : ""}
                        disabled={!editable}
                        onChange={(e) => {
                            const f = catalogFields.find((c) => c.refKey === e.target.value);
                            if (f) onReplaceField(f);
                        }}
                        title="Replace this field (keeps placement, condition, icon, editable)"
                        className="min-w-0 max-w-[180px] truncate rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                    >
                        {!catalogFields.some((f) => f.refKey === item.refKey) && <option value="">{item.refKey} (custom)</option>}
                        {catalogFields.map((f) => (
                            <option key={f.refKey} value={f.refKey}>{f.entityLabel}: {f.fieldLabel}</option>
                        ))}
                    </select>
                </div>
            )}
            {item.kind === "field" && (
                <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-[9px] text-[#9aa4bf]">icon:</span>
                    <select value={ad?.icon ?? ""} disabled={!editable} onChange={(e) => setIcon(e.target.value)} className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                        <option value="">None</option>
                        {LAYOUT_ADORNMENT_ICONS.map((ic) => (
                            <option key={ic} value={ic}>{ADORNMENT_ICON_GLYPH[ic]} {ic}</option>
                        ))}
                    </select>
                    {ad?.icon ? (
                        <select value={ad.action?.entity ?? ""} disabled={!editable} onChange={(e) => setAction(e.target.value)} className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40" title="Field action icon">
                            <option value="">Icon only</option>
                            <option value="person">Open person drawer</option>
                            <option value="child">Open child drawer</option>
                            <option value="opportunity">Open opportunity drawer</option>
                        </select>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function PickerOverlay({
    catalog,
    tab,
    setTab,
    group,
    setGroup,
    onPickField,
    onPickWidget,
    onClose,
}: {
    catalog: CatalogResponse;
    tab: "field" | "widget";
    setTab: (t: "field" | "widget") => void;
    group: LayoutEntityGroupKey;
    setGroup: (g: LayoutEntityGroupKey) => void;
    onPickField: (f: LayoutCatalogField) => void;
    onPickWidget: (w: LayoutCatalogWidget) => void;
    onClose: () => void;
}) {
    const groupFields = catalog.groups.find((g) => g.entityKey === group)?.fields ?? [];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            <div className="max-h-[80vh] w-full max-w-md overflow-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setTab("field")} className={`rounded px-2 py-1 text-sm ${tab === "field" ? "bg-[#eef1f6] font-medium" : ""}`}>Fields</button>
                        <button type="button" onClick={() => setTab("widget")} className={`rounded px-2 py-1 text-sm ${tab === "widget" ? "bg-[#eef1f6] font-medium" : ""}`}>Widgets</button>
                    </div>
                    <button type="button" onClick={onClose} className="text-sm text-[#59678b]">✕</button>
                </div>
                {tab === "field" ? (
                    <>
                        <select value={group} onChange={(e) => setGroup(e.target.value as LayoutEntityGroupKey)} className="mb-2 w-full rounded border border-[#e6e8ec] px-2 py-1.5 text-sm">
                            {catalog.groups.map((g) => <option key={g.entityKey} value={g.entityKey}>{g.entityLabel}</option>)}
                        </select>
                        <div className="flex flex-col gap-1">
                            {groupFields.map((f) => (
                                <button key={f.refKey} type="button" onClick={() => onPickField(f)} className="flex items-center justify-between rounded border border-[#e6e8ec] px-2 py-1.5 text-left text-sm hover:bg-[#f5f8ff]">
                                    <span>{f.fieldLabel}</span>
                                    <span className="font-mono text-[10px] text-[#9aa4bf]">{f.refKey}</span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col gap-1">
                        {catalog.widgets.map((w) => (
                            <button key={w.widgetKey} type="button" onClick={() => onPickWidget(w)} className="flex items-center justify-between rounded border border-[#e6e8ec] px-2 py-1.5 text-left text-sm hover:bg-[#f5f8ff]">
                                <span>{w.label}</span>
                                <span className="font-mono text-[10px] text-[#9aa4bf]">{w.widgetKey}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

type GroupLoc = { sIdx: number; rIdx: number; cIdx: number; itemId: string };

function GroupBlockEditor({
    doc,
    loc,
    editable,
    catalogFields,
    op,
    onMoveBlock,
    onRemoveBlock,
    onRenameBlock,
    onAddToCell,
}: {
    doc: LayoutDoc;
    loc: GroupLoc;
    editable: boolean;
    catalogFields: LayoutCatalogField[];
    op: (next: LayoutDoc | null | undefined) => void;
    onMoveBlock: (dir: -1 | 1) => void;
    onRemoveBlock: () => void;
    onRenameBlock: (t: string) => void;
    onAddToCell: (gr: number, gc: number) => void;
}) {
    const group = doc.sections[loc.sIdx]?.rows[loc.rIdx]?.columns[loc.cIdx]?.items.find((i) => i.id === loc.itemId);
    const rows = group?.rows ?? [];
    return (
        <div className="rounded border border-[#dbe7ff] bg-[#f7faff] p-1.5">
            <div className="flex items-center gap-1">
                <span className="rounded bg-[#e6efff] px-1 text-[9px] font-semibold uppercase text-[#4063b0]">block</span>
                <input value={group?.label ?? ""} onChange={(e) => onRenameBlock(e.target.value)} disabled={!editable} className="min-w-0 flex-1 rounded border border-[#e6e8ec] px-1 py-0.5 text-[11px] font-medium disabled:bg-[#f4f6f9]" placeholder="Block name" />
                <button type="button" onClick={() => onMoveBlock(-1)} disabled={!editable} className="px-0.5 text-[11px] disabled:opacity-30" title="Move up">↑</button>
                <button type="button" onClick={() => onMoveBlock(1)} disabled={!editable} className="px-0.5 text-[11px] disabled:opacity-30" title="Move down">↓</button>
                <button type="button" onClick={onRemoveBlock} disabled={!editable} className="px-0.5 text-[11px] text-red-600 disabled:opacity-30" title="Remove block">✕</button>
            </div>
            {rows.map((gr, gri) => (
                <div key={gr.id} className="mt-1 rounded border border-[#eef0f4] bg-white p-1">
                    <div className="mb-1 flex items-center gap-1 text-[9px] text-[#9aa4bf]">
                        <span>cols:</span>
                        {[1, 2, 3].map((n) => (
                            <button key={n} type="button" disabled={!editable} onClick={() => op(ops.groupSetRowColumnCount(doc, loc, gri, n))} className={`rounded border px-1 ${gr.columns.length === n ? "border-[#2f6df6] bg-[#f5f8ff] text-[#2f6df6]" : "border-[#e6e8ec]"} disabled:opacity-40`}>{n}</button>
                        ))}
                        <span className="ml-auto flex items-center gap-1">
                            <button type="button" onClick={() => op(ops.groupMoveRow(doc, loc, gri, -1))} disabled={!editable} className="px-0.5 disabled:opacity-30">↑</button>
                            <button type="button" onClick={() => op(ops.groupMoveRow(doc, loc, gri, 1))} disabled={!editable} className="px-0.5 disabled:opacity-30">↓</button>
                            <button type="button" onClick={() => op(ops.groupRemoveRow(doc, loc, gri))} disabled={!editable} className="px-0.5 text-red-600 disabled:opacity-30">✕ row</button>
                        </span>
                    </div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(12, minmax(0,1fr))" }}>
                        {gr.columns.map((gc, gci) => (
                            <div key={gc.id} style={{ gridColumn: `span ${gc.width} / span ${gc.width}` }} className="rounded bg-[#fbfcfe] p-1">
                                {gc.items.length === 0 && <p className="px-0.5 text-[9px] text-[#9aa4bf]">empty</p>}
                                {gc.items.map((git) => (
                                    <MiniItemRow
                                        key={git.id}
                                        item={git}
                                        editable={editable}
                                        catalogFields={catalogFields}
                                        onUp={() => op(ops.groupMoveItemVertical(doc, loc, gri, gci, git.id, -1))}
                                        onDown={() => op(ops.groupMoveItemVertical(doc, loc, gri, gci, git.id, 1))}
                                        onRemove={() => op(ops.groupRemoveItem(doc, loc, gri, gci, git.id))}
                                        onReplaceField={(f) => op(ops.groupPatchItem(doc, loc, gri, gci, git.id, { refKey: f.refKey, label: f.fieldLabel, renderHint: ops.makeFieldItem(f.refKey, f.fieldLabel, f.fieldType).renderHint, sourceEntity: f.entityKey }))}
                                        onCondition={(cond) => op(ops.groupPatchItem(doc, loc, gri, gci, git.id, { visibleWhen: cond }))}
                                        onAdornment={(a) => op(ops.groupPatchItem(doc, loc, gri, gci, git.id, { adornment: a }))}
                                        onPatch={(patch) => op(ops.groupPatchItem(doc, loc, gri, gci, git.id, patch))}
                                    />
                                ))}
                                {editable && <button type="button" onClick={() => onAddToCell(gri, gci)} className="mt-0.5 w-full rounded border border-dashed border-[#cdd5e4] px-1 py-0.5 text-[10px] text-[#2f6df6] hover:bg-[#f5f8ff]">+ Add</button>}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
            {editable && <button type="button" onClick={() => op(ops.groupAddRow(doc, loc, 2))} className="mt-1 rounded border border-[#e6e8ec] px-2 py-0.5 text-[10px] text-[#31394d] hover:bg-[#F4F6F9]">+ Add row in block</button>}
        </div>
    );
}

function MiniItemRow({
    item,
    editable,
    catalogFields,
    onUp,
    onDown,
    onRemove,
    onReplaceField,
    onCondition,
    onAdornment,
    onPatch,
}: {
    item: LayoutItem;
    editable: boolean;
    catalogFields: LayoutCatalogField[];
    onUp: () => void;
    onDown: () => void;
    onRemove: () => void;
    onReplaceField: (f: LayoutCatalogField) => void;
    onCondition: (cond: LayoutCondition | undefined) => void;
    onAdornment: (a: LayoutFieldAdornment | undefined) => void;
    onPatch: (patch: Partial<LayoutItem>) => void;
}) {
    const ad = item.adornment;
    const isTemplate = typeof item.template === "string";
    const setIcon = (icon: string) => {
        if (!icon) return onAdornment(undefined);
        onAdornment({ position: ad?.position ?? "left", icon: icon as LayoutAdornmentIcon, ...(ad?.action ? { action: ad.action } : {}) });
    };
    const setAction = (entity: string) => {
        if (!ad) return;
        if (!entity) return onAdornment({ position: ad.position, icon: ad.icon });
        onAdornment({ position: ad.position, icon: ad.icon, action: { type: "open_drawer", entity: entity as LayoutAdornmentActionEntity } });
    };
    return (
        <div className="mb-0.5 rounded border border-[#eef0f4] bg-white px-1 py-0.5 text-[11px]">
            <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[#31394d]" title={item.refKey}>
                    {item.label || item.refKey}
                    <span className="ml-1 text-[9px] text-[#9aa4bf]">{isTemplate ? "text" : item.kind === "field" ? item.sourceEntity ?? "field" : "widget"}</span>
                </span>
                <button type="button" onClick={onUp} disabled={!editable} className="px-0.5 disabled:opacity-30" title="Up">↑</button>
                <button type="button" onClick={onDown} disabled={!editable} className="px-0.5 disabled:opacity-30" title="Down">↓</button>
                <button type="button" onClick={onRemove} disabled={!editable} className="px-0.5 text-red-600 disabled:opacity-30" title="Remove">✕</button>
            </div>
            {isTemplate && (
                <input value={item.template ?? ""} disabled={!editable} onChange={(e) => onPatch({ template: e.target.value })} placeholder="{token} display text" title="Static text with {token} replacement" className="mt-0.5 w-full rounded border border-[#e6e8ec] px-1 py-0.5 font-mono text-[10px] disabled:opacity-40" />
            )}
            {item.kind === "field" && !isTemplate && catalogFields.length > 0 && (
                <select
                    value={catalogFields.some((f) => f.refKey === item.refKey) ? item.refKey : ""}
                    disabled={!editable}
                    onChange={(e) => {
                        const f = catalogFields.find((c) => c.refKey === e.target.value);
                        if (f) onReplaceField(f);
                    }}
                    title="Replace this field"
                    className="mt-0.5 w-full truncate rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40"
                >
                    {!catalogFields.some((f) => f.refKey === item.refKey) && <option value="">{item.refKey} (custom)</option>}
                    {catalogFields.map((f) => (
                        <option key={f.refKey} value={f.refKey}>{f.entityLabel}: {f.fieldLabel}</option>
                    ))}
                </select>
            )}
            {item.kind === "field" && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {!isTemplate && (
                        <select value={item.renderHint ?? "text"} disabled={!editable} onChange={(e) => onPatch({ renderHint: e.target.value as LayoutRenderHint })} title="Display mode" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                            {RENDER_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                    )}
                    <select value={condKey(item.visibleWhen)} disabled={!editable} onChange={(e) => onCondition(CONDITION_PRESETS.find((p) => p.key === e.target.value)?.cond)} title="Condition" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                        {CONDITION_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        {condKey(item.visibleWhen) === "custom" && <option value="custom">Custom (JSON)</option>}
                    </select>
                    <select value={ad?.icon ?? ""} disabled={!editable} onChange={(e) => setIcon(e.target.value)} title="Icon / adornment" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                        <option value="">No icon</option>
                        {LAYOUT_ADORNMENT_ICONS.map((ic) => <option key={ic} value={ic}>{ADORNMENT_ICON_GLYPH[ic]} {ic}</option>)}
                    </select>
                    {ad?.icon ? (
                        <select value={ad.action?.entity ?? ""} disabled={!editable} onChange={(e) => setAction(e.target.value)} title="Drawer-link action" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                            {ACTION_ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    ) : null}
                </div>
            )}
        </div>
    );
}

/**
 * Multi-field related list (collection table) editor — configure the columns
 * each child row renders: add/remove/reorder columns, pick the field, set width
 * and render/display mode. Each child renders as its OWN row in the renderer.
 */
function RelatedListEditor({
    item,
    editable,
    catalogFields,
    onMove,
    onRemove,
    onPatchItem,
    onAddColumn,
    onRemoveColumn,
    onMoveColumn,
    onPatchColumn,
}: {
    item: LayoutItem;
    editable: boolean;
    catalogFields: LayoutCatalogField[];
    onMove: (dir: -1 | 1) => void;
    onRemove: () => void;
    onPatchItem: (patch: Partial<LayoutItem>) => void;
    onAddColumn: (col: LayoutCollectionColumn) => void;
    onRemoveColumn: (ci: number) => void;
    onMoveColumn: (ci: number, dir: -1 | 1) => void;
    onPatchColumn: (ci: number, patch: Partial<LayoutCollectionColumn>) => void;
}) {
    const cols = item.columns ?? [];
    return (
        <div className="rounded border border-[#dbe7ff] bg-[#f7faff] p-1.5">
            <div className="flex items-center gap-1">
                <span className="rounded bg-[#e6efff] px-1 text-[9px] font-semibold uppercase text-[#4063b0]">list</span>
                <input value={item.label ?? ""} disabled={!editable} onChange={(e) => onPatchItem({ label: e.target.value })} placeholder="List title" className="min-w-0 flex-1 rounded border border-[#e6e8ec] px-1 py-0.5 text-[11px] font-medium disabled:bg-[#f4f6f9]" />
                <select value={item.displayMode ?? "table"} disabled={!editable} onChange={(e) => onPatchItem({ displayMode: e.target.value })} title="Layout: table or stacked rows" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                    <option value="table">Table</option>
                    <option value="rows">Rows</option>
                    <option value="list">List</option>
                </select>
                <button type="button" onClick={() => onMove(-1)} disabled={!editable} className="px-0.5 text-[11px] disabled:opacity-30" title="Move up">↑</button>
                <button type="button" onClick={() => onMove(1)} disabled={!editable} className="px-0.5 text-[11px] disabled:opacity-30" title="Move down">↓</button>
                <button type="button" onClick={onRemove} disabled={!editable} className="px-0.5 text-[11px] text-red-600 disabled:opacity-30" title="Remove list">✕</button>
            </div>
            <p className="mt-0.5 px-0.5 text-[9px] text-[#9aa4bf]">Each {item.related?.entityType ?? "child"} renders as its own row.</p>
            <div className="mt-1 flex flex-col gap-1">
                {cols.length === 0 && <p className="px-0.5 text-[9px] text-[#9aa4bf]">No columns yet.</p>}
                {cols.map((col, ci) => (
                    <div key={`${col.refKey}-${ci}`} className="rounded border border-[#eef0f4] bg-white p-1">
                        <div className="flex items-center gap-1">
                            <input value={col.label} disabled={!editable} onChange={(e) => onPatchColumn(ci, { label: e.target.value })} placeholder="Column" className="min-w-0 flex-1 rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40" />
                            <button type="button" onClick={() => onMoveColumn(ci, -1)} disabled={!editable || ci === 0} className="px-0.5 text-[10px] disabled:opacity-30" title="Move left">←</button>
                            <button type="button" onClick={() => onMoveColumn(ci, 1)} disabled={!editable || ci === cols.length - 1} className="px-0.5 text-[10px] disabled:opacity-30" title="Move right">→</button>
                            <button type="button" onClick={() => onRemoveColumn(ci)} disabled={!editable} className="px-0.5 text-[10px] text-red-600 disabled:opacity-30" title="Remove column">✕</button>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <select value={catalogFields.some((f) => f.refKey === col.refKey) ? col.refKey : ""} disabled={!editable} onChange={(e) => { const f = catalogFields.find((c) => c.refKey === e.target.value); if (f) onPatchColumn(ci, { refKey: f.refKey, label: col.label || f.fieldLabel }); }} title="Field for this column" className="min-w-0 max-w-[150px] truncate rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                                {!catalogFields.some((f) => f.refKey === col.refKey) && <option value="">{col.refKey} (custom)</option>}
                                {catalogFields.map((f) => <option key={f.refKey} value={f.refKey}>{f.entityLabel}: {f.fieldLabel}</option>)}
                            </select>
                            <select value={col.width ?? "medium"} disabled={!editable} onChange={(e) => onPatchColumn(ci, { width: e.target.value as LayoutColumnWidth })} title="Column width" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                                {WIDTH_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                            </select>
                            <select value={col.renderHint ?? "text"} disabled={!editable} onChange={(e) => onPatchColumn(ci, { renderHint: e.target.value as LayoutRenderHint })} title="Render mode" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                                {RENDER_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                            </select>
                            <select value={col.adornment?.icon ?? ""} disabled={!editable} onChange={(e) => onPatchColumn(ci, { adornment: e.target.value ? { position: "left", icon: e.target.value as LayoutAdornmentIcon } : undefined })} title="Icon" className="rounded border border-[#e6e8ec] px-1 py-0.5 text-[10px] disabled:opacity-40">
                                <option value="">No icon</option>
                                {LAYOUT_ADORNMENT_ICONS.map((ic) => <option key={ic} value={ic}>{ADORNMENT_ICON_GLYPH[ic]} {ic}</option>)}
                            </select>
                        </div>
                    </div>
                ))}
            </div>
            {editable && (
                <button type="button" onClick={() => onAddColumn({ label: "Column", refKey: catalogFields[0]?.refKey ?? "child.name", width: "medium", renderHint: "text" })} className="mt-1 rounded border border-dashed border-[#cdd5e4] px-2 py-0.5 text-[10px] text-[#2f6df6] hover:bg-[#f5f8ff]">+ Add column</button>
            )}
        </div>
    );
}
