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

import { useCallback, useEffect, useState } from "react";
import SectionCard from "@/components/admin/SectionCard";
import LayoutPreviewRenderer from "@/components/layout/LayoutPreviewRenderer";
import { isLayoutV2PreviewEnabledClient } from "@/lib/layout/featureFlag";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import { entityTypeLabel, fetchEntityLabelMap, type EntityLabelMap } from "@/lib/layout/entityLabels";
import type { EntityLayoutRecord, LayoutCondition, LayoutDoc, LayoutItem } from "@/lib/layout/layoutV2";
import type { LayoutCatalogField, LayoutCatalogWidget, LayoutEntityGroupKey } from "@/lib/layout/fieldCatalog";
import * as ops from "@/lib/layout/builderOps";

type ListResponse = { records: EntityLayoutRecord[]; entityTypes: string[]; surfaces: ("drawer" | "queue")[] };
type CatalogResponse = {
    groups: { entityKey: LayoutEntityGroupKey; entityLabel: string; fields: LayoutCatalogField[] }[];
    widgets: LayoutCatalogWidget[];
};

type PickerTarget = { sIdx: number; rIdx: number; cIdx: number } | null;

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

function statusPill(status: string) {
    const isPub = status === "published";
    return (
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isPub ? "border border-green-200 bg-green-50 text-green-700" : "border border-[#e6e8ec] bg-[#eef1f6] text-[#59678b]"}`}>
            {status}
        </span>
    );
}

export default function LayoutConfigClient() {
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
        op(ops.addItem(workingDoc, target.sIdx, target.rIdx, target.cIdx, ops.makeFieldItem(f.refKey, f.fieldLabel, f.fieldType, f.entityKey)));
        setPicker(null);
    };
    const addCatalogWidget = (target: NonNullable<PickerTarget>, w: LayoutCatalogWidget) => {
        if (!workingDoc) return;
        op(ops.addItem(workingDoc, target.sIdx, target.rIdx, target.cIdx, ops.makeWidgetItem(w.widgetKey, w.label, w.defaultDisplayMode)));
        setPicker(null);
    };

    if (!enabled) {
        return (
            <>
                <Header />
                <p className="text-sm text-[#59678b]">Layout configuration is disabled for this environment.</p>
            </>
        );
    }

    return (
        <>
            <Header />

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
                        ) : (list?.records.length ?? 0) === 0 ? (
                            <p className="text-sm text-[#59678b]">No layouts yet. Create one above.</p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {list!.records.map((r) => (
                                    <li key={r.id}>
                                        <button type="button" onClick={() => selectRecord(r.id)} className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-[#F4F6F9] ${selectedId === r.id ? "bg-[#eef1f6]" : ""}`}>
                                            <span className="min-w-0 truncate">
                                                <span className="font-medium text-[#31394d]">{entityTypeLabel(labelMap, r.entityType)}</span>
                                                <span className="ml-1 text-xs text-[#59678b]">{r.surface} · v{r.version}{r.orgId === null ? " · default" : ""}</span>
                                            </span>
                                            {statusPill(r.status)}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
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
                                    <div className="flex items-center gap-2">
                                        {statusPill(selectedStatus)}
                                        <span className="text-[11px] text-[#59678b]">{workingDoc.surface}</span>
                                        {dirty && <span className="text-[11px] text-amber-600">unsaved changes</span>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input value={workingName} onChange={(e) => { setWorkingName(e.target.value); setDirty(true); }} disabled={!editable} className="min-w-[200px] flex-1 rounded border border-[#e6e8ec] px-2 py-1.5 text-sm disabled:bg-[#f4f6f9]" placeholder="Layout name" />
                                        <button type="button" onClick={saveDraft} disabled={!editable || busy === "save" || (showJson && !!jsonError)} className="rounded border border-[#e6e8ec] bg-white px-3 py-1.5 text-sm font-medium text-[#31394d] hover:bg-[#F4F6F9] disabled:opacity-50">{busy === "save" ? "Saving…" : "Save draft"}</button>
                                        <button type="button" onClick={publish} disabled={!editable || busy === "publish"} className="rounded bg-[#2f6df6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2a61dd] disabled:opacity-50">{busy === "publish" ? "Publishing…" : "Publish"}</button>
                                        <button type="button" onClick={removeLayout} disabled={!canMutate || busy === "delete"} className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Delete</button>
                                    </div>

                                    {isPublished && <p className="rounded bg-[#f4f6f9] px-3 py-2 text-xs text-[#59678b]">Published versions are immutable. Create a new draft to edit.</p>}

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
                                                                    {c.items.map((it) => (
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
                                                                        />
                                                                    ))}
                                                                    {editable && (
                                                                        <button type="button" onClick={() => { setPicker({ sIdx, rIdx, cIdx }); setPickerTab("field"); }} className="mt-1 rounded border border-dashed border-[#cdd5e4] px-2 py-1 text-[11px] text-[#2f6df6] hover:bg-[#f5f8ff]">+ Add</button>
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
}) {
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
