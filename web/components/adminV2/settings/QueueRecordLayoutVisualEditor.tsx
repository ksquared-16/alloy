"use client";

/**
 * Visual editor for queue row layouts (pipeline + waitlist v3 composer).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QueueRecordLayoutSettingsPanel from "@/components/layout/QueueRecordLayoutSettingsPanel";
import type { LayoutFieldPickerCatalog } from "@/components/layout/LayoutFieldPickerOverlay";
import type { EntityLayoutRecord, LayoutDoc } from "@/lib/layout/layoutV2";
import { parseLayoutDoc } from "@/lib/layout/layoutV2Schema";
import {
    dispatchOpportunityQueueLayoutPublished,
    forkPublishedLayoutToDraft,
    parseLayoutDocFromRecord,
} from "@/lib/layout/layoutEditorPublishWorkflow";
import type { QueueRecordLayoutEditorConfig } from "@/lib/layout/queueRecordLayoutV3";
import {
    fetchEntityLayoutRecord,
    patchEntityLayoutDraft,
    publishEntityLayoutDraft,
} from "@/lib/layout/opportunityDrawerLayoutEditorApi";
import { isWaitlistQueueLayoutDoc } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import { validateQueueRecordLayoutConfig } from "@/lib/layout/runtime/validateQueueRecordLayoutConfig";
import {
    formatLayoutDraftTitleWithVersion,
    formatLayoutPublishedTitleWithVersion,
    resolveLayoutStableTitle,
} from "@/lib/layout/layoutVersionNaming";
import {
    resolveSurfaceLayoutKeyFromDoc,
    getSurfaceLayoutRegistryEntry,
} from "@/lib/layout/surfaceLayoutRegistry";

type CatalogResponse = { groups: LayoutFieldPickerCatalog["groups"]; widgets: LayoutFieldPickerCatalog["widgets"] };

type Props = {
    layoutId: string;
    basePath: string;
    onBack: () => void;
    onLayoutIdChange?: (layoutId: string) => void;
};

export default function QueueRecordLayoutVisualEditor({
    layoutId,
    basePath,
    onBack,
    onLayoutIdChange,
}: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [record, setRecord] = useState<EntityLayoutRecord | null>(null);
    const [workingDoc, setWorkingDoc] = useState<LayoutDoc | null>(null);
    const [workingName, setWorkingName] = useState("");
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState<"save" | "publish" | null>(null);
    const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    const surfaceKey = useMemo(
        () => (workingDoc ? resolveSurfaceLayoutKeyFromDoc(workingDoc) : null),
        [workingDoc],
    );
    const surfaceLabel = surfaceKey ? getSurfaceLayoutRegistryEntry(surfaceKey).label : "Queue row";
    const isWaitlist = isWaitlistQueueLayoutDoc(workingDoc);
    const editable = record?.status !== "published";

    const loadCatalogs = useCallback(async (doc: LayoutDoc, entityType: string) => {
        const entityRes = await fetch(
            `/api/admin/entity-layouts/field-catalog?entity_type=${encodeURIComponent(entityType)}`,
        );
        const entityCat = entityRes.ok ? ((await entityRes.json()) as CatalogResponse) : null;
        let v3Cat = entityCat;
        if (doc.surface === "queue" && isWaitlistQueueLayoutDoc(doc)) {
            const oppRes = await fetch("/api/admin/entity-layouts/field-catalog?entity_type=opportunities");
            v3Cat = oppRes.ok ? ((await oppRes.json()) as CatalogResponse) : entityCat;
        }
        setCatalog(v3Cat);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setValidationError(null);
        try {
            const rec = await fetchEntityLayoutRecord(layoutId);
            const parsed = parseLayoutDoc(rec.doc, { inferSurfaceKey: true });
            if (!parsed.ok || !parsed.doc) {
                throw new Error(parsed.errors.join("; ") || "Invalid layout document");
            }
            if (parsed.doc.surface !== "queue") {
                throw new Error("This layout is not a queue row surface.");
            }
            setRecord(rec);
            setWorkingDoc(parsed.doc);
            setWorkingName(resolveLayoutStableTitle(rec.name));
            setDirty(false);
            await loadCatalogs(parsed.doc, rec.entityType);
        } catch (e) {
            setError((e as Error).message);
            setRecord(null);
            setWorkingDoc(null);
        } finally {
            setLoading(false);
        }
    }, [layoutId, loadCatalogs]);

    useEffect(() => {
        void load();
    }, [load]);

    const applyQueueConfig = useCallback(
        (config: QueueRecordLayoutEditorConfig) => {
            if (!workingDoc) return;
            const next: LayoutDoc = {
                ...workingDoc,
                metadata: {
                    ...(workingDoc.metadata ?? {}),
                    queue_record_layout: config,
                },
            };
            setWorkingDoc(next);
            setDirty(true);
            const validation = validateQueueRecordLayoutConfig(config, { isWaitlist });
            setValidationError(validation.ok ? null : validation.errors.map((e) => e.message).join("; "));
        },
        [workingDoc, isWaitlist],
    );

    const saveDraft = useCallback(async () => {
        if (!workingDoc || !record) return;
        const config = (workingDoc.metadata as { queue_record_layout?: unknown } | undefined)?.queue_record_layout;
        if (config) {
            const validation = validateQueueRecordLayoutConfig(
                config as QueueRecordLayoutEditorConfig,
                { isWaitlist },
            );
            if (!validation.ok) {
                setValidationError(validation.errors.map((e) => e.message).join("; "));
                return;
            }
        }
        setBusy("save");
        setError(null);
        try {
            let target = record;
            if (record.status === "published") {
                target = await forkPublishedLayoutToDraft(record);
                onLayoutIdChange?.(target.id);
                setRecord(target);
            }
            const saved = await patchEntityLayoutDraft(target.id, workingName, workingDoc);
            setRecord(saved);
            setWorkingDoc(parseLayoutDocFromRecord(saved));
            setDirty(false);
            setValidationError(null);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [workingDoc, record, workingName, isWaitlist, onLayoutIdChange]);

    const publish = useCallback(async () => {
        if (!record || dirty) return;
        setBusy("publish");
        setError(null);
        try {
            const published = await publishEntityLayoutDraft(record.id);
            setRecord(published);
            setWorkingDoc(parseLayoutDocFromRecord(published));
            dispatchOpportunityQueueLayoutPublished(published.doc);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(null);
        }
    }, [record, dirty]);

    const advancedHref = `${basePath}?editor=1&layout=${encodeURIComponent(layoutId)}&advanced=1`;

    if (loading) {
        return (
            <div
                className="rounded-xl border border-alloy-forge/12 bg-white/90 p-6 text-sm text-alloy-midnight/55"
                data-testid="queue-record-visual-editor-loading"
            >
                Loading queue row layout…
            </div>
        );
    }

    if (!workingDoc || !record) {
        return (
            <div className="space-y-3" data-testid="queue-record-visual-editor-error">
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error ?? "Unable to load queue row layout."}
                </p>
                <button type="button" onClick={onBack} className="text-xs font-medium text-alloy-pine hover:underline">
                    ← Back to layout gallery
                </button>
            </div>
        );
    }

    const layoutVersionHint =
        record.status === "published" ?
            formatLayoutPublishedTitleWithVersion(workingName, record.version)
        :   formatLayoutDraftTitleWithVersion(workingName, record.version);

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4" data-testid="queue-record-visual-editor">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-alloy-forge/10 bg-white/95 px-4 py-3 shadow-sm">
                <div className="min-w-0">
                    <button
                        type="button"
                        onClick={onBack}
                        className="mb-1 text-xs font-medium text-alloy-pine hover:underline"
                        data-testid="queue-record-editor-back"
                    >
                        ← Back to layout gallery
                    </button>
                    <h2 className="text-base font-semibold text-alloy-midnight">{surfaceLabel}</h2>
                    <p className="text-xs text-alloy-midnight/55">{layoutVersionHint}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        value={workingName}
                        onChange={(e) => {
                            setWorkingName(e.target.value);
                            setDirty(true);
                        }}
                        disabled={!editable && record.status === "published"}
                        className="min-w-[10rem] rounded border border-alloy-forge/15 px-2 py-1 text-sm disabled:bg-alloy-stone/10"
                        placeholder="Layout name"
                    />
                    <button
                        type="button"
                        disabled={!editable || busy != null || Boolean(validationError)}
                        onClick={() => void saveDraft()}
                        className="rounded-lg border border-alloy-forge/15 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight shadow-sm disabled:opacity-50"
                    >
                        {busy === "save" ? "Saving…" : "Save draft"}
                    </button>
                    <button
                        type="button"
                        disabled={dirty || record.status !== "draft" || busy != null || Boolean(validationError)}
                        onClick={() => void publish()}
                        className="rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-50"
                    >
                        {busy === "publish" ? "Publishing…" : "Publish"}
                    </button>
                    <Link
                        href={advancedHref}
                        className="text-[11px] font-medium text-alloy-midnight/50 hover:text-alloy-pine hover:underline"
                    >
                        Advanced builder
                    </Link>
                </div>
            </div>

            {error ?
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            :   null}
            {validationError ?
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {validationError}
                </div>
            :   null}
            {record.status === "published" ?
                <div className="rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.04] px-3 py-2 text-xs text-alloy-midnight/65">
                    Published layouts are read-only. Save draft creates an editable copy automatically.
                </div>
            :   null}

            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-alloy-forge/10 bg-white/95 p-4 shadow-sm">
                <QueueRecordLayoutSettingsPanel
                    doc={workingDoc}
                    editable={editable || record.status === "draft"}
                    catalog={catalog}
                    onChange={applyQueueConfig}
                />
            </div>
        </div>
    );
}
