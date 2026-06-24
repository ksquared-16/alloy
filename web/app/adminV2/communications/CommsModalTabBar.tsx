"use client";

import {
    COMMS_BEND_PINE_ACTIVE_TAB_CLASS,
    COMMS_TAB_INACTIVE_CLASS,
    COMMS_TAB_RAIL_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";

/** Communications modal tabs — workspace mode switcher (not action buttons). */
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
        <div className={COMMS_TAB_RAIL_CLASS} role="tablist" aria-label={ariaLabel} data-comms-modal-tabs="true">
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
                        className={isOn ? COMMS_BEND_PINE_ACTIVE_TAB_CLASS : COMMS_TAB_INACTIVE_CLASS}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
