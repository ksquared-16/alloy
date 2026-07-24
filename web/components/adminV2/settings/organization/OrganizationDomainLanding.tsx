"use client";

import {
    Boxes,
    KeyRound,
    LayoutTemplate,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import { CompactConfigurationLauncher } from "@/components/adminV2/settings/configurationRuntime/CompactConfigurationLauncher";
import { CompactGroupedLandingShell } from "@/components/adminV2/settings/configurationRuntime/CompactGroupedLandingShell";
import type { OrganizationDomainLandingModel } from "@/lib/configRuntime/organizationDomainLandingModel";

export type OrganizationDomainLandingIcon = "boxes" | "key-round" | "workflow" | "layout-template";

const ICONS: Record<OrganizationDomainLandingIcon, LucideIcon> = {
    boxes: Boxes,
    "key-round": KeyRound,
    workflow: Workflow,
    "layout-template": LayoutTemplate,
};

/**
 * Grouped organization-domain landing — compact identity + launch grid.
 * Does not render summaryCards / conceptual KPI rows (model field retained for
 * backward compatibility with older landing models).
 */
export default function OrganizationDomainLanding({
    model,
    icon,
    testIdPrefix,
}: {
    model: OrganizationDomainLandingModel;
    icon: OrganizationDomainLandingIcon;
    testIdPrefix: string;
}) {
    const Icon = ICONS[icon];

    return (
        <div data-testid={`${testIdPrefix}-landing-page`}>
            <CompactGroupedLandingShell
                title={model.title}
                titleIcon={<Icon className="h-5 w-5" strokeWidth={2} />}
                testIdPrefix={testIdPrefix}
            >
                <CompactConfigurationLauncher
                    testId={`${testIdPrefix}-launcher`}
                    continuitySurface={`${model.domainKey}_landing`}
                    helper={model.purpose}
                    items={model.tiles.map((tile) => ({
                        id: tile.id,
                        label: tile.label,
                        summary: tile.summary,
                        href: tile.href,
                        includes: tile.capabilities.slice(0, 3),
                    }))}
                />
            </CompactGroupedLandingShell>
        </div>
    );
}
