"use client";

/** Communications modal tabs — Alloy action-button style with Bend Pine active state. */
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
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={ariaLabel} data-comms-modal-tabs="true">
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
                        className={
                            isOn
                                ? "rounded-lg border border-alloy-pine/35 bg-alloy-pine px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(0,162,131,0.22)]"
                                : "rounded-lg border border-alloy-stone/25 bg-white px-3 py-1.5 text-xs font-semibold text-alloy-midnight/70 shadow-sm hover:border-alloy-stone/35 hover:bg-alloy-stone/[0.04]"
                        }
                    >
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
