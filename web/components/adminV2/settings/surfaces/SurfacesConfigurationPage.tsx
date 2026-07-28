"use client";

/**
 * Surfaces product shell — Category rail → Surface collection → Selected Surface workspace
 * (tabs), same family as Access / Business Processes.
 *
 * Selecting a Surface or clicking Edit never navigates to a detached full-bleed standalone
 * builder. `?editor=1&layout=` is only an optional deep-link that resolves INTO embedded Edit
 * mode inside this shell — the category rail and collection rail stay mounted the whole time.
 */

import {
    ConfigurationDetailCard,
    ConfigurationEmptyState,
    ConfigurationContext,
    ConfigurationQueue,
    ConfigurationQueueItem,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { ConfigWorkspaceCard, ConfigWorkspaceTabBar } from "@/components/adminV2/settings/configurationRuntime/workspace";
import FocusPanelSummarySurfaceEditor from "@/components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor";
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
import {
    SurfaceBuilderChromeProvider,
    useSurfaceBuilderChromeContext,
} from "@/components/adminV2/settings/surfaces/SurfaceBuilderChromeContext";
import { SurfaceEditTabActions } from "@/components/adminV2/settings/surfaces/SurfaceEditTabActions";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState as useReactState } from "react";

import { ADMIN_V2_SETTINGS_PROCESSES_PATH } from "@/lib/adminV2/settings/lifecycleSettingsPaths";
import {
    sectionLabel,
    sectionSubtitle,
    SURFACE_WORKSPACE_DEFAULT_TAB,
    surfaceWorkspaceTabsForSection,
    type SurfaceWorkspaceTab,
} from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";
import SurfaceCommandExposureEditor from "@/components/adminV2/settings/surfaces/SurfaceCommandExposureEditor";
import {
    useSurfacesConfigurationSettings,
    type SurfaceConfigSectionKey,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import { useWorkspaceProcessCatalog } from "@/components/adminV2/settings/surfaces/useWorkspaceProcessCatalog";
import {
    findCatalogEntryBySurfaceId,
    surfaceObjectForCatalogEntry,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessCatalog";
import { SURFACES_LANDING_HREF, surfacesSectionHref } from "@/lib/configRuntime/surfacesLandingModel";

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

export default function SurfacesConfigurationPage(props: {
    initialSection?: SurfaceConfigSectionKey;
    /** Deep-link target (`?layout=`) — selects the Surface without leaving this shell. */
    initialSurfaceId?: string;
    /** Deep-link tab (`?tab=` or `?editor=1` → `edit`). */
    initialTab?: SurfaceWorkspaceTab;
    /**
     * When true (Organization Surfaces drill-in from the category landing), omit the
     * category rail so Collection + Selected workspace get the full width.
     */
    hideCategoryRail?: boolean;
} = {}) {
    return (
        <SurfaceBuilderChromeProvider>
            <SurfacesConfigurationPageInner {...props} />
        </SurfaceBuilderChromeProvider>
    );
}

function SurfacesConfigurationPageInner({
    initialSection,
    initialSurfaceId,
    initialTab,
    hideCategoryRail = false,
}: {
    initialSection?: SurfaceConfigSectionKey;
    initialSurfaceId?: string;
    initialTab?: SurfaceWorkspaceTab;
    hideCategoryRail?: boolean;
} = {}) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const { publicationBySurfaceId } = useSurfaceBuilderChromeContext();
    const [pendingCatalogIds, setPendingCatalogIds] = useReactState<string[]>([]);
    const [search, setSearch] = useReactState("");
    const [tab, setTabState] = useReactState<SurfaceWorkspaceTab>(
        initialTab ?? SURFACE_WORKSPACE_DEFAULT_TAB,
    );
    const [nestedSurfaceId, setNestedSurfaceId] = useReactState<string | null>(null);

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
        openSurface,
        goHome,
        sections,
        listItems,
        selectedObject,
    } = useSurfacesConfigurationSettings(configuredSurfaces, queueRowSurfaces, initialSection);

    const activeSectionLabel = sectionLabel(section);

    /**
     * Persist category / Surface / tab in the query string so Fast Refresh / soft remounts
     * rehydrate the same selection. Never writes `editor=1` — that flag is read-only compat
     * for deep links into Edit.
     */
    const syncSurfacesUrl = (next: {
        section: SurfaceConfigSectionKey;
        surfaceId: string | null;
        tab: SurfaceWorkspaceTab;
    }) => {
        const params = new URLSearchParams();
        params.set("section", next.section);
        if (next.surfaceId) {
            params.set("layout", next.surfaceId);
            if (next.tab !== SURFACE_WORKSPACE_DEFAULT_TAB) params.set("tab", next.tab);
        }
        const qs = params.toString();
        // Always stay under the Organization Surfaces product path (pathname may still be
        // a /settings rewrite during transition — prefer the canonical landing base).
        const base =
            pathname.includes("/surfaces") ? pathname.split("?")[0]! : SURFACES_LANDING_HREF;
        const href = qs ? `${base}?${qs}` : base;
        router.replace(href, { scroll: false });
    };

    const setTab = (next: SurfaceWorkspaceTab) => {
        setTabState(next);
        if (selectedId) {
            syncSurfacesUrl({ section, surfaceId: selectedId, tab: next });
        }
    };

    /** User picked a Surface from the collection rail — open the builder (Edit) immediately. */
    const selectSurface = (id: string, sectionOverride?: SurfaceConfigSectionKey) => {
        openSurface(id);
        setTabState(SURFACE_WORKSPACE_DEFAULT_TAB);
        syncSurfacesUrl({
            section: sectionOverride ?? section,
            surfaceId: id,
            tab: SURFACE_WORKSPACE_DEFAULT_TAB,
        });
    };

    /** Category change clears the selection; next pick opens Edit. */
    const selectSection = (key: SurfaceConfigSectionKey) => {
        setSection(key);
        setTabState(SURFACE_WORKSPACE_DEFAULT_TAB);
        setNestedSurfaceId(null);
        // From a category drill-in, changing category is a product navigation back through
        // the landing tile for that category (keeps hideCategoryRail semantics).
        if (hideCategoryRail) {
            router.push(surfacesSectionHref(key));
            return;
        }
        syncSurfacesUrl({ section: key, surfaceId: null, tab: SURFACE_WORKSPACE_DEFAULT_TAB });
    };

    const clearSelection = () => {
        goHome();
        setTabState(SURFACE_WORKSPACE_DEFAULT_TAB);
        setNestedSurfaceId(null);
        if (hideCategoryRail) {
            router.push(SURFACES_LANDING_HREF);
            return;
        }
        syncSurfacesUrl({ section, surfaceId: null, tab: SURFACE_WORKSPACE_DEFAULT_TAB });
    };

    // Resolves the deep link (`?layout=` / `?tab=` / `?editor=1`) into embedded selection + tab
    // state on first paint AND on same-page query changes (including remounts after Fast Refresh).
    // Prefer `openSurface(layout)` alone when a layout is present — calling `setSection` first
    // would briefly clear `selectedId` and flash the no-selection empty state.
    useEffect(() => {
        const layout = (searchParams.get("layout") ?? initialSurfaceId)?.trim();
        const sectionParam = searchParams.get("section")?.trim() as SurfaceConfigSectionKey | undefined;
        if (layout) {
            openSurface(layout);
            const tabParam = searchParams.get("tab")?.trim();
            if (searchParams.get("editor") === "1") {
                setTabState("edit");
            } else if (
                tabParam &&
                surfaceWorkspaceTabsForSection(section).some((t) => t.key === tabParam)
            ) {
                setTabState(tabParam as SurfaceWorkspaceTab);
            } else if (initialTab) {
                setTabState(initialTab);
            } else {
                setTabState(SURFACE_WORKSPACE_DEFAULT_TAB);
            }
            return;
        }
        if (
            sectionParam === "focus-panels"
            || sectionParam === "queue-rows"
            || sectionParam === "workspaces"
            || sectionParam === "work-units"
            || sectionParam === "operational-intelligence"
        ) {
            setSection(sectionParam);
            setTabState(SURFACE_WORKSPACE_DEFAULT_TAB);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

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

    const boundCatalogEntry = selectedCatalogEntry ?? selectedQueueRowCatalogEntry;

    const previewObject = selectedObject && !selectedObject.editor && (selectedObject.previewHref || selectedObject.liveHref)
        ? selectedObject
        : null;
    const catalogOnly = selectedObject && !selectedObject.editor && !previewObject ? selectedObject : null;

    const filteredListItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return listItems;
        return listItems.filter((item) =>
            `${item.title} ${item.subtitle ?? ""}`.toLowerCase().includes(query),
        );
    }, [listItems, search]);

    const contextActions =
        hideCategoryRail || selectedId ? (
            <button
                type="button"
                data-testid="surfaces-back-home"
                onClick={clearSelection}
                className="rounded-lg border border-alloy-forge/20 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 hover:border-alloy-pine/35 hover:text-alloy-pine"
            >
                {hideCategoryRail ? "All Surfaces" : "Clear selection"}
            </button>
        ) : null;

    function renderNoEditorFallback() {
        if (!selectedObject) return null;
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

        return (
            <ConfigurationEmptyState
                testId="surfaces-workspace-unconfigured"
                title={selectedObject.title}
                description="This surface does not have an editor wired yet."
            />
        );
    }

    function renderEditTab() {
        if (!selectedObject) return null;

        if (selectedObject.editor === "operational-intelligence") {
            return <OperationalIntelligenceSurfaceBuilder />;
        }
        if (selectedObject.editor === "focus-panel-summary") {
            return <FocusPanelSummarySurfaceEditor onBack={clearSelection} />;
        }
        if (selectedObject.editor === "queue-row-builder" && selectedQueueRowCatalogEntry) {
            return (
                <QueueRowSurfaceEditor
                    catalogEntry={selectedQueueRowCatalogEntry}
                    onBack={clearSelection}
                    onPublished={() => void reloadQueueRowCatalog()}
                />
            );
        }
        if (selectedObject.editor === "workspace-header") {
            return <WorkspaceHeaderSurfaceEditor onBack={clearSelection} />;
        }
        if (selectedObject.editor === "work-unit-header") {
            return <WorkUnitHeaderSurfaceEditor onBack={clearSelection} />;
        }
        if (selectedObject.editor === "workspace-processes" && selectedCatalogEntry) {
            return (
                <WorkspaceProcessesSurfaceEditor
                    catalogEntry={selectedCatalogEntry}
                    configuredEntries={configuredCatalogEntries}
                    onBack={clearSelection}
                    onSelectProcess={(id) => openSurface(id)}
                    onPublished={() => {
                        setPendingCatalogIds([]);
                        void reloadWorkspaceCatalog();
                    }}
                />
            );
        }
        if (nestedSurfaceId) {
            return <NestedSurfaceEditor surfaceId={nestedSurfaceId} />;
        }
        return renderNoEditorFallback();
    }

    function renderAssignmentsTab() {
        if (!selectedObject) return null;
        const isOrgSingleton =
            selectedObject.editor === "workspace-header"
            || selectedObject.editor === "work-unit-header"
            || selectedObject.editor === "operational-intelligence";
        return (
            <ConfigWorkspaceCard title="Assignments" testId="surfaces-assignments">
                {boundCatalogEntry ?
                    <div className="space-y-2">
                        <p className="text-sm text-alloy-midnight/70">
                            Bound to <span className="font-semibold text-alloy-midnight">{boundCatalogEntry.lifecycle_name}</span>{" "}
                            ({boundCatalogEntry.department_name}).
                        </p>
                        <Link
                            href={`${ADMIN_V2_SETTINGS_PROCESSES_PATH}?processId=${encodeURIComponent(boundCatalogEntry.id)}`}
                            className="inline-flex text-xs font-medium text-alloy-bend-pine hover:underline"
                            data-testid="surfaces-assignments-open-process"
                        >
                            Open in Processes →
                        </Link>
                    </div>
                : selectedObject.businessProcess ?
                    <p className="text-sm text-alloy-midnight/70">
                        Bound to business process{" "}
                        <span className="font-semibold text-alloy-midnight">{selectedObject.businessProcess}</span>.
                    </p>
                : isOrgSingleton ?
                    <p className="text-sm text-alloy-midnight/55">
                        This is an organization-wide singleton surface — every operator sees the same
                        definition. There is no per-Location or per-process assignment to configure.
                    </p>
                :   <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                        A dedicated Business Process assignment table for this Surface is planned. No
                        assignment is fabricated here.
                    </p>
                }
            </ConfigWorkspaceCard>
        );
    }

    function renderVersionsTab() {
        return (
            <ConfigWorkspaceCard title="Versions" testId="surfaces-versions">
                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                    Version history will appear here when available. Open Edit to see this Surface's own
                    draft / publish status inline.
                </p>
            </ConfigWorkspaceCard>
        );
    }

    function renderHealthTab() {
        return (
            <ConfigWorkspaceCard title="Health" testId="surfaces-health">
                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                    Surface configuration health will list composition and assignment issues here.
                </p>
            </ConfigWorkspaceCard>
        );
    }

    function renderHistoryTab() {
        return (
            <ConfigWorkspaceCard title="History" testId="surfaces-history">
                <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                    A verified change history for this Surface is planned. No events are fabricated for
                    display.
                </p>
            </ConfigWorkspaceCard>
        );
    }

    function renderSelectedWorkspace() {
        if (!selectedObject) {
            return (
                <ConfigurationEmptyState
                    testId="surfaces-no-selection"
                    title="Choose a Surface"
                    description="Select a Surface to open its builder and configure composition, assignments, and publication."
                />
            );
        }

        return (
            <div className="space-y-4" data-testid="surfaces-selected-workspace">
                <section className="process-config-setup-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 className="config-typo-workspace-title text-xl text-alloy-midnight">
                                {selectedObject.title}
                            </h2>
                            <p className="mt-1 text-sm text-alloy-midnight/55">
                                {selectedObject.subtitle ?? activeSectionLabel}
                            </p>
                        </div>
                    </div>
                    <ConfigWorkspaceTabBar
                        tabs={surfaceWorkspaceTabsForSection(section)}
                        activeSection={tab}
                        onSectionChange={setTab}
                        ariaLabel="Surface sections"
                        testIdPrefix="surfaces-tab"
                        trailing={tab === "edit" ? <SurfaceEditTabActions /> : null}
                    />
                </section>

                {tab === "edit" ?
                    <div data-testid="surfaces-edit-tab">{renderEditTab()}</div>
                : tab === "commands" ?
                    <div data-testid="surfaces-commands-tab" className="px-1">
                        <SurfaceCommandExposureEditor
                            section={section}
                            departmentId={selectedObject.departmentId ?? null}
                            processId={selectedObject.processId ?? null}
                            surfaceTitle={selectedObject.title}
                        />
                    </div>
                : tab === "assignments" ?
                    renderAssignmentsTab()
                : tab === "versions" ?
                    renderVersionsTab()
                : tab === "health" ?
                    renderHealthTab()
                :   renderHistoryTab()
                }
            </div>
        );
    }

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="surfaces-configuration-page">
            <ConfigurationContext
                title={hideCategoryRail ? activeSectionLabel : "Surfaces"}
                subtitle={sectionSubtitle(section)}
                actions={contextActions}
                testId="surfaces-configuration-context"
            />

            <ConfigurationShell
                testId="surfaces-configuration-shell"
                queueColumn={
                    hideCategoryRail ? undefined : (
                        <SurfacesCategoryNav
                            sections={sections}
                            activeSection={section}
                            onSelect={selectSection}
                        />
                    )
                }
                listColumn={
                    <ConfigurationQueue title={activeSectionLabel} testId="surfaces-object-queue">
                        <label className="sr-only" htmlFor="surfaces-collection-search">
                            Search {activeSectionLabel}
                        </label>
                        <input
                            id="surfaces-collection-search"
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={`Search ${activeSectionLabel.toLowerCase()}…`}
                            className="config-runtime-input mb-2 w-full"
                            data-testid="surfaces-collection-search"
                        />
                        {section === "workspaces" && workspaceCatalogLoading ? (
                            <p className="config-typo-sublabel px-1 py-2">Loading business processes…</p>
                        ) : section === "queue-rows" && queueRowCatalogLoading ? (
                            <p className="config-typo-sublabel px-1 py-2">Loading queue row surfaces…</p>
                        ) : filteredListItems.length === 0 ? (
                            <p className="config-typo-sublabel px-1 py-2" data-testid="surfaces-empty-list">
                                {listItems.length === 0 ? sectionEmptyListCopy(section) : "No surfaces match your search."}
                            </p>
                        ) : (
                            filteredListItems.map((item) => {
                                const publication = publicationBySurfaceId[item.id];
                                return (
                                <ConfigurationQueueItem
                                    key={item.id}
                                    active={item.id === selectedId}
                                    title={item.title}
                                    subtitle={item.subtitle}
                                    onClick={() => selectSurface(item.id)}
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
                                        ) : publication ? (
                                            <span
                                                className="flex-shrink-0 text-[10px] font-medium text-alloy-pine"
                                                data-testid={`surfaces-object-publication-${item.id}`}
                                            >
                                                {publication}
                                            </span>
                                        ) : undefined
                                    }
                                />
                                );
                            })
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
                                            selectSurface(surfaceObjectForCatalogEntry(entry).id, "workspaces");
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
                {renderSelectedWorkspace()}
            </ConfigurationShell>
        </div>
    );
}
