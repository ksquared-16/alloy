"use client";

import OperationalReadinessGapsPanel from "@/components/admin/completion/OperationalReadinessGapsPanel";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

type Props = {
    readiness?: ReadinessResult | null;
    className?: string;
};

/** Optional drawer bootstrap readiness — display-only, non-blocking. */
export function OpportunityDrawerRequiredInformationPanel({ readiness, className = "mb-3" }: Props) {
    return (
        <OperationalReadinessGapsPanel
            readiness={readiness}
            className={className}
            compact={false}
            title="Required Information"
        />
    );
}
