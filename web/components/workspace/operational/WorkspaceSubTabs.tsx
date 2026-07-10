"use client";

const SUB_TAB_ACTIVE_CLASS = "border-b-2 border-alloy-juniper text-alloy-juniper";
const SUB_TAB_INACTIVE_CLASS = "border-b-2 border-transparent text-alloy-midnight/50 hover:text-alloy-midnight/80";

/**
 * Operational Workspace Doctrine V2 — child-section underline tabs (subordinate to mode).
 */
export default function WorkspaceSubTabs<K extends string>({
    tabs,
    activeKey,
    onSelect,
    ariaLabel = "Workspace sections",
    dataAttr,
}: {
    tabs: { key: K; label: string }[];
    activeKey: K;
    onSelect: (key: K) => void;
    ariaLabel?: string;
    /** Optional module-specific data attribute prefix (e.g. comms → data-comms-tab). */
    dataAttr?: string;
}) {
    return (
        <div
            className="-mb-px inline-flex items-center gap-3"
            role="tablist"
            aria-label={ariaLabel}
            data-workspace-sub-tabs="true"
        >
            {tabs.map((tab) => {
                const isOn = activeKey === tab.key;
                const tabDataAttr = dataAttr ? { [`data-${dataAttr}-tab`]: tab.key } : { "data-workspace-sub-tab": tab.key };
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={isOn}
                        {...tabDataAttr}
                        onClick={() => onSelect(tab.key)}
                        className={`px-0.5 pb-1.5 pt-0.5 text-xs font-semibold transition-colors ${
                            isOn ? SUB_TAB_ACTIVE_CLASS : SUB_TAB_INACTIVE_CLASS
                        }`}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
