"use client";

/**
 * Selected-Surface → Overview tab.
 *
 * Presentation-only summary built from `SurfaceConfigObject` + (when available) the bound
 * lifecycle catalog entry. Does not fabricate publication state, version numbers, or assignment
 * data that the underlying editors do not yet expose.
 */

import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace";
import { ConfigurationSecondaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import type {
    SurfaceConfigObject,
    SurfaceConfigSectionKey,
} from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { editorKindLabel, sectionLabel } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";
import type { SurfaceWorkspaceTab } from "@/lib/adminV2/settings/surfaces/surfacesNavigationModel";

export default function SurfacesOverviewPanel({
    section,
    selectedObject,
    catalogEntry,
    onSelectTab,
}: {
    section: SurfaceConfigSectionKey;
    selectedObject: SurfaceConfigObject;
    /** Bound lifecycle catalog entry, when this surface is process-scoped (Workspaces / Queue Rows). */
    catalogEntry?: LifecycleCatalogEntry | null;
    onSelectTab: (tab: SurfaceWorkspaceTab) => void;
}) {
    const editorLabel = editorKindLabel(selectedObject.editor);

    return (
        <div className="grid gap-4 md:grid-cols-2" data-testid="surfaces-overview-panel">
            <ConfigWorkspaceCard title="Surface Snapshot" testId="surfaces-overview-snapshot">
                <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Name</dt>
                        <dd className="font-medium text-alloy-midnight">{selectedObject.title}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Category</dt>
                        <dd className="font-medium text-alloy-midnight">{sectionLabel(section)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Editor</dt>
                        <dd className="font-medium text-alloy-midnight">{editorLabel ?? "Not wired yet"}</dd>
                    </div>
                    {catalogEntry ?
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-alloy-midnight/50">Business Process</dt>
                            <dd className="font-medium text-alloy-midnight">{catalogEntry.lifecycle_name}</dd>
                        </div>
                    :   null}
                </dl>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard title="Composition Summary" testId="surfaces-overview-composition">
                <p className="text-sm text-alloy-midnight/65">
                    {editorLabel ?
                        <>Open Edit to compose this Surface. Uses the {editorLabel}.</>
                    :   <>This surface does not have a composition editor wired yet.</>}
                </p>
                <ConfigurationSecondaryButton className="mt-3" onClick={() => onSelectTab("edit")} data-testid="surfaces-overview-open-edit">
                    Open Edit
                </ConfigurationSecondaryButton>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard title="Used By / Assignments" testId="surfaces-overview-assignments">
                {catalogEntry ?
                    <p className="text-sm text-alloy-midnight/65">
                        Bound to <span className="font-medium text-alloy-midnight">{catalogEntry.lifecycle_name}</span>{" "}
                        ({catalogEntry.department_name}).
                    </p>
                : selectedObject.businessProcess ?
                    <p className="text-sm text-alloy-midnight/65">
                        Bound to business process{" "}
                        <span className="font-medium text-alloy-midnight">{selectedObject.businessProcess}</span>.
                    </p>
                :   <p className="text-sm text-alloy-midnight/55" data-capability="planned">
                        This is an organization-wide singleton surface, or its assignment is not yet
                        exposed here. See Assignments for what is known today.
                    </p>
                }
                <ConfigurationSecondaryButton
                    className="mt-3"
                    onClick={() => onSelectTab("assignments")}
                    data-testid="surfaces-overview-open-assignments"
                >
                    See Assignments
                </ConfigurationSecondaryButton>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard title="Publication" testId="surfaces-overview-publication">
                <p className="text-sm text-alloy-midnight/55">
                    Publication state is managed in Edit — Save draft and Publish live there for this
                    Surface's own editor.
                </p>
            </ConfigWorkspaceCard>

            <ConfigWorkspaceCard title="Health" testId="surfaces-overview-health" className="md:col-span-2">
                <p className="text-sm text-alloy-midnight/55">
                    Review composition and assignment health for this Surface.
                </p>
                <ConfigurationSecondaryButton
                    className="mt-3"
                    onClick={() => onSelectTab("health")}
                    data-testid="surfaces-overview-open-health"
                >
                    Review Health
                </ConfigurationSecondaryButton>
            </ConfigWorkspaceCard>
        </div>
    );
}
