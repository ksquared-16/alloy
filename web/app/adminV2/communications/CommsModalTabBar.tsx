"use client";

/**
 * Communications child-section tabs — these are sections *inside* the active Work/Studio
 * mode, not peers of it. Rendered as a lighter underline tab strip (not a floating pill
 * group) so they read as subordinate to, and attached beneath, the mode switch.
 */
const COMMS_CHILD_TAB_ACTIVE_CLASS =
    "border-b-2 border-alloy-juniper text-alloy-juniper";
const COMMS_CHILD_TAB_INACTIVE_CLASS =
    "border-b-2 border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/80";

export default function CommsModalTabBar<K extends string>({
    tabs,
    activeKey,
    onSelect,
    "aria-label": ariaLabel = "Communications sections",
}: {
    tabs: { key: K; label: string }[];
    activeKey: K;
    onSelect: (key: K) => void;
    "aria-label"?: string;
}) {
    return (
        <div className="-mb-px inline-flex items-center gap-3" role="tablist" aria-label={ariaLabel} data-comms-modal-tabs="true">
            {tabs.map((tab) => {
                const isOn = activeKey === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isOn}
                        data-comms-tab={tab.key}
                        onClick={() => onSelect(tab.key)}
                        className={`px-0.5 pb-1.5 pt-0.5 text-xs font-semibold transition-colors ${
                            isOn ? COMMS_CHILD_TAB_ACTIVE_CLASS : COMMS_CHILD_TAB_INACTIVE_CLASS
                        }`}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
