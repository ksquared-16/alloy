"use client";

import OperationalReadinessGapsPanel from "@/components/admin/completion/OperationalReadinessGapsPanel";
import { DRAWER_REQUIRED_INFORMATION_PANEL_ANCHOR_ID } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

type Props = {
    readiness?: ReadinessResult | null;
    className?: string;
};

/** Optional drawer bootstrap readiness — display-only, non-blocking. */
export function OpportunityDrawerRequiredInformationPanel({ readiness, className = "mb-3" }: Props) {
    if (!readiness) return null;

    return (
        <div id={DRAWER_REQUIRED_INFORMATION_PANEL_ANCHOR_ID} data-drawer-slot="required_information_panel">
            <OperationalReadinessGapsPanel
                readiness={readiness}
                className={className}
                compact={false}
                title="Required Information"
            />
        </div>
    );
}
