"use client";

import {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import FocusPanelSummarySurfaceEditor from "@/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor";
import {
    useSurfacesConfigurationSettings,
    type SurfaceConfigSectionKey,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

const SURFACES_SUBTITLE =
    "Where operators see actions — Design Surfaces for queue rows, the Focus Panel, and cards.";

function sectionEmptyListCopy(section: SurfaceConfigSectionKey): string {
    if (section === "queue-rows") return "Queue row surfaces aren’t authorable here yet.";
    if (section === "workspaces") return "Workspace surfaces aren’t authorable here yet.";
    if (section === "dashboards") return "Dashboard & analytics surfaces aren’t authorable here yet.";
    return "No Focus Panel surfaces yet.";
}

export default function SurfacesConfigurationPage() {
    const { section, setSection, selectedId, setSelectedId, sections, listItems, selectedObject } =
        useSurfacesConfigurationSettings();

    const editing = Boolean(selectedObject?.editor);
    const activeSectionLabel = sections.find((s) => s.key === section)?.label ?? "";
    // Catalogued (non-editor) surface with a composition preview — e.g. Dashboard / Analytics.
    const previewObject = selectedObject && !selectedObject.editor && selectedObject.previewHref ? selectedObject : null;

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="surfaces-configuration-page">
            <ConfigurationContext
                title="Surfaces"
                subtitle={SURFACES_SUBTITLE}
                testId="surfaces-configuration-context"
            />

            {/* Editing collapses the browsing columns so the canvas wins, but the
                Configuration Runtime shell (Context → Section → Workspace) is
                preserved — the editor lives inside the workspace. */}
            {editing && selectedObject ? (
                <ConfigurationShell testId="surfaces-configuration-shell">
                    <div className="flex h-full min-h-0 flex-col gap-3">
                        {/* Slim breadcrumb replaces the section + object queues while editing. */}
                        <div
                            className="flex items-center justify-between gap-2"
                            data-testid="surfaces-breadcrumb"
                        >
                            <p className="text-xs text-alloy-midnight/55">
                                <button
                                    type="button"
                                    data-testid="surfaces-breadcrumb-home"
                                    onClick={() => setSelectedId(null)}
                                    className="font-medium text-alloy-midnight/70 hover:text-alloy-pine"
                                >
                                    Surfaces
                                </button>
                                <span className="mx-1 text-alloy-midnight/30">›</span>
                                <span>{activeSectionLabel}</span>
                                <span className="mx-1 text-alloy-midnight/30">›</span>
                                <span className="font-medium text-alloy-midnight/80">{selectedObject.title}</span>
                            </p>
                            <button
                                type="button"
                                data-testid="surfaces-change-surface"
                                onClick={() => setSelectedId(null)}
                                className="rounded-lg border border-alloy-forge/20 bg-white px-2.5 py-1 text-xs font-medium text-alloy-midnight/65 hover:bg-alloy-stone/[0.06]"
                            >
                                Change surface
                            </button>
                        </div>

                        <div className="min-h-0 flex-1">
                            <FocusPanelSummarySurfaceEditor />
                        </div>
                    </div>
                </ConfigurationShell>
            ) : (
                <ConfigurationShell
                    testId="surfaces-configuration-shell"
                    queueColumn={
                        <ConfigurationQueue title="Surface categories" testId="surfaces-section-queue">
                            {sections.map((s) => (
                                <ConfigurationQueueItem
                                    key={s.key}
                                    active={s.key === section}
                                    title={s.label}
                                    onClick={() => setSection(s.key)}
                                    testId={`surfaces-category-item-${s.key}`}
                                />
                            ))}
                        </ConfigurationQueue>
                    }
                    listColumn={
                        <ConfigurationQueue title={activeSectionLabel} testId="surfaces-object-queue-list">
                            {listItems.length === 0 ? (
                                <p className="config-typo-sublabel px-1 py-2" data-testid="surfaces-empty-list">
                                    {sectionEmptyListCopy(section)}
                                </p>
                            ) : (
                                listItems.map((item) => (
                                    <ConfigurationQueueItem
                                        key={item.id}
                                        active={item.id === selectedId}
                                        title={item.title}
                                        subtitle={item.subtitle}
                                        onClick={() => setSelectedId(item.id)}
                                        testId={`surfaces-object-item-${item.id}`}
                                    />
                                ))
                            )}
                        </ConfigurationQueue>
                    }
                >
                    {previewObject ? (
                        <ConfigurationDetailCard testId="surfaces-dashboard-preview" title={previewObject.title}>
                            <div className="space-y-3">
                                <p className="config-typo-sublabel">
                                    {previewObject.subtitle ? `${previewObject.subtitle}. ` : ""}
                                    Analytics is a Dashboard Design Surface — composed from the Metric archetype and the
                                    shared Renderer catalog. Configuration lives here in Surfaces; the live runtime opens
                                    in the Workspace → Operational Intelligence modal. An in-place editor lands in a later
                                    slice; preview the composition and visual language below.
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                    {previewObject.liveHref ? (
                                        <a
                                            href={previewObject.liveHref}
                                            data-testid="surfaces-dashboard-live-link"
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-alloy-pine/90"
                                        >
                                            Open in Workspace
                                            <span aria-hidden="true">→</span>
                                        </a>
                                    ) : null}
                                    <a
                                        href={previewObject.previewHref}
                                        target="_blank"
                                        rel="noreferrer"
                                        data-testid="surfaces-dashboard-preview-link"
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-stone/25 px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:bg-alloy-stone/[0.06]"
                                    >
                                        Preview (mock surface)
                                        <span aria-hidden="true">↗</span>
                                    </a>
                                </div>
                            </div>
                        </ConfigurationDetailCard>
                    ) : (
                        <ConfigurationEmptyState
                            testId="surfaces-workspace-empty"
                            title={`${activeSectionLabel} surfaces`}
                            description={
                                listItems.length === 0
                                    ? sectionEmptyListCopy(section)
                                    : "Select a Design Surface to open the editor. The canvas renders the live runtime with editing layered on top."
                            }
                        />
                    )}
                </ConfigurationShell>
            )}
        </div>
    );
}
