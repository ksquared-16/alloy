"use client";

import {
    ConfigurationContext,
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import FocusPanelSurfaceEditor from "@/components/adminV2/settings/surfaces/FocusPanelSurfaceEditor";
import OperationalIntelligenceSurfaceBuilder from "@/components/adminV2/settings/surfaces/OperationalIntelligenceSurfaceBuilder";
import WorkUnitHeaderSurfaceEditor from "@/components/adminV2/settings/surfaces/WorkUnitHeaderSurfaceEditor";
import WorkspaceHeaderSurfaceEditor from "@/components/adminV2/settings/surfaces/WorkspaceHeaderSurfaceEditor";
import WorkspaceProcessesSurfaceEditor from "@/components/adminV2/settings/surfaces/WorkspaceProcessesSurfaceEditor";
import QueueRowSurfaceEditor from "@/components/adminV2/settings/surfaces/QueueRowSurfaceEditor";
import { useQueueRowProcessCatalog } from "@/components/adminV2/settings/surfaces/useQueueRowProcessCatalog";
import {
    catalogIdFromQueueRowSurfaceId,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import NestedSurfaceEditor from "@/components/adminV2/settings/surfaces/NestedSurfaceEditor";
import { nestedSurfaceLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { useMemo, useState as useReactState } from "react";
import { sectionLabel } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";
import {
    useSurfacesConfigurationSettings,
    type SurfaceConfigSectionKey,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import { useWorkspaceProcessCatalog } from "@/components/adminV2/settings/surfaces/useWorkspaceProcessCatalog";
import {
    findCatalogEntryBySurfaceId,
    surfaceObjectForCatalogEntry,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessCatalog";

const SURFACES_SUBTITLE =
    "Where operators see actions — configure queue rows, focus panels, workspaces, and operational intelligence.";

function sectionEmptyListCopy(section: SurfaceConfigSectionKey): string {
    if (section === "queue-rows") return "No queue row surfaces found.";
    if (section === "work-units") return "No work unit surfaces yet.";
    if (section === "operational-intelligence") return "No operational intelligence surfaces yet.";
    if (section === "workspaces") return "No workspace processes configured.";
    return "No focus panel surfaces yet.";
}

function SurfacesCategoryNav({
    sections,
    activeSection,
    onSelect,
}: {
    sections: readonly { key: SurfaceConfigSectionKey; label: string }[];
    activeSection: SurfaceConfigSectionKey;
    onSelect: (key: SurfaceConfigSectionKey) => void;
}) {
    return (
        <nav className="configuration-section-queue process-config-nav" aria-label="Surface categories" data-testid="surfaces-section-queue">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                Surfaces
            </p>
            <div className="space-y-0.5">
                {sections.map((s) => {
                    const active = s.key === activeSection;
                    return (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => onSelect(s.key)}
                            className={`process-config-nav-item w-full ${active ? "process-config-nav-item--active" : "text-alloy-midnight/75"}`}
                            data-testid={`surfaces-category-item-${s.key}`}
                            aria-current={active ? "page" : undefined}
                        >
                            <span className={`text-sm font-semibold ${active ? "text-alloy-pine" : ""}`}>
                                {s.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

export default function SurfacesConfigurationPage() {
    const [pendingCatalogIds, setPendingCatalogIds] = useReactState<string[]>([]);
    const {
        loading: workspaceCatalogLoading,
        configuredSurfaces,
        availableToCreate,
        catalog,
        reload: reloadWorkspaceCatalog,
    } = useWorkspaceProcessCatalog(pendingCatalogIds);

    const {
        loading: queueRowCatalogLoading,
        configuredSurfaces: queueRowSurfaces,
        catalog: queueRowCatalog,
        reload: reloadQueueRowCatalog,
    } = useQueueRowProcessCatalog();

    const {
        section,
        setSection,
        selectedId,
        setSelectedId,
        goHome,
        sections,
        listItems,
        selectedObject,
    } = useSurfacesConfigurationSettings(configuredSurfaces, queueRowSurfaces);

    const activeSectionLabel = sectionLabel(section);
    const [nestedStack, setNestedStack] = useReactState<{ surfaceId: string; cardLabel?: string }[]>([]);
    const activeNested = nestedStack[nestedStack.length - 1] ?? null;

    const isWorkspaceProcessEditor = selectedObject?.editor === "workspace-processes";
    const isWorkspaceHeaderEditor = selectedObject?.editor === "workspace-header";
    const isWorkUnitHeaderEditor = selectedObject?.editor === "work-unit-header";
    const isQueueRowEditor = selectedObject?.editor === "queue-row-builder";
    const isFocusPanelEditor = selectedObject?.editor === "focus-panel-summary";
    const isFullBleedWorkspaceEditor =
        isWorkspaceProcessEditor ||
        isWorkspaceHeaderEditor ||
        isWorkUnitHeaderEditor ||
        isQueueRowEditor ||
        isFocusPanelEditor ||
        nestedStack.length > 0;
    const selectedCatalogEntry =
        selectedObject?.catalogId
            ? catalog.find((e) => e.id === selectedObject.catalogId) ??
              findCatalogEntryBySurfaceId(catalog, selectedObject.id)
            : selectedId
              ? findCatalogEntryBySurfaceId(catalog, selectedId)
              : null;

    const configuredCatalogEntries = configuredSurfaces
        .map((s) => catalog.find((e) => e.id === s.catalogId) ?? findCatalogEntryBySurfaceId(catalog, s.id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e));

    const selectedQueueRowCatalogEntry = useMemo(() => {
        if (selectedObject?.catalogId) {
            return queueRowCatalog.find((e) => e.id === selectedObject.catalogId) ?? null;
        }
        const fromId = selectedId ? catalogIdFromQueueRowSurfaceId(selectedId) : null;
        if (!fromId) return null;
        return queueRowCatalog.find((e) => e.id === fromId) ?? null;
    }, [selectedObject, selectedId, queueRowCatalog]);

    const previewObject = selectedObject && !selectedObject.editor && (selectedObject.previewHref || selectedObject.liveHref)
        ? selectedObject
        : null;
    const catalogOnly = selectedObject && !selectedObject.editor && !previewObject ? selectedObject : null;

    const contextActions =
        selectedId && !isFullBleedWorkspaceEditor ? (
            <button
                type="button"
                data-testid="surfaces-back-home"
                onClick={() => {
                    setNestedStack([]);
                    goHome();
                }}
                className="rounded-lg border border-alloy-forge/20 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:border-alloy-pine/35 hover:text-alloy-pine"
            >
                Surfaces
            </button>
        ) : null;

    function renderWorkspace() {
        if (!selectedObject) {
            return (
                <ConfigurationEmptyState
                    testId="surfaces-workspace-empty"
                    title={activeSectionLabel}
                    description={`Select a surface from the left to configure ${activeSectionLabel.toLowerCase()}.`}
                />
            );
        }

        if (previewObject) {
            return (
                <ConfigurationDetailCard testId="surfaces-dashboard-preview" title={previewObject.title}>
                    <div className="space-y-3">
                        <p className="config-typo-sublabel">
                            {previewObject.subtitle ? `${previewObject.subtitle}. ` : ""}
                            Analytics surfaces compose from the Metric archetype and shared Renderer catalog.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            {previewObject.configureHref ? (
                                <a
                                    href={previewObject.configureHref}
                                    data-testid="surfaces-dashboard-configure-link"
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white hover:bg-alloy-pine/90"
                                >
                                    Configure
                                    <span aria-hidden="true">→</span>
                                </a>
                            ) : null}
                            {previewObject.liveHref ? (
                                <a
                                    href={previewObject.liveHref}
                                    data-testid="surfaces-dashboard-live-link"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-pine/40 px-3 py-1.5 text-xs font-semibold text-alloy-pine hover:bg-alloy-pine/[0.06]"
                                >
                                    Open in Workspace
                                    <span aria-hidden="true">→</span>
                                </a>
                            ) : null}
                            {previewObject.previewHref ? (
                                <a
                                    href={previewObject.previewHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    data-testid="surfaces-dashboard-preview-link"
                                    className="inline-flex gap-1 text-[11px] font-medium text-alloy-midnight/45 underline-offset-2 hover:underline"
                                >
                                    Preview (mock surface, dev)
                                    <span aria-hidden="true">↗</span>
                                </a>
                            ) : null}
                        </div>
                    </div>
                </ConfigurationDetailCard>
            );
        }

        if (catalogOnly) {
            return (
                <ConfigurationDetailCard testId="surfaces-catalog-detail" title={catalogOnly.title}>
                    <div className="space-y-3">
                        <p className="config-typo-sublabel">
                            {catalogOnly.subtitle ?? "This surface is catalogued for the workspace hierarchy."}
                        </p>
                        {catalogOnly.liveHref ? (
                            <a
                                href={catalogOnly.liveHref}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-alloy-pine/40 px-3 py-1.5 text-xs font-semibold text-alloy-pine hover:bg-alloy-pine/[0.06]"
                            >
                                Open in Workspace
                                <span aria-hidden="true">→</span>
                            </a>
                        ) : (
                            <p className="text-xs text-alloy-midnight/45">Authoring for this surface is coming soon.</p>
                        )}
                    </div>
                </ConfigurationDetailCard>
            );
        }

        if (selectedObject.editor === "operational-intelligence") {
            return <OperationalIntelligenceSurfaceBuilder />;
        }

        return (
            <ConfigurationEmptyState
                testId="surfaces-workspace-unconfigured"
                title={selectedObject.title}
                description="This surface does not have an editor wired yet."
            />
        );
    }

    if (isQueueRowEditor && selectedQueueRowCatalogEntry) {
        return (
            <div className="process-config-page flex min-h-0 flex-1 flex-col" data-testid="surfaces-configuration-page">
                <QueueRowSurfaceEditor
                    catalogEntry={selectedQueueRowCatalogEntry}
                    onBack={goHome}
                    onPublished={() => void reloadQueueRowCatalog()}
                />
            </div>
        );
    }

    if (activeNested) {
        const parentRoute = nestedStack.length > 1 ? nestedStack[nestedStack.length - 2]! : null;
        return (
            <div className="process-config-page flex min-h-0 flex-1 flex-col" data-testid="surfaces-configuration-page">
                <NestedSurfaceEditor
                    surfaceId={activeNested.surfaceId}
                    cardLabel={activeNested.cardLabel}
                    parentLabel={parentRoute ? nestedSurfaceLabel(parentRoute.surfaceId) : "Enrollment Focus Panel"}
                    onBack={() => {
                        setNestedStack((prev) => prev.slice(0, -1));
                    }}
                    onDrillInSurface={(surfaceId) => {
                        setNestedStack((prev) => [...prev, { surfaceId }]);
                    }}
                />
            </div>
        );
    }

    if (isFocusPanelEditor) {
        return (
            <div className="process-config-page flex min-h-0 flex-1 flex-col" data-testid="surfaces-configuration-page">
                <FocusPanelSurfaceEditor
                    onBack={goHome}
                    onOpenNestedSurface={(surfaceId, cardLabel) => {
                        setNestedStack([{ surfaceId, cardLabel }]);
                    }}
                />
            </div>
        );
    }

    if (isWorkspaceHeaderEditor) {
        return (
            <div className="process-config-page flex min-h-0 flex-1 flex-col" data-testid="surfaces-configuration-page">
                <WorkspaceHeaderSurfaceEditor onBack={goHome} />
            </div>
        );
    }

    if (isWorkUnitHeaderEditor) {
        return (
            <div className="process-config-page flex min-h-0 flex-1 flex-col" data-testid="surfaces-configuration-page">
                <WorkUnitHeaderSurfaceEditor onBack={goHome} />
            </div>
        );
    }

    if (isWorkspaceProcessEditor && selectedCatalogEntry) {
        return (
            <div className="process-config-page flex min-h-0 flex-1 flex-col" data-testid="surfaces-configuration-page">
                <WorkspaceProcessesSurfaceEditor
                    catalogEntry={selectedCatalogEntry}
                    configuredEntries={configuredCatalogEntries}
                    onBack={goHome}
                    onSelectProcess={setSelectedId}
                    onPublished={() => {
                        setPendingCatalogIds([]);
                        void reloadWorkspaceCatalog();
                    }}
                />
            </div>
        );
    }

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="surfaces-configuration-page">
            <ConfigurationContext
                title="Surfaces"
                subtitle={SURFACES_SUBTITLE}
                actions={contextActions}
                testId="surfaces-configuration-context"
            />

            <ConfigurationShell
                testId="surfaces-configuration-shell"
                queueColumn={
                    <SurfacesCategoryNav
                        sections={sections}
                        activeSection={section}
                        onSelect={setSection}
                    />
                }
                listColumn={
                    <ConfigurationQueue title={activeSectionLabel} testId="surfaces-object-queue">
                        {section === "workspaces" && workspaceCatalogLoading ? (
                            <p className="config-typo-sublabel px-1 py-2">Loading business processes…</p>
                        ) : section === "queue-rows" && queueRowCatalogLoading ? (
                            <p className="config-typo-sublabel px-1 py-2">Loading queue row surfaces…</p>
                        ) : listItems.length === 0 ? (
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
                                    trailing={
                                        item.grain ? (
                                            <span
                                                className="flex-shrink-0 rounded bg-alloy-stone/10 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/50"
                                                title={item.entityType}
                                                data-queue-row-grain={item.grain}
                                            >
                                                {item.grain}
                                            </span>
                                        ) : undefined
                                    }
                                />
                            ))
                        )}
                        {section === "workspaces" && availableToCreate.length > 0 ? (
                            <div className="mt-3 space-y-2 border-t border-alloy-stone/10 pt-3" data-workspace-summary-create>
                                <p className="px-2 text-[11px] font-medium text-alloy-midnight/50">
                                    Add summary for another process
                                </p>
                                {availableToCreate.map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        onClick={() => {
                                            setPendingCatalogIds((prev) =>
                                                prev.includes(entry.id) ? prev : [...prev, entry.id],
                                            );
                                            setSection("workspaces");
                                            setSelectedId(surfaceObjectForCatalogEntry(entry).id);
                                        }}
                                        className="w-full rounded-lg border border-dashed border-alloy-stone/25 px-3 py-2 text-left text-sm font-medium text-alloy-bend-pine hover:border-alloy-bend-pine/40 hover:bg-alloy-bend-pine/[0.04]"
                                        data-create-workspace-summary={entry.id}
                                    >
                                        Create workspace summary · {entry.lifecycle_name}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </ConfigurationQueue>
                }
            >
                {renderWorkspace()}
            </ConfigurationShell>
        </div>
    );
}
