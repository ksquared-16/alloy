"use client";

/**
 * Data Model product shell — Category rail → category collection/workspace.
 *
 * Selecting or editing a Data Model object stays inside this shell. Existing
 * editors are embedded; no detached primary journey. Operational Calculations
 * is shell-only (deep product deferred).
 */

import { Boxes } from "lucide-react";
import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    ConfigurationContext,
    ConfigurationShell,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import EntitiesWorkspaceClient from "@/components/adminV2/settings/entities/EntitiesWorkspaceClient";
import StatusesConfigurationPage from "@/components/adminV2/settings/statuses/StatusesConfigurationPage";
import DataModelWorkspaceClient from "@/app/adminV2/settings/fields/DataModelWorkspaceClient";
import OptionSetsClient from "@/app/legacy-admin/system/option-sets/OptionSetsClient";
import RelationshipsSettingsClient from "@/app/adminV2/settings/relationships/RelationshipsSettingsClient";
import AnalyticsSettingsClient from "@/app/adminV2/settings/analytics/AnalyticsSettingsClient";
import { prepareConfigurationSoftNavTarget } from "@/lib/configRuntime/configurationContinuity";
import {
    DATA_MODEL_WORKSPACE_SECTION_META,
    DATA_MODEL_WORKSPACE_SECTIONS,
    dataModelSectionHref,
    type DataModelWorkspaceSection,
} from "@/lib/dataModel/dataModelChapterRoutes";

const DATA_MODEL_SUBTITLE =
    "Configure the shared vocabulary, fields, statuses, relationships, and derived values used across Alloy.";

function DataModelCategoryNav({
    activeSection,
    onSelect,
}: {
    activeSection: DataModelWorkspaceSection;
    onSelect: (section: DataModelWorkspaceSection) => void;
}) {
    return (
        <nav
            className="configuration-section-queue process-config-nav"
            aria-label="Data Model categories"
            data-testid="data-model-category-rail"
        >
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                Data Model
            </p>
            <div className="space-y-0.5">
                {DATA_MODEL_WORKSPACE_SECTIONS.map((section) => {
                    const active = section === activeSection;
                    const meta = DATA_MODEL_WORKSPACE_SECTION_META[section];
                    return (
                        <button
                            key={section}
                            type="button"
                            onClick={() => onSelect(section)}
                            className={`process-config-nav-item w-full ${
                                active ? "process-config-nav-item--active" : "text-alloy-midnight/75"
                            }`}
                            data-testid={`data-model-category-${section}`}
                            aria-current={active ? "page" : undefined}
                        >
                            <span className={`block text-sm font-semibold ${active ? "text-alloy-pine" : ""}`}>
                                {meta.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

function CategoryPane({
    section,
    initialEntity,
    initialTab,
}: {
    section: DataModelWorkspaceSection;
    initialEntity?: string;
    initialTab?: string;
}) {
    switch (section) {
        case "entities":
            return (
                <div className="min-h-0 min-w-0 flex-1" data-testid="data-model-entities-pane">
                    <EntitiesWorkspaceClient />
                </div>
            );
        case "fields":
            return (
                <div className="min-h-0 min-w-0 flex-1" data-testid="data-model-fields-pane">
                    <DataModelWorkspaceClient initialEntity={initialEntity} initialTab={initialTab} />
                </div>
            );
        case "statuses":
            return (
                <div className="min-h-0 min-w-0 flex-1" data-testid="data-model-statuses-pane">
                    <StatusesConfigurationPage />
                </div>
            );
        case "option-sets":
            return (
                <div className="min-h-0 min-w-0 flex-1" data-testid="data-model-option-sets-pane">
                    {/* Detail deep-links stay on /settings/option-sets/[setKey] until embedded. */}
                    <OptionSetsClient basePath="/settings/option-sets" adminV2Chrome />
                </div>
            );
        case "relationships":
            return (
                <div className="min-h-0 min-w-0 flex-1" data-testid="data-model-relationships-pane">
                    <Suspense fallback={<p className="text-sm text-alloy-midnight/55">Loading relationships…</p>}>
                        <RelationshipsSettingsClient />
                    </Suspense>
                </div>
            );
        case "calculations":
            return (
                <div className="min-h-0 min-w-0 flex-1" data-testid="data-model-calculations-pane">
                    <Suspense
                        fallback={
                            <p className="text-sm text-alloy-midnight/55">Loading Operational Calculations…</p>
                        }
                    >
                        <AnalyticsSettingsClient />
                    </Suspense>
                    <p
                        className="mt-3 text-[11px] leading-snug text-alloy-midnight/45"
                        data-testid="data-model-calculations-baseline-note"
                        data-capability="baseline"
                    >
                        This shell hosts the existing Operational Calculations experience. The deep product
                        redesign is deferred to the next sprint — formula and registry semantics are unchanged.
                    </p>
                </div>
            );
        default:
            return null;
    }
}

export default function DataModelWorkspaceSurface({
    section,
    initialEntity,
    initialTab,
}: {
    section: DataModelWorkspaceSection;
    initialEntity?: string;
    initialTab?: string;
}) {
    const router = useRouter();
    const meta = DATA_MODEL_WORKSPACE_SECTION_META[section];

    useEffect(() => {
        for (const sibling of DATA_MODEL_WORKSPACE_SECTIONS) {
            void prepareConfigurationSoftNavTarget(dataModelSectionHref(sibling), (href) =>
                router.prefetch(href),
            );
        }
    }, [router]);

    const selectSection = (next: DataModelWorkspaceSection) => {
        router.push(dataModelSectionHref(next), { scroll: false });
    };

    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="data-model-workspace-surface">
            <ConfigurationContext
                title="Data Model"
                titleIcon={<Boxes className="h-5 w-5" strokeWidth={2} />}
                subtitle={DATA_MODEL_SUBTITLE}
                testId="data-model-configuration-context"
            />
            <p className="mb-2 text-[11px] text-alloy-midnight/50" data-testid="data-model-active-category">
                {meta.label} — {meta.description}
            </p>
            <ConfigurationShell
                testId="data-model-configuration-shell"
                queueColumn={
                    <DataModelCategoryNav activeSection={section} onSelect={selectSection} />
                }
            >
                <CategoryPane
                    section={section}
                    initialEntity={initialEntity}
                    initialTab={initialTab}
                />
            </ConfigurationShell>
        </div>
    );
}
