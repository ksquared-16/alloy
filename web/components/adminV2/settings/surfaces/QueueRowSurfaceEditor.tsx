"use client";

/**
 * Queue Row Surface Builder — full-bleed editor (mirrors Workspace / Work Unit Header pattern).
 *
 * One surface per Business Process. Variants are presentation-only tabs inside the builder.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import type { QueueRowVariant } from "@/lib/layout/queueRecordLayoutV3";
import {
    createQueueRowVariant,
    type QueueRowSurfaceEnvelope,
} from "@/lib/presentation/runtime/queueRowSurfaceMetadata";
import {
    defaultQueueRowSurfaceName,
    queueRowProcessConfigKey,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import {
    dispatchQueueRowSurfacePublished,
    loadQueueRowSurfaceConfig,
    publishQueueRowSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import QueueRowBuilderV2 from "@/components/adminV2/settings/surfaces/QueueRowBuilderV2";

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-lg border border-alloy-stone/12 bg-white p-3">
            <h3 className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-alloy-midnight/40">
                {title}
            </h3>
            <div className="flex flex-col gap-2.5">{children}</div>
        </section>
    );
}

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

    const variantTabs = useMemo((): VariantTab[] => {
        const variants = envelope?.layout.variants ?? [];
        return [
            { id: "__default__", label: "Default", isDefault: true },
            ...variants.map((v) => ({ id: v.id, label: v.label, isDefault: false })),
        ];
    }, [envelope?.layout.variants]);

    const activeLayout = useMemo(() => {
        if (!envelope) return null;
        if (!activeVariantId || activeVariantId === "__default__") return envelope.layout;
        const variant = envelope.layout.variants?.find((v) => v.id === activeVariantId);
        if (!variant) return envelope.layout;
        return { ...envelope.layout, columns: variant.columns, fixedControls: variant.fixedControls ?? envelope.layout.fixedControls };
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
            label: `Variant ${priority + 1}`,
            priority: priority * 10,
            seedFrom: envelope.layout,
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

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-testid="queue-row-surface-editor">
            <header className="flex flex-wrap items-center gap-3 border-b border-alloy-stone/10 px-4 py-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="text-sm font-medium text-alloy-pine hover:underline"
                    data-testid="queue-row-surface-back"
                >
                    ← Surfaces
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
                    <p className="text-sm text-alloy-midnight/55">{catalogEntry.lifecycle_name} · presentation variants</p>
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

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-4">
                <div className="min-w-0 space-y-3">
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
                            className="rounded-full border border-dashed border-alloy-stone/30 px-3 py-1 text-xs font-medium text-alloy-midnight/50 hover:border-alloy-pine/40 hover:text-alloy-pine"
                            data-testid="queue-row-add-variant"
                        >
                            + Add variant
                        </button>
                    </div>

                    {loading || !envelope || !activeLayout ? (
                        <div className="h-32 animate-pulse rounded-xl bg-alloy-stone/10" />
                    ) : (
                        <QueueRowBuilderV2
                            surfaceId={surfaceId}
                            embedded
                            canvasPresentation="preview-only"
                            controlledLayout={activeLayout}
                            onControlledLayoutChange={patchActiveLayoutColumns}
                            onDirtyChange={setDirty}
                            previewStageKey={
                                activeVariant?.appliesWhen?.stage_key?.[0] ??
                                (activeVariant?.label === "Waitlist" ? "waitlist" : activeVariant?.label === "Tour" ? "tour_scheduled" : "new_lead")
                            }
                        />
                    )}
                </div>

                <aside className="min-w-0 space-y-3">
                    {activeVariant ? (
                        <InspectorSection title="Variant rules">
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] font-medium text-alloy-midnight/75">Variant name</span>
                                <input
                                    type="text"
                                    value={activeVariant.label}
                                    onChange={(e) => patchVariant(activeVariant.id, { label: e.target.value })}
                                    className="rounded border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                    data-testid="queue-row-variant-name"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] font-medium text-alloy-midnight/75">Match stage keys (comma-separated)</span>
                                <input
                                    type="text"
                                    value={(activeVariant.appliesWhen?.stage_key ?? []).join(", ")}
                                    onChange={(e) =>
                                        patchVariant(activeVariant.id, {
                                            appliesWhen: {
                                                ...activeVariant.appliesWhen,
                                                stage_key: e.target.value
                                                    .split(",")
                                                    .map((s) => s.trim())
                                                    .filter(Boolean),
                                            },
                                        })
                                    }
                                    className="rounded border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                    data-testid="queue-row-variant-stage-keys"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] font-medium text-alloy-midnight/75">Subject focus</span>
                                <select
                                    value={activeVariant.subjectFocus ?? "household"}
                                    onChange={(e) =>
                                        patchVariant(activeVariant.id, {
                                            subjectFocus: e.target.value as QueueRowVariant["subjectFocus"],
                                        })
                                    }
                                    className="rounded border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                    data-testid="queue-row-variant-subject-focus"
                                >
                                    <option value="household">Family</option>
                                    <option value="active_child">Child</option>
                                    <option value="placement_candidate_child">Candidate</option>
                                    <option value="opportunity">Opportunity</option>
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[12px] font-medium text-alloy-midnight/75">Priority (lower wins first)</span>
                                <input
                                    type="number"
                                    value={activeVariant.priority}
                                    onChange={(e) =>
                                        patchVariant(activeVariant.id, {
                                            priority: Number.parseInt(e.target.value, 10) || 0,
                                        })
                                    }
                                    className="rounded border border-alloy-stone/20 px-2 py-1.5 text-sm"
                                />
                            </label>
                        </InspectorSection>
                    ) : (
                        <InspectorSection title="Default variant">
                            <p className="text-sm text-alloy-midnight/60">
                                Renders when no configured variant rule matches. Configure Tour, Waitlist, and Enrolling
                                variants with stage rules for presentation-only differences.
                            </p>
                        </InspectorSection>
                    )}
                </aside>
            </div>
        </div>
    );
}
