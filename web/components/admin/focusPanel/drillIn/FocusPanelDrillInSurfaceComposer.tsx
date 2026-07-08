"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ConfigurationPrimaryButton } from "@/components/adminV2/settings/configurationRuntime/ConfigurationModeLayout";
import { useTenantFieldDefinitions } from "@/lib/adminV2/settings/surfaces/useTenantFieldDefinitions";
import {
    defaultNestedSurfaceConfig,
    nestedSurfaceLabel,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    loadNestedSurfaceConfig,
    saveNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceConfigService";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import { buildOperationalContext } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import FocusPanelHouseholdDrillInComposer from "@/components/admin/focusPanel/drillIn/FocusPanelHouseholdDrillInComposer";
import FocusPanelChildrenDrillInComposer from "@/components/admin/focusPanel/drillIn/FocusPanelChildrenDrillInComposer";
import FocusPanelBillingDrillInComposer from "@/components/admin/focusPanel/drillIn/FocusPanelBillingDrillInComposer";
import {
    CHILDREN_SURFACE_ID,
    FINANCIAL_CONFIG_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type Props = {
    surfaceId: string;
    onBack?: () => void;
};

/**
 * Runtime-shaped drill-in surface composer — replaces detached field-table editors.
 */
export default function FocusPanelDrillInSurfaceComposer({ surfaceId, onBack }: Props) {
    const { tenantFieldDefinitions } = useTenantFieldDefinitions("opportunities");
    const [config, setConfig] = useState<NestedSurfaceConfig>(() => defaultNestedSurfaceConfig(surfaceId));
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [statusNote, setStatusNote] = useState<string | null>(null);

    const { vm, record } = useMemo(() => buildDemoFocusPanelSummaryViewModel(), []);
    const previewContext = useMemo(
        () =>
            buildOperationalContext({
                subjectId: String(vm.entity.id),
                title: vm.header.title,
                subjectVm: vm,
                truth: record,
                perspective: null,
                statusLabel: "Tour scheduled",
                canMutate: false,
            }),
        [vm, record],
    );

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        loadNestedSurfaceConfig(surfaceId)
            .then((c) => {
                if (!cancelled) {
                    setConfig(c);
                    setDirty(false);
                }
            })
            .catch(() => {
                if (!cancelled) setConfig(defaultNestedSurfaceConfig(surfaceId));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [surfaceId]);

    const handleConfigChange = useCallback((next: NestedSurfaceConfig) => {
        setConfig(next);
        setDirty(true);
        setStatusNote(null);
    }, []);

    const handlePublish = useCallback(async () => {
        setPublishing(true);
        setStatusNote(null);
        try {
            await saveNestedSurfaceConfig(surfaceId, config);
            setDirty(false);
            setStatusNote("Published");
        } catch (e) {
            setStatusNote((e as Error).message);
        } finally {
            setPublishing(false);
        }
    }, [surfaceId, config]);

    return (
        <div
            className="flex h-full min-h-0 flex-1 flex-col gap-3 bg-white"
            data-focus-panel-drill-in-composer={surfaceId}
        >
            <div className="process-config-workspace-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-alloy-stone/12 pb-3">
                <div className="flex min-w-0 flex-wrap items-baseline gap-3">
                    {onBack ? (
                        <button
                            type="button"
                            onClick={onBack}
                            className="text-sm font-medium text-alloy-pine hover:underline"
                            data-testid="focus-panel-drill-in-back"
                        >
                            ← Focus Panel
                        </button>
                    ) : null}
                    <span className="config-typo-workspace-title">{nestedSurfaceLabel(surfaceId)}</span>
                    <span className="config-typo-sublabel" data-surface-dirty={dirty ? "true" : "false"}>
                        {dirty ? "Unpublished changes" : "Published"}
                    </span>
                </div>
                <ConfigurationPrimaryButton
                    data-testid="drill-in-surface-publish"
                    onClick={() => void handlePublish()}
                    disabled={publishing || loading}
                >
                    {publishing ? "Publishing…" : "Publish"}
                </ConfigurationPrimaryButton>
            </div>

            {statusNote ? (
                <p className="config-typo-sublabel" data-testid="drill-in-publish-note">
                    {statusNote}
                </p>
            ) : null}

            {loading ? (
                <div className="h-40 animate-pulse rounded-xl border border-alloy-stone/12 bg-alloy-stone/[0.04]" />
            ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                    {surfaceId === HOUSEHOLD_SURFACE_ID ? (
                        <FocusPanelHouseholdDrillInComposer
                            config={config}
                            onConfigChange={handleConfigChange}
                            previewContext={previewContext}
                            tenantFieldDefinitions={tenantFieldDefinitions}
                        />
                    ) : surfaceId === CHILDREN_SURFACE_ID ? (
                        <FocusPanelChildrenDrillInComposer
                            config={config}
                            onConfigChange={handleConfigChange}
                            previewContext={previewContext}
                            tenantFieldDefinitions={tenantFieldDefinitions}
                        />
                    ) : surfaceId === FINANCIAL_CONFIG_SURFACE_ID ? (
                        <FocusPanelBillingDrillInComposer
                            config={config}
                            onConfigChange={handleConfigChange}
                            tenantFieldDefinitions={tenantFieldDefinitions}
                        />
                    ) : (
                        <p className="config-typo-sublabel p-6">No runtime composer for this surface yet.</p>
                    )}
                </div>
            )}
        </div>
    );
}
