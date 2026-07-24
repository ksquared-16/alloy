"use client";

/**
 * Data Model product shell — Entity selector → selected Entity workspace.
 *
 * There is no Data Model category rail. Fields, Relationships, Statuses, and
 * Option Sets are not destinations; they resolve inside the selected Entity.
 * Operational Calculations remains a quiet deferred compat pane reachable from
 * the context actions, not a peer of the Entity selector.
 */

import { Boxes } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
    ConfigurationContext,
} from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { EntitiesWorkspaceSurface } from "@/components/adminV2/settings/dataModel/entities/EntitiesWorkspaceSurface";
import AnalyticsSettingsClient from "@/app/adminV2/settings/analytics/AnalyticsSettingsClient";
import {
    DATA_MODEL_CALCULATIONS_HREF,
    dataModelEntityHref,
} from "@/lib/dataModel/dataModelChapterRoutes";
import type { DataModelEntitiesWorkspaceLoadResult } from "@/lib/dataModel/loadDataModelEntitiesWorkspaceVm";

const DATA_MODEL_SUBTITLE =
    "Choose an entity to configure the vocabulary, fields, relationships, and statuses Alloy uses for it.";

function CalculationsPane() {
    return (
        <div className="min-h-0 min-w-0 flex-1" data-testid="data-model-calculations-pane">
            <p className="mb-2 text-[11px] text-alloy-midnight/50">
                <Link
                    href={dataModelEntityHref("person")}
                    className="font-medium text-alloy-bend-pine hover:underline"
                    data-testid="data-model-back-to-entities"
                >
                    ← Back to entities
                </Link>
            </p>
            <Suspense fallback={<p className="text-sm text-alloy-midnight/55">Loading Operational Calculations…</p>}>
                <AnalyticsSettingsClient />
            </Suspense>
            <p
                className="mt-3 text-[11px] leading-snug text-alloy-midnight/45"
                data-testid="data-model-calculations-baseline-note"
                data-capability="baseline"
            >
                This pane hosts the existing Operational Calculations experience. The deep product redesign is
                deferred to the next sprint — formula and registry semantics are unchanged.
            </p>
        </div>
    );
}

export default function DataModelWorkspaceSurface({
    mode,
    initialEntity,
    initialTab,
    initialField,
    entitiesLoad,
}: {
    /** `entity` is the primary experience; `calculations` is the deferred compat pane. */
    mode: "entity" | "calculations";
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
                actions={
                    mode === "entity" ?
                        <Link
                            href={DATA_MODEL_CALCULATIONS_HREF}
                            className="text-[11px] font-medium text-alloy-midnight/50 hover:text-alloy-bend-pine hover:underline"
                            data-testid="data-model-calculations-entry"
                        >
                            Operational Calculations
                        </Link>
                    :   null
                }
            />

            {mode === "calculations" ?
                <CalculationsPane />
            : entitiesLoad?.ok ?
                <EntitiesWorkspaceSurface
                    initialVm={entitiesLoad.vm}
                    initialConfigLocked={entitiesLoad.configLocked}
                    initialIndustries={entitiesLoad.industries}
                    initialOrgIndustryId={entitiesLoad.orgIndustryId}
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
