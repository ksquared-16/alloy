"use client";

import DrillInRegionComposer from "@/components/admin/focusPanel/drillIn/DrillInRegionComposer";
import {
    isDomainLockedGroup,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { FINANCIAL_CONFIG_SURFACE_ID } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { groupDefsFor } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

type Props = {
    config: NestedSurfaceConfig;
    onConfigChange: (next: NestedSurfaceConfig) => void;
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[];
};

/**
 * Runtime-shaped Billing / Financial Configuration drill-in composer.
 * Summary groups are configurable; periods and line items remain domain-locked.
 */
export default function FocusPanelBillingDrillInComposer({
    config,
    onConfigChange,
    tenantFieldDefinitions,
}: Props) {
    const summaryKeys = selectedFieldKeys(config, "current_configuration");

    return (
        <div className="drill-in-surface drill-in-surface--billing" data-billing-drill-in-composer="true">
            <div className="drill-in-surface__card">
                <header className="drill-in-surface__card-header">
                    <h2 className="text-base font-semibold text-alloy-midnight">Billing Preview</h2>
                    <p className="text-xs text-alloy-midnight/50">Resolved tuition at a glance</p>
                </header>

                <DrillInRegionComposer
                    surfaceId={FINANCIAL_CONFIG_SURFACE_ID}
                    groupKey="current_configuration"
                    config={config}
                    onConfigChange={onConfigChange}
                    tenantFieldDefinitions={tenantFieldDefinitions}
                    label="Billing Summary"
                >
                    <div className="space-y-2 px-1 py-2">
                        {(summaryKeys.length > 0 ? summaryKeys : ["billing.resolved_total"]).map((key) => (
                            <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="text-alloy-midnight/55">
                                    {key.replace("billing.", "").replace(/_/g, " ")}
                                </span>
                                <span className="font-medium text-alloy-midnight">
                                    {key === "billing.resolved_total" ? "$1,240 / mo" : "—"}
                                </span>
                            </div>
                        ))}
                        <button type="button" className="text-xs font-medium text-alloy-pine">
                            View billing detail →
                        </button>
                    </div>
                </DrillInRegionComposer>

                {groupDefsFor(FINANCIAL_CONFIG_SURFACE_ID)
                    .filter((g) => isDomainLockedGroup(FINANCIAL_CONFIG_SURFACE_ID, g.key))
                    .map((g) => (
                        <DrillInRegionComposer
                            key={g.key}
                            surfaceId={FINANCIAL_CONFIG_SURFACE_ID}
                            groupKey={g.key}
                            config={config}
                            onConfigChange={onConfigChange}
                            label={g.label}
                            domainLocked
                        >
                            <p className="text-[11px] text-alloy-midnight/45 px-1 py-2">{g.purpose}</p>
                        </DrillInRegionComposer>
                    ))}
            </div>
        </div>
    );
}
