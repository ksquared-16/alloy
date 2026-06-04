"use client";

/**
 * Layout V2 — Configuration UI (Deliverable D).
 *
 * Create / edit / draft / publish / preview database-backed layouts. This
 * surface is FOUNDATION ONLY: nothing here changes how live drawers or queues
 * render. Editing a layout and publishing it has no runtime effect until a
 * later adoption sprint flips resolution on.
 *
 * Editing affordances:
 *  - Section-level: rename, reorder, toggle default-expanded.
 *  - Full structural edits (rows / columns / items): the validated JSON editor,
 *    which is checked against the fixed Layout V2 schema (no arbitrary nesting,
 *    closed enums) on every keystroke and again server-side on save/publish.
 *  - Live preview reflects the working document.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import SectionCard from "@/components/admin/SectionCard";
import LayoutPreviewRenderer from "@/components/layout/LayoutPreviewRenderer";
import { isLayoutV2PreviewEnabledClient } from "@/lib/layout/featureFlag";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { entityTypeLabel, fetchEntityLabelMap, type EntityLabelMap } from "@/lib/layout/entityLabels";
import type { EntityLayoutRecord, LayoutDoc, LayoutSection } from "@/lib/layout/layoutV2";

type ListResponse = {
    records: EntityLayoutRecord[];
    entityTypes: string[];
    surfaces: ("drawer" | "queue")[];
};

/** AdminV2-styled page header (no legacy admin chrome). */
function ConfigHeader() {
    return (
        <header className="mb-5">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1d2433" }}>
                Layout configuration
            </h1>
            <p className="mt-1 text-sm text-[#59678b]">
                Configure how records are presented in drawers and queues. Changes are saved as drafts and published per
                version — they do not affect live drawers or queues yet.
            </p>
        </header>
    );
}

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v)) as T;
}

function statusPill(status: string) {
    const isPub = status === "published";
    return (
        <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isPub ? "bg-green-50 text-green-700 border border-green-200" : "bg-[#eef1f6] text-[#59678b] border border-[#e6e8ec]"
            }`}
        >
            {status}
        </span>
    );
}

export default function LayoutConfigClient() {
    const enabled = isLayoutV2PreviewEnabledClient();

    // Auth is enforced server-side by /api/admin/entity-layouts (admin for
    // writes, ops+ for reads). This page lives in an isolated AdminV2 route
    // group with no AdminAuthProvider, so it does not gate on a client context:
    // it starts optimistic and flips to read-only if the API returns 401/403.
    const [forbidden, setForbidden] = useState(false);
    const canMutate = !forbidden;

    const [list, setList] = useState<ListResponse | null>(null);
    const [labelMap, setLabelMap] = useState<EntityLabelMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [workingDoc, setWorkingDoc] = useState<LayoutDoc | null>(null);
    const [workingName, setWorkingName] = useState("");
    const [selectedStatus, setSelectedStatus] = useState<string>("draft");
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [jsonText, setJsonText] = useState("");
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [showJson, setShowJson] = useState(false);

    const [newEntity, setNewEntity] = useState("");
    const [newSurface, setNewSurface] = useState<"drawer" | "queue">("drawer");

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
            const data = json as ListResponse;
            setList(data);
            if (!newEntity && data.entityTypes.length > 0) setNewEntity(data.entityTypes[0]);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
        }
    }, [newEntity]);

    useEffect(() => {
        setLoading(true);
        fetchList();
        fetchEntityLabelMap()
            .then(setLabelMap)
            .catch(() => {});
    }, [fetchList]);

    const selectRecord = useCallback(async (id: string) => {
        setBusy("load");
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
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, []);

    const applyDoc = useCallback((next: LayoutDoc) => {
        setWorkingDoc(next);
        setJsonText(JSON.stringify(next, null, 2));
        setJsonError(null);
        setDirty(true);
    }, []);

    const onJsonChange = useCallback((text: string) => {
        setJsonText(text);
        try {
            const obj = JSON.parse(text);
            const parsed = parseLayoutDoc(obj);
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

    const createLayout = useCallback(async () => {
        if (!canMutate || !newEntity) return;
        setBusy("create");
        try {
            const res = await fetch("/api/admin/entity-layouts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entity_type: newEntity, surface: newSurface, from_registry: true }),
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
    }, [canMutate, newEntity, newSurface, fetchList, selectRecord]);

    const saveDraft = useCallback(async () => {
        if (!canMutate || !selectedId || !workingDoc) return;
        if (jsonError && showJson) return;
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
    }, [canMutate, selectedId, workingDoc, workingName, jsonError, showJson, fetchList]);

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
        if (!confirm("Delete this layout version? This cannot be undone.")) return;
        setBusy("delete");
        try {
            const res = await fetch(`/api/admin/entity-layouts/${selectedId}`, { method: "DELETE" });
            if (res.status === 401 || res.status === 403) {
                setForbidden(true);
                throw new Error("Admin access is required to delete layouts.");
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Delete failed");
            setSelectedId(null);
            setWorkingDoc(null);
            await fetchList();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [canMutate, selectedId, fetchList]);

    // --- section-level structural edits -------------------------------------
    const moveSection = (index: number, dir: -1 | 1) => {
        if (!workingDoc) return;
        const next = clone(workingDoc);
        const target = index + dir;
        if (target < 0 || target >= next.sections.length) return;
        const [s] = next.sections.splice(index, 1);
        next.sections.splice(target, 0, s);
        applyDoc(next);
    };
    const editSection = (index: number, patch: Partial<LayoutSection>) => {
        if (!workingDoc) return;
        const next = clone(workingDoc);
        next.sections[index] = { ...next.sections[index], ...patch };
        applyDoc(next);
    };
    const deleteSection = (index: number) => {
        if (!workingDoc) return;
        const next = clone(workingDoc);
        next.sections.splice(index, 1);
        applyDoc(next);
    };

    const previewDoc = useMemo(() => workingDoc, [workingDoc]);
    const isPublished = selectedStatus === "published";
    const editable = canMutate && !isPublished;

    if (!enabled) {
        return (
            <>
                <ConfigHeader />
                <p className="text-sm text-[#59678b]">Layout configuration is disabled for this environment.</p>
            </>
        );
    }

    return (
        <>
            <ConfigHeader />

            <div className="mb-4 rounded-md border border-[#e6e8ec] bg-[#fbfcfe] px-4 py-2.5 text-sm text-[#59678b]">
                Reorder sections, rename them, choose what&rsquo;s expanded, and fine-tune rows, columns, and fields. Fields
                marked <span className="rounded bg-[#eef1f6] px-1.5 py-0.5 text-[11px] font-medium text-[#59678b]">system field</span>{" "}
                are part of the data model and can&rsquo;t be deleted from the field registry, but you can still place and order
                them anywhere in the layout. Publishing affects this configuration only — live drawers and queues are unchanged.
            </div>

            {error && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                    <button className="ml-3 underline" onClick={() => setError(null)}>
                        dismiss
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                {/* Left: list + create */}
                <div className="flex flex-col gap-4">
                    <SectionCard title="New layout">
                        {!canMutate ? (
                            <p className="text-sm text-[#59678b]">
                                You have read-only access. Admin access is required to create or edit layouts.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-medium text-[#59678b]">Entity type</label>
                                <select
                                    value={newEntity}
                                    onChange={(e) => setNewEntity(e.target.value)}
                                    className="rounded border border-[#e6e8ec] bg-white px-2 py-1.5 text-sm"
                                >
                                    {(list?.entityTypes ?? []).map((t) => (
                                        <option key={t} value={t}>
                                            {entityTypeLabel(labelMap, t)}
                                        </option>
                                    ))}
                                </select>
                                <label className="text-xs font-medium text-[#59678b]">Surface</label>
                                <select
                                    value={newSurface}
                                    onChange={(e) => setNewSurface(e.target.value as "drawer" | "queue")}
                                    className="rounded border border-[#e6e8ec] bg-white px-2 py-1.5 text-sm"
                                >
                                    <option value="drawer">drawer</option>
                                    <option value="queue">queue</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={createLayout}
                                    disabled={busy === "create"}
                                    className="mt-1 rounded bg-[#31394d] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3d465e] disabled:opacity-50"
                                >
                                    {busy === "create" ? "Creating…" : "Create draft from default"}
                                </button>
                                <p className="text-[11px] text-[#9aa4bf]">
                                    Seeds a faithful copy of the current built-in layout, which you can then edit.
                                </p>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard title="Layouts">
                        {loading ? (
                            <p className="text-sm text-[#59678b]">Loading…</p>
                        ) : (list?.records.length ?? 0) === 0 ? (
                            <p className="text-sm text-[#59678b]">No layouts yet. Create one above.</p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {list!.records.map((r) => (
                                    <li key={r.id}>
                                        <button
                                            type="button"
                                            onClick={() => selectRecord(r.id)}
                                            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-[#F4F6F9] ${
                                                selectedId === r.id ? "bg-[#eef1f6]" : ""
                                            }`}
                                        >
                                            <span className="min-w-0 truncate">
                                                <span className="font-medium text-[#31394d]">{entityTypeLabel(labelMap, r.entityType)}</span>
                                                <span className="ml-1 text-xs text-[#59678b]">
                                                    {r.surface} · v{r.version}
                                                    {r.orgId === null ? " · default" : ""}
                                                </span>
                                            </span>
                                            {statusPill(r.status)}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>
                </div>

                {/* Right: editor + preview */}
                <div className="flex flex-col gap-4">
                    {!workingDoc ? (
                        <SectionCard title="Editor">
                            <p className="text-sm text-[#59678b]">Select a layout on the left, or create one.</p>
                        </SectionCard>
                    ) : (
                        <>
                            <SectionCard title="Editor">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center gap-2">
                                        {statusPill(selectedStatus)}
                                        {dirty && <span className="text-[11px] text-amber-600">unsaved changes</span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            value={workingName}
                                            onChange={(e) => {
                                                setWorkingName(e.target.value);
                                                setDirty(true);
                                            }}
                                            disabled={!editable}
                                            className="min-w-[220px] flex-1 rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#f4f6f9]"
                                            placeholder="Layout name"
                                        />
                                        <button
                                            type="button"
                                            onClick={saveDraft}
                                            disabled={!editable || busy === "save" || (showJson && !!jsonError)}
                                            className="rounded border border-[#e6e8ec] bg-white px-3 py-1.5 text-sm font-medium text-[#31394d] hover:bg-[#F4F6F9] disabled:opacity-50"
                                        >
                                            {busy === "save" ? "Saving…" : "Save draft"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={publish}
                                            disabled={!editable || busy === "publish"}
                                            className="rounded bg-[#2f6df6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2a61dd] disabled:opacity-50"
                                        >
                                            {busy === "publish" ? "Publishing…" : "Publish"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={removeLayout}
                                            disabled={!canMutate || busy === "delete"}
                                            className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    </div>

                                    {isPublished && (
                                        <p className="rounded bg-[#f4f6f9] px-3 py-2 text-xs text-[#59678b]">
                                            Published versions are immutable. Create a new draft to make further changes.
                                        </p>
                                    )}

                                    {/* Section list editor */}
                                    {workingDoc.surface === "drawer" && (
                                        <div className="flex flex-col gap-2">
                                            <div className="text-xs font-semibold uppercase tracking-wide text-[#59678b]">Sections</div>
                                            {workingDoc.sections.map((s, i) => (
                                                <div
                                                    key={s.id}
                                                    className="flex flex-wrap items-center gap-2 rounded border border-[#e6e8ec] bg-white px-2 py-1.5"
                                                >
                                                    <input
                                                        value={s.title}
                                                        onChange={(e) => editSection(i, { title: e.target.value })}
                                                        disabled={!editable}
                                                        className="min-w-[160px] flex-1 rounded border border-[#e6e8ec] px-2 py-1 text-sm disabled:bg-[#f4f6f9]"
                                                    />
                                                    <span className="text-[11px] text-[#9aa4bf]">
                                                        {s.rows.length} row{s.rows.length === 1 ? "" : "s"}
                                                    </span>
                                                    <label className="flex items-center gap-1 text-[11px] text-[#59678b]">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(s.defaultExpanded)}
                                                            disabled={!editable}
                                                            onChange={(e) => editSection(i, { defaultExpanded: e.target.checked })}
                                                        />
                                                        expanded
                                                    </label>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => moveSection(i, -1)}
                                                            disabled={!editable || i === 0}
                                                            className="rounded border border-[#e6e8ec] px-1.5 text-sm disabled:opacity-40"
                                                        >
                                                            ↑
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveSection(i, 1)}
                                                            disabled={!editable || i === workingDoc.sections.length - 1}
                                                            className="rounded border border-[#e6e8ec] px-1.5 text-sm disabled:opacity-40"
                                                        >
                                                            ↓
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => deleteSection(i)}
                                                            disabled={!editable}
                                                            className="rounded border border-red-200 px-1.5 text-sm text-red-600 disabled:opacity-40"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Advanced JSON editor for full structural control */}
                                    <div>
                                        <button
                                            type="button"
                                            onClick={() => setShowJson((v) => !v)}
                                            className="text-xs font-medium text-[#2f6df6] hover:underline"
                                        >
                                            {showJson ? "Hide" : "Show"} advanced JSON editor (rows · columns · items)
                                        </button>
                                        {showJson && (
                                            <div className="mt-2">
                                                <textarea
                                                    value={jsonText}
                                                    onChange={(e) => onJsonChange(e.target.value)}
                                                    disabled={!editable}
                                                    spellCheck={false}
                                                    className="h-72 w-full rounded border border-[#e6e8ec] bg-[#0f1115] p-3 font-mono text-xs text-[#e6e8ec] disabled:opacity-60"
                                                />
                                                {jsonError && (
                                                    <p
                                                        className={`mt-1 text-xs ${
                                                            jsonError.startsWith("OK") ? "text-green-600" : "text-red-600"
                                                        }`}
                                                    >
                                                        {jsonError}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </SectionCard>

                            <SectionCard title="Preview">
                                {previewDoc ? (
                                    <LayoutPreviewRenderer doc={previewDoc} />
                                ) : (
                                    <p className="text-sm text-[#59678b]">Nothing to preview.</p>
                                )}
                            </SectionCard>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
