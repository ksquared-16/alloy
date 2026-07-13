"use client";

import clsx from "clsx";

import {
    buildHouseholdRelationshipAuthoringTabs,
    type HouseholdRelationshipAuthoringTab,
} from "@/lib/adminV2/runtime/focusPanel/household/householdRelationshipAuthoringTabs";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

export type IdentityRelationshipSectionTabsProps = {
    config: NestedSurfaceConfig;
    activeTabKey: string;
    onSelectTab: (tab: HouseholdRelationshipAuthoringTab) => void;
    className?: string;
};

/** Compact section tabs for disclosure field authoring (not section management). */
export default function IdentityRelationshipSectionTabs({
    config,
    activeTabKey,
    onSelectTab,
    className,
}: IdentityRelationshipSectionTabsProps) {
    const tabs = buildHouseholdRelationshipAuthoringTabs(config);
    return (
        <div
            className={clsx("identity-relationship-section-tabs flex flex-wrap gap-1", className)}
            data-identity-relationship-section-tabs="true"
            role="tablist"
            aria-label="Relationship section"
        >
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    className={clsx(
                        "rounded-md border px-2 py-1 text-[11px]",
                        activeTabKey === tab.key
                            ? "border-alloy-pine/40 bg-alloy-pine/10 text-alloy-midnight"
                            : "border-alloy-stone/15 bg-white text-alloy-midnight/55",
                    )}
                    data-identity-compose-section={tab.key}
                    data-identity-section-tab-kind={tab.kind}
                    aria-selected={activeTabKey === tab.key}
                    onClick={() => onSelectTab(tab)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
