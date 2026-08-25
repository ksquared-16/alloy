"use client";

/**
 * Workspace sub-section tabs — sections *inside* the active Work/Studio mode, not peers of it.
 * Rendered as a lighter underline tab strip (not a floating pill group) so they read as subordinate
 * to, and attached beneath, the mode switch.
 *
 * This is the shared Layer-1 shell primitive published as `WorkspaceSubTabs`
 * (see components/workspace/doctrine.ts). Communications, Operations, Digital Mailroom, Work Items
 * and Scheduling all mount it, so nothing here may carry one surface's vocabulary: the DOM contract
 * is `data-workspace-section-tab`, and the accessible name is supplied by the mounting surface.
 * `data-comms-tab-panel` is a DIFFERENT, genuinely Communications-owned attribute and is unrelated.
 */
const SECTION_TAB_ACTIVE_CLASS =
    "border-b-2 border-alloy-juniper text-alloy-juniper";
const SECTION_TAB_INACTIVE_CLASS =
    "border-b-2 border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/80";

export default function CommsModalTabBar<K extends string>({
    tabs,
    activeKey,
    onSelect,
    "aria-label": ariaLabel = "Workspace sections",
}: {
    tabs: { key: K; label: string }[];
    activeKey: K;
    onSelect: (key: K) => void;
    "aria-label"?: string;
}) {
    return (
        <div className="-mb-px inline-flex items-center gap-3" role="tablist" aria-label={ariaLabel} data-workspace-section-tabs="true">
            {tabs.map((tab) => {
                const isOn = activeKey === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isOn}
                        data-workspace-section-tab={tab.key}
                        onClick={() => onSelect(tab.key)}
                        className={`px-0.5 pb-1.5 pt-0.5 text-xs font-semibold transition-colors ${
                            isOn ? SECTION_TAB_ACTIVE_CLASS : SECTION_TAB_INACTIVE_CLASS
                        }`}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
