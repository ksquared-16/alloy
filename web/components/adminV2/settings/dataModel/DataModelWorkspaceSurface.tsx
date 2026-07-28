"use client";

/**
 * Data Model product shell — Entity selector → selected Entity workspace.
 *
 * There is no Data Model category rail. Fields, Relationships, Statuses, and
 * Option Sets are not destinations; they resolve inside the selected Entity.
 *
 * Operational Intelligence is a first-class Organization product at
 * `/organization/operational-intelligence`. Legacy `?section=calculations`
 * deep links redirect there at the page layer — this surface no longer mounts
 * a second editable calculations experience.
 */

import { Boxes } from "lucide-react";
import {
    ConfigurationContext,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { EntitiesWorkspaceSurface } from "@/components/adminV2/settings/dataModel/entities/EntitiesWorkspaceSurface";
import type { DataModelEntitiesWorkspaceLoadResult } from "@/lib/dataModel/loadDataModelEntitiesWorkspaceVm";

const DATA_MODEL_SUBTITLE =
    "Choose an entity to configure the vocabulary, fields, relationships, and statuses Alloy uses for it.";

export default function DataModelWorkspaceSurface({
    mode: _mode,
    initialEntity,
    initialTab,
    initialField,
    entitiesLoad,
}: {
    /** Retained for compatibility with callers; calculations mode redirects at the page. */
    mode?: "entity" | "calculations";
    initialEntity?: string;
    initialTab?: string;
    initialField?: string;
    /** Server-composed Entity VM (collection, selected identity, fields, statuses) — no client waterfall. */
    entitiesLoad?: DataModelEntitiesWorkspaceLoadResult;
}) {
    return (
        <div className="process-config-page min-h-0 flex-1" data-testid="data-model-workspace-surface">
            <ConfigurationContext
                title="Data Model"
                titleIcon={<Boxes className="h-5 w-5" strokeWidth={2} />}
                subtitle={DATA_MODEL_SUBTITLE}
                testId="data-model-configuration-context"
            />

            {entitiesLoad?.ok ?
                <EntitiesWorkspaceSurface
                    initialVm={entitiesLoad.vm}
                    initialConfigLocked={entitiesLoad.configLocked}
                    initialHubKey={initialEntity}
                    initialTab={initialTab}
                    initialField={initialField}
                />
            :   <p className="text-sm text-alloy-midnight/55" data-testid="data-model-entities-unavailable">
                    Entities could not be loaded for this organization.
                </p>
            }
        </div>
    );
}
