"use client";

/**
 * Queue Row Surface Builder — canvas-first visual editor.
 *
 * One surface per Business Process. Variants are presentation-only tabs;
 * the row canvas is the primary editing surface with contextual inspectors.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import {
    createQueueRowVariant,
    queueRowSurfaceHasConfiguredColumns,
    QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE,
    type QueueRowSurfaceEnvelope,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import {
    resolveQueueRowCatalogIsWaitlist,
    resolveQueueRowIncludeWaitlistLibraryFields,
} from "@/lib/adminV2/settings/surfaces/queueRowBuilderPreview";
import { subjectFocusToUi } from "@/lib/adminV2/settings/surfaces/queueRowSubjectFocus";
import {
    defaultQueueRowSurfaceName,
    queueRowProcessConfigKey,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import {
    dispatchQueueRowSurfacePublished,
    loadQueueRowSurfaceConfig,
    publishQueueRowSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import QueueRowBuilderV2 from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";
import QueueRowVariantSettings from "@/components/adminV2/settings/surfaces/QueueRowVariantSettings";
import type { ProcessStageOption } from "@/components/adminV2/settings/surfaces/QueueRowVariantStagePicker";

export type QueueRowSurfaceEditorProps = {
    catalogEntry: LifecycleCatalogEntry;
    onBack: () => void;
    onPublished?: () => void;
};

type VariantTab = { id: string; label: string; isDefault: boolean };

export default function QueueRowSurfaceEditor({
    catalogEntry,
    onBack,
    onPublished,
}: QueueRowSurfaceEditorProps) {
    const surfaceId = `queue-row-${catalogEntry.id.replace(/:/g, "-")}`;
    const processKey = queueRowProcessConfigKey(catalogEntry) ?? catalogEntry.process_key ?? "enrollment";

    const [envelope, setEnvelope] = useState<QueueRowSurfaceEnvelope | null>(null);
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
    const [processStages, setProcessStages] = useState<ProcessStageOption[]>([]);
    const [stagesLoading, setStagesLoading] = useState(true);

    useEffect(() => {
        let active = true;
        setLoading(true);
        loadQueueRowSurfaceConfig(surfaceId, processKey)
            .then((loaded) => {
                if (!active) return;
                setEnvelope({
                    ...loaded.envelope,
                    name: loaded.envelope.name || defaultQueueRowSurfaceName(catalogEntry.lifecycle_name),
                    catalogId: catalogEntry.id,
                    processKey,
                });
                setDirty(false);
            })
            .catch((e: unknown) => {
                if (active) setError(e instanceof Error ? e.message : "Failed to load");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [surfaceId, processKey, catalogEntry.id, catalogEntry.lifecycle_name]);

    useEffect(() => {
        let active = true;
        setStagesLoading(true);
        const qs = new URLSearchParams({
            department_id: catalogEntry.department_id,
            process_id: catalogEntry.process_id,
        });
        fetch(`/api/admin/lifecycle-builder/process-work-views?${qs}`, workspaceDataFetchInit())
            .then(async (res) => {
                const body = (await res.json().catch(() => ({}))) as { stages?: ProcessStageOption[] };
                if (!active) return;
                setProcessStages(body.stages ?? []);
            })
            .catch(() => {
                if (active) setProcessStages([]);
            })
            .finally(() => {
                if (active) setStagesLoading(false);
            });
        return () => {
            active = false;
        };
    }, [catalogEntry.department_id, catalogEntry.process_id]);

    const variantTabs = useMemo((): VariantTab[] => {
        const variants = envelope?.layout.variants ?? [];
        return [
            { id: "__default__", label: "Default", isDefault: true },
            ...variants.map((v) => ({
                id: v.id,
                label: v.label || "Variant",
                isDefault: false,
            })),
        ];
    }, [envelope?.layout.variants]);

    const activeLayout = useMemo(() => {
        if (!envelope) return null;
        if (!activeVariantId || activeVariantId === "__default__") return envelope.layout;
        const variant = envelope.layout.variants?.find((v) => v.id === activeVariantId);
        if (!variant) return envelope.layout;
        return {
            ...envelope.layout,
            columns: variant.columns,
            fixedControls: variant.fixedControls ?? envelope.layout.fixedControls,
        };
    }, [envelope, activeVariantId]);

    const patchEnvelope = useCallback((patch: Partial<QueueRowSurfaceEnvelope>) => {
        setEnvelope((prev) => (prev ? { ...prev, ...patch } : prev));
        setDirty(true);
    }, []);

    const patchActiveLayoutColumns = useCallback(
        (nextLayout: QueueRowSurfaceEnvelope["layout"]) => {
            setEnvelope((prev) => {
                if (!prev) return prev;
                if (!activeVariantId || activeVariantId === "__default__") {
                    return { ...prev, layout: nextLayout };
                }
                const variants = (prev.layout.variants ?? []).map((v) =>
                    v.id === activeVariantId
                        ? {
                              ...v,
                              columns: nextLayout.columns,
                              fixedControls: nextLayout.fixedControls,
                          }
                        : v,
                );
                return { ...prev, layout: { ...prev.layout, variants } };
            });
            setDirty(true);
        },
        [activeVariantId],
    );

    const patchVariant = useCallback((variantId: string, patch: Partial<QueueRowVariant>) => {
        setEnvelope((prev) => {
            if (!prev) return prev;
            const variants = (prev.layout.variants ?? []).map((v) =>
                v.id === variantId ? { ...v, ...patch } : v,
            );
            return { ...prev, layout: { ...prev.layout, variants } };
        });
        setDirty(true);
    }, []);

    function addVariant() {
        if (!envelope) return;
        const priority = (envelope.layout.variants?.length ?? 0) + 1;
        const variant = createQueueRowVariant({
            label: "Variant",
            priority: priority * 10,
        });
        setEnvelope((prev) =>
            prev
                ? {
                      ...prev,
                      layout: {
                          ...prev.layout,
                          variants: [...(prev.layout.variants ?? []), variant],
                      },
                  }
                : prev,
        );
        setActiveVariantId(variant.id);
        setDirty(true);
    }

    async function handlePublish() {
        if (!envelope) return;
        if (!queueRowSurfaceHasConfiguredColumns(envelope.layout)) {
            setError(QUEUE_ROW_PUBLISH_EMPTY_COLUMNS_MESSAGE);
            return;
        }
        setPublishing(true);
        setError(null);
        try {
            await publishQueueRowSurfaceConfig({ surfaceId, envelope });
            dispatchQueueRowSurfacePublished(surfaceId);
            setDirty(false);
            onPublished?.();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Publish failed");
        } finally {
            setPublishing(false);
        }
    }

    const activeVariant =
        activeVariantId && activeVariantId !== "__default__"
            ? envelope?.layout.variants?.find((v) => v.id === activeVariantId)
            : null;

    const libraryCatalogIsWaitlist = resolveQueueRowCatalogIsWaitlist({ processStages });
    const libraryIncludeWaitlistFields = resolveQueueRowIncludeWaitlistLibraryFields({
        activeVariant,
        processStages,
    });
    const rowFocusUi = subjectFocusToUi(activeVariant?.subjectFocus);

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="queue-row-surface-editor">
            <header className="flex flex-wrap items-center gap-3 border-b border-alloy-stone/10 px-4 py-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-sm font-medium text-alloy-pine hover:underline"
                    data-testid="queue-row-surface-back"
                >
                    ← Overview
                </button>
                <div className="min-w-0 flex-1">
                    <input
                        type="text"
                        value={envelope?.name ?? ""}
                        onChange={(e) => patchEnvelope({ name: e.target.value })}
                        className="w-full max-w-md border-0 bg-transparent text-lg font-semibold text-alloy-midnight outline-none focus:ring-0"
                        aria-label="Queue row surface name"
                        data-testid="queue-row-surface-name"
                        disabled={loading || !envelope}
                    />
                    <p className="text-sm text-alloy-midnight/55">{catalogEntry.lifecycle_name} · click the row to add content</p>
                </div>
                <button
                    type="button"
                    onClick={() => void handlePublish()}
                    disabled={!dirty || publishing || loading || !envelope}
                    className="rounded-lg bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90 disabled:opacity-40"
                    data-testid="queue-row-surface-publish"
                >
                    {publishing ? "Publishing…" : "Publish"}
                </button>
            </header>

            {error ? (
                <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
                <div className="flex flex-wrap items-center gap-2" data-testid="queue-row-variant-tabs">
                    {variantTabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveVariantId(tab.isDefault ? null : tab.id)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                (tab.isDefault && !activeVariantId) || activeVariantId === tab.id
                                    ? "bg-alloy-pine text-white"
                                    : "bg-alloy-stone/10 text-alloy-midnight/65 hover:bg-alloy-stone/20"
                            }`}
                            data-variant-tab={tab.id}
                        >
                            {tab.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={addVariant}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-alloy-stone/30 text-sm font-medium text-alloy-midnight/50 hover:border-alloy-pine/40 hover:text-alloy-pine"
                        aria-label="Add variant"
                        data-testid="queue-row-add-variant"
                    >
                        +
                    </button>
                </div>

                {loading || !envelope || !activeLayout ? (
                    <div className="h-32 animate-pulse rounded-xl bg-alloy-stone/10" />
                ) : (
                    <>
                        <QueueRowBuilderV2
                            key={activeVariantId ?? "__default__"}
                            surfaceId={surfaceId}
                            embedded
                            controlledLayout={activeLayout}
                            onControlledLayoutChange={patchActiveLayoutColumns}
                            onDirtyChange={setDirty}
                            libraryCatalogIsWaitlist={libraryCatalogIsWaitlist}
                            libraryIncludeWaitlistFields={libraryIncludeWaitlistFields}
                            rowFocusUi={rowFocusUi}
                        />
                        {activeVariant ? (
                            <QueueRowVariantSettings
                                variant={activeVariant}
                                processStages={processStages}
                                stagesLoading={stagesLoading}
                                onPatch={(patch) => patchVariant(activeVariant.id, patch)}
                            />
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}
