"use client";

import clsx from "clsx";
import type { IdentityConfigurationPurpose } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

export const IDENTITY_BUILDER_PURPOSE_LABELS: Record<IdentityConfigurationPurpose, string> = {
    summary: "Summary Fields",
    context_facts: "Context Facts",
    details: "Detail Fields",
    evidence: "Evidence Collections",
};

const PURPOSE_ORDER: IdentityConfigurationPurpose[] = [
    "summary",
    "context_facts",
    "details",
    "evidence",
];

export type IdentityBuilderPurposeNavigationProps = {
    activePurpose: IdentityConfigurationPurpose;
    onSelectPurpose: (purpose: IdentityConfigurationPurpose) => void;
    className?: string;
};

/** Shared Summary → Context Facts → Detail Fields → Evidence purpose navigation. */
export default function IdentityBuilderPurposeNavigation({
    activePurpose,
    onSelectPurpose,
    className,
}: IdentityBuilderPurposeNavigationProps) {
    return (
        <div
            className={clsx("identity-builder-purpose-nav flex flex-wrap gap-1", className)}
            data-identity-builder-purpose-nav="true"
            role="tablist"
            aria-label="Disclosure purpose"
        >
            {PURPOSE_ORDER.map((purpose) => (
                <button
                    key={purpose}
                    type="button"
                    role="tab"
                    className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        activePurpose === purpose
                            ? "bg-alloy-pine/15 text-alloy-pine"
                            : "bg-alloy-stone/10 text-alloy-midnight/45",
                    )}
                    aria-selected={activePurpose === purpose}
                    data-identity-builder-purpose={purpose}
                    onClick={() => onSelectPurpose(purpose)}
                >
                    {IDENTITY_BUILDER_PURPOSE_LABELS[purpose]}
                </button>
            ))}
        </div>
    );
}
